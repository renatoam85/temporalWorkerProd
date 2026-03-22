import { proxyActivities, log, condition, workflowInfo, setHandler, upsertSearchAttributes } from "@temporalio/workflow";
import {
  ProcessDefinition,
  WorkflowState,
  ActivityResult,
  QUEUE_AUTOMATION_BASE,
  WORKFLOW_TYPE_NAME,
  humanTaskSignal,
  getCurrentStateQuery
} from "../types/workflow";

// Mapeamos as atividades que vamos chamar do ponto de vista do Orchestrator
import type * as executeAutomationFile from "../activities/executeAutomation";
import type * as executeWebhookFile from "../activities/executeWebhook";
import type * as executeAIActionFile from "../activities/executeAIAction";

/**
 * Workflow principal: Determina quais atividades a orquestração deve chamar
 * puramente baseado no processo de notação e definição lida.
 */
async function processOrchestratorImpl(
  processDefinition: ProcessDefinition,
  markdownContent: string,
  initialData?: any
): Promise<WorkflowState> {
  const { workflowType, workflowId } = workflowInfo();

  log.info(`[DEBUG] Check Ambiente: ID=${workflowId}, Type=${workflowType}, Worker Espera=${WORKFLOW_TYPE_NAME}`);

  // Segurança: Garante que estamos rodando um dos tipos conhecidos.
  const allowedTypes = ["Processo", "Processo_teste"];
  if (!allowedTypes.includes(workflowType)) {
    log.error(`[CRITICAL] Violacão de ambiente: Tipo de workflow '${workflowType}' não reconhecido.`);
    throw new Error(`Violacão de ambiente: Tipo de workflow '${workflowType}' não reconhecido.`);
  }

  // Define sufixo dinamicamente baseado no tipo de workflow real logado no Temporal
  const suffix = (workflowType === "Processo_teste") ? "-teste" : "";

  const automationActivities = proxyActivities<typeof executeAutomationFile & typeof executeWebhookFile & typeof executeAIActionFile>({
    taskQueue: `${QUEUE_AUTOMATION_BASE}${suffix}`,
    startToCloseTimeout: "5 minutes",
    retry: {
      initialInterval: "1s",
      backoffCoefficient: 2,
      maximumAttempts: 20,
    },
  });

  const { id: processId, steps, passo_inicial } = processDefinition;

  log.info(`Iniciando orquestração determinística do Processo: ${processId} a partir do step ${passo_inicial}`);

  const state: WorkflowState = {
    process_id: processId,
    current_step: passo_inicial,
    history: {},
    is_completed: false
  };

  // [NOVO] Registrar query handler para expor estado ao MCP em tempo real
  let currentMarkdownContent = markdownContent;
  setHandler(getCurrentStateQuery, () => ({
    state,
    markdownContent: currentMarkdownContent
  }));

  // [NOVO] Registrar signal handler para receber conclusão de tarefas humanas
  let pendingSignalResult: ActivityResult | null = null;
  setHandler(humanTaskSignal, (result: ActivityResult) => {
    log.info(`Signal recebido para a tarefa humana: status=${result.status}`);
    pendingSignalResult = result;
  });

  // Se o processo foi startado com algum dado já pre-existente,
  // inserimos na history apenas para que os steps o obtenham.
  if (initialData) {
    state.history['__initial_data'] = {
      status: 'sucesso',
      data: initialData
    };
  }

  while (!state.is_completed) {
    const step = steps[state.current_step];

    if (!step) {
      log.error(`Step não encontrado na definição: ${state.current_step}. Finalizando fallback...`);
      state.is_completed = true;
      break;
    }

    let result: ActivityResult;
    try {
      log.info(`[Step: ${step.id}] Navegando tipo: ${step.tipo} para o Processo: ${processId} (Fila alvo em andamento...)`);

      // Decisão Condicional sobre QUAL Atividade de QUAL Worker chamar
      if (step.tipo === "tarefa_humana" || step.tipo === "tarefa_agente") {
        // [NOVO] Utiliza Signal + Search Attributes em vez de atividade externa
        log.info(`[Step: ${step.id}] Aguardando intervenção humana via Signal...`);
        
        // Marca o workflow como aguardando tarefa humana via Search Attribute
        await upsertSearchAttributes({ StepAfterSignal: [step.id] });

        try {
          // Aguarda o signal (timeout de 30 dias para intervenção humana)
          pendingSignalResult = null;
          await condition(() => pendingSignalResult !== null, "30 days");

          if (!pendingSignalResult) {
            throw new Error(`Timeout de 30 dias atingido aguardando signal para o step ${step.id}`);
          }

          result = pendingSignalResult;
        } finally {
          // [REFINAMENTO] Limpa o search attribute após a conclusão ou erro/timeout
          await upsertSearchAttributes({ StepAfterSignal: [''] });
        }

      } else if (step.tipo === "automatizada") {
        result = await automationActivities.executeAutomation({
          processId,
          step,
          state,
          markdownContent: currentMarkdownContent
        });

      } else if (step.tipo === "webhook") {
        result = await automationActivities.executeWebhook({
          step,
          state
        });
      } else if (step.tipo === "executar_com_ia") {
        result = await automationActivities.executeAIAction({
          processId,
          step,
          state,
          markdownContent: currentMarkdownContent
        });
      } else {
        throw new Error(`Tipo de atividade desconhecido: ${step.tipo}`);
      }

    } catch (error: any) {
      log.warn(`Erro na execução do step ${step.id}: ${error.message}`);
      // Lógica de lidar com falha no passo, caso ele não retorne Exception, mas Status.
      // O Retry da Task Queue vai contornar exceções não tratadas nas `Activities` naturalmente, 
      // mas se chegar no Exception aqui é porque as retentativas acabaram ou era um erro fatal
      result = {
        status: "fatal_error",
        error: error.message
      };
    }

    // Grava resultado do step atual 
    state.history[step.id] = result;

    // Avalia regra de navegação para decidir o próximo State
    let nextStepId = step.navegacao[result.status];

    // Se não encontrou do status específico e há um "padrao" mapping na definição de navegação
    if (!nextStepId && step.navegacao["padrao"]) {
      nextStepId = step.navegacao["padrao"];
    }

    // Se as regras de navegação determinam "finalizado" (palavra chave reservada)
    if (nextStepId === "finalizado" || !nextStepId) {
      log.info(`[Step: ${step.id}] Regra de navegação retornou finalizar. Status atual: ${result.status}`);
      state.is_completed = true;
      break;
    }

    // Caso contrário, atribui novo step para o loop continuar
    state.current_step = nextStepId;
    log.info(`Próximo step a executar: ${state.current_step}`);
  }

  log.info(`Orquestração Finalizada. Process: ${processId}`);
  return state;
}

export { processOrchestratorImpl };
