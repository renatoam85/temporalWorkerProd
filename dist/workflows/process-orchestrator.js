"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ORCHESTRATION_QUEUE = void 0;
exports.processOrchestrator = processOrchestrator;
const workflow_1 = require("@temporalio/workflow");
const workflow_2 = require("../types/workflow");
// O Workflow precisa de duas proxies para conversar com filas diferentes
const hitlActivities = (0, workflow_1.proxyActivities)({
    taskQueue: workflow_2.QUEUE_HITL,
    startToCloseTimeout: "30 days", // Hitl pode demorar bastantes dias para ser retornado
});
const automationActivities = (0, workflow_1.proxyActivities)({
    taskQueue: workflow_2.QUEUE_AUTOMATION,
    startToCloseTimeout: "5 minutes", // Automações devem rodar de forma síncrona/rápida 
    retry: {
        initialInterval: "1s",
        backoffCoefficient: 2,
        maximumAttempts: 3,
    },
});
exports.ORCHESTRATION_QUEUE = "orchestration-queue";
/**
 * Workflow principal: Determina quais atividades a orquestração deve chamar
 * puramente baseado no processo de notação e definição lida.
 */
async function processOrchestrator(processDefinition, markdownContent, initialData) {
    const { id: processId, steps, initial_step } = processDefinition;
    workflow_1.log.info(`Iniciando orquestração determinística do Processo: ${processId} a partir do step ${initial_step}`);
    const state = {
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
            workflow_1.log.error(`Step não encontrado na definição: ${state.current_step}. Finalizando fallback...`);
            state.is_completed = true;
            break;
        }
        let result;
        try {
            workflow_1.log.info(`[Step: ${step.id}] Navegando tipo: ${step.tipo} (Fila alvo em andamento...)`);
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
            }
            else if (step.tipo === "automatizada") {
                result = await automationActivities.executeAutomation({
                    processId,
                    step,
                    state,
                    markdownContent
                });
            }
            else if (step.tipo === "webhook") {
                result = await automationActivities.executeWebhook({
                    step,
                    state
                });
            }
            else {
                throw new Error(`Tipo de atividade desconhecido: ${step.tipo}`);
            }
        }
        catch (error) {
            workflow_1.log.warn(`Erro na execução do step ${step.id}: ${error.message}`);
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
            workflow_1.log.info(`[Step: ${step.id}] Regra de navegação retornou finalizar. Status atual: ${result.status}`);
            state.is_completed = true;
            break;
        }
        // Caso contrário, atribui novo step para o loop continuar
        state.current_step = nextStepId;
        workflow_1.log.info(`Próximo step a executar: ${state.current_step}`);
    }
    workflow_1.log.info(`Orquestração Finalizada. Process: ${processId}`);
    return state;
}
