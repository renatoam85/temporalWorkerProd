import { Worker, NativeConnection } from "@temporalio/worker";
import * as orchestrationWorkflows from "../workflows/process-orchestrator";
import { executeHumanTask } from "../activities/executeHumanTask";
import { executeAutomation } from "../activities/executeAutomation";
import { executeWebhook } from "../activities/executeWebhook";
import { executeAIAction } from "../activities/executeAIAction";
import { QUEUE_ORCHESTRATION, QUEUE_HUMAN_TASK, QUEUE_AUTOMATION } from "../types/workflow";
import path from "path";

/**
 * Inicia os 3 workers conforme o design da aplicação única.
 */
export async function startWorkers(temporalAddress: string) {
  
  // O Temporal Worker exige o caminho pro arquivo compilado onde estão os workflows (pela isolação V8)
  const workflowsPath = require.resolve(
    path.join(__dirname, "../workflows", "process-orchestrator.js")
  );

  console.log(`[Worker] Conectando ao Temporal Server em: ${temporalAddress}`);

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

  // 2. Worker de Tarefa Humana (Roda apenas as atividades de Tarefa Humana)
  const humanTaskWorker = await Worker.create({
    connection,
    taskQueue: QUEUE_HUMAN_TASK,
    activities: {
      executeHumanTask
    }
  });

  // 3. Worker de Automação (Roda as atividades de integração, IA nativa, webhooks)
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
    humanTaskWorker.run(),
    automationWorker.run(),
  ]);
}
