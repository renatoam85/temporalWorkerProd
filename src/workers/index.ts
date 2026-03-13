import { Worker, NativeConnection } from "@temporalio/worker";
import * as orchestrationWorkflows from "../workflows/process-orchestrator";
import { executeHitlTask } from "../activities/executeHitlTask";
import { executeAutomation } from "../activities/executeAutomation";
import { executeWebhook } from "../activities/executeWebhook";
import { QUEUE_ORCHESTRATION, QUEUE_HITL, QUEUE_AUTOMATION } from "../types/workflow";
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

  // 2. Worker HITL (Roda apenas as atividades de HITL)
  const hitlWorker = await Worker.create({
    connection,
    taskQueue: QUEUE_HITL,
    activities: {
      executeHitlTask
    }
  });

  // 3. Worker de Automação (Roda as atividades de integração, IA nativa, webhooks)
  const automationWorker = await Worker.create({
    connection,
    taskQueue: QUEUE_AUTOMATION,
    activities: {
      executeAutomation,
      executeWebhook
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
