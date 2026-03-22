import { Worker, NativeConnection } from "@temporalio/worker";
import * as orchestrationWorkflows from "../workflows/process-orchestrator";
import { executeAutomation } from "../activities/executeAutomation";
import { executeWebhook } from "../activities/executeWebhook";
import { executeAIAction } from "../activities/executeAIAction";
  import { 
    QUEUE_ORCHESTRATION, 
    QUEUE_AUTOMATION,
    WORKFLOW_TYPE_NAME 
  } from "../types/workflow";
  import path from "path";
  
  /**
   * Inicia os 3 workers conforme o design da aplicação única.
   */
export async function startWorkers(temporalAddress: string) {
  const isProd = process.env.NODE_ENV === "production";
  const workflowsFileName = isProd ? "prod-orchestrator" : "test-orchestrator";
  
  const workflowsPath = require.resolve(
    path.join(__dirname, "../workflows", workflowsFileName)
  );

  console.log(`[Worker] Conectando ao Temporal Server em: ${temporalAddress}`);
  console.log(`[Worker] Carregando workflows de: ${workflowsPath}`);

  // Cria a conexão nativa
  const connection = await NativeConnection.connect({
    address: temporalAddress,
  });

  // 1. Worker de Orquestração (Roda apenas o Workflow)
  const orchestrationWorker = await Worker.create({
    connection,
    workflowsPath,
    taskQueue: QUEUE_ORCHESTRATION,
  });

  // 2. Worker de Automação (Roda as atividades de integração, IA nativa, webhooks)
  const automationWorker = await Worker.create({
    connection,
    taskQueue: QUEUE_AUTOMATION,
    activities: {
      executeAutomation,
      executeWebhook,
      executeAIAction
    }
  });

  console.log("[Worker] Todos os Workers criados. Iniciando o run()...");

  // Roda todos simultaneamente
  await Promise.all([
    orchestrationWorker.run(),
    automationWorker.run(),
  ]);
}
