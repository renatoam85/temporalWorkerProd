import { proxyActivities, sleep, log, condition } from "@temporalio/workflow";
import { 
  ProcessDefinition, 
  WorkflowState, 
  ActivityResult, 
  QUEUE_HITL, 
  QUEUE_AUTOMATION 
} from "../types/workflow";

// Mapeamos as atividades que vamos chamar do ponto de vista do Orchestrator
import type * as executeHitlTaskFile from "../activities/executeHitlTask";
import type * as executeAutomationFile from "../activities/executeAutomation";
import type * as executeWebhookFile from "../activities/executeWebhook";

// O Workflow precisa de duas proxies para conversar com filas diferentes
const hitlActivities = proxyActivities<typeof executeHitlTaskFile>({
  taskQueue: QUEUE_HITL,
  startToCloseTimeout: "30 days", // Hitl pode demorar bastantes dias para ser retornado
});

const automationActivities = proxyActivities<typeof executeAutomationFile & typeof executeWebhookFile>({
  taskQueue: QUEUE_AUTOMATION,
  startToCloseTimeout: "5 minutes", // Automações devem rodar de forma síncrona/rápida 
  retry: {
    initialInterval: "1s",
    backoffCoefficient: 2,
    maximumAttempts: 3,
  },
});

export const ORCHESTRATION_QUEUE = "orchestration-queue";

/**
 * Workflow principal: Determina quais atividades a orquestração deve chamar
 * puramente baseado no processo de notação e definição lida.
 */
export async function processOrchestrator(
  processDefinition: ProcessDefinition, 
  markdownContent: string,
  initialData?: any
): Promise<WorkflowState> {
  const { id: processId, steps, initial_step } = processDefinition;

  log.info(`Iniciando orquestração determinística do Processo: ${processId} a partir do step ${initial_step}`);

  const state: WorkflowState = {
    process_id: processId,
    current_step: initial_step,
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
      log.info(`[Step: ${step.id}] Navegando tipo: ${step.tipo} (Fila alvo em andamento...)`);

      // Decisão Condicional sobre QUAL Atividade de QUAL Worker chamar
      if (step.tipo === "hitl_humano" || step.tipo === "hitl_agente") {
        // Envia para o hitlWorker. 
        // Ele vai adicionar a tarefa a um banco/storage e colocar a PromiseActivity() async em loop
        result = await hitlActivities.executeHitlTask({
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
    
    // Se não encontrou do status específico e há um "default" mapping na definição de navegação do Notion
    if (!nextStepId && step.navegacao["default"]) {
      nextStepId = step.navegacao["default"];
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
