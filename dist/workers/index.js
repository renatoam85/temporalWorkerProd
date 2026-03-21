"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWorkers = startWorkers;
const worker_1 = require("@temporalio/worker");
const executeHitlTask_1 = require("../activities/executeHitlTask");
const executeAutomation_1 = require("../activities/executeAutomation");
const executeWebhook_1 = require("../activities/executeWebhook");
const workflow_1 = require("../types/workflow");
const path_1 = __importDefault(require("path"));
/**
 * Inicia os 3 workers conforme o design da aplicação única.
 */
async function startWorkers(temporalAddress) {
    // O Temporal Worker exige o caminho pro arquivo compilado onde estão os workflows (pela isolação V8)
    const workflowsPath = require.resolve(path_1.default.join(__dirname, "../workflows", "process-orchestrator.js"));
    console.log(`[Worker] Conectando ao Temporal Server em: ${temporalAddress}`);
    // Cria a conexão nativa
    const connection = await worker_1.NativeConnection.connect({
        address: temporalAddress,
    });
    // 1. Worker de Orquestração (Roda apenas o Workflow)
    const orchestrationWorker = await worker_1.Worker.create({
        connection,
        workflowsPath,
        taskQueue: workflow_1.QUEUE_ORCHESTRATION,
    });
    // 2. Worker HITL (Roda apenas as atividades de HITL)
    const hitlWorker = await worker_1.Worker.create({
        connection,
        taskQueue: workflow_1.QUEUE_HITL,
        activities: {
            executeHitlTask: executeHitlTask_1.executeHitlTask
        }
    });
    // 3. Worker de Automação (Roda as atividades de integração, IA nativa, webhooks)
    const automationWorker = await worker_1.Worker.create({
        connection,
        taskQueue: workflow_1.QUEUE_AUTOMATION,
        activities: {
            executeAutomation: executeAutomation_1.executeAutomation,
            executeWebhook: executeWebhook_1.executeWebhook
        }
    });
    console.log("[Worker] Todos os Workers criados. Iniciando o run()...");
    // Roda todos simultaneamente
    await Promise.all([
        orchestrationWorker.run(),
        hitlWorker.run(),
        automationWorker.run(),
    ]);
}
