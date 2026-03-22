import { proxyActivities, sleep, log, condition, workflowInfo } from "@temporalio/workflow";
import {
  ProcessDefinition,
  WorkflowState,
  ActivityResult,
  QUEUE_HUMAN_TASK_BASE,
  QUEUE_AUTOMATION_BASE,
  WORKFLOW_TYPE_NAME
} from "../types/workflow";

// Mapeamos as atividades que vamos chamar do ponto de vista do Orchestrator
import type * as executeHumanTaskFile from "../activities/executeHumanTask";
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

  // Criação dinâmica dos proxies para apontar para as filas corretas (sandbox-safe)
  const humanTaskActivities = proxyActivities<typeof executeHumanTaskFile>({
    taskQueue: `${QUEUE_HUMAN_TASK_BASE}${suffix}`,
    startToCloseTimeout: "30 days",
  });

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
        // Envia para o humanTaskWorker. 
        // Ele vai adicionar a tarefa a um banco/storage e colocar a PromiseActivity() async em loop
        result = await humanTaskActivities.executeHumanTask({
          processId,
          step,
          state,
          markdownContent
        });

      } else if (step.tipo === "automatizada") {
        result = await automationActivities.executeAutomation({
          processId,
          step,
          state,
          markdownContent
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
          markdownContent
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
