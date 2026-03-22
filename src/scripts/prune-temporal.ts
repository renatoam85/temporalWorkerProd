import { Connection, Client } from "@temporalio/client";
import { JSONFilePreset } from "lowdb/node";
import path from "path";
import fs from "fs/promises";
import dotenv from "dotenv";

const PROJECT_ROOT = process.cwd();
dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });

const TEMPORAL_SERVER_ADDRESS = process.env.TEMPORAL_SERVER_IP 
    ? `${process.env.TEMPORAL_SERVER_IP}:7233` 
    : "localhost:7233";

async function prune() {
  console.log(`[Prune] Conectando ao Temporal Server em: ${TEMPORAL_SERVER_ADDRESS}`);
  
  try {
    const connection = await Connection.connect({ address: TEMPORAL_SERVER_ADDRESS });
    const client = new Client({ connection });

    console.log("[Prune] Listando workflows ativos...");
    
    // Lista todos os workflows que não estão fechados
    const executions = client.workflow.list({
      query: 'ExecutionStatus = "Running" OR ExecutionStatus = "TimedOut" OR ExecutionStatus = "Failed" OR ExecutionStatus = "Terminated" OR ExecutionStatus = "ContinuedAsNew"',
    });

    // Na verdade, queremos apenas os "Running" para terminar
    const runningExecutions = client.workflow.list({
      query: 'ExecutionStatus = "Running"',
    });

    let count = 0;
    for await (const execution of runningExecutions) {
      console.log(`[Prune] Terminando workflow: ${execution.workflowId} (RunId: ${execution.runId})`);
      const handle = client.workflow.getHandle(execution.workflowId, execution.runId);
      await handle.terminate("Pruned by cleanup script");
      count++;
    }

    console.log(`[Prune] ${count} workflows terminados.`);

    // Limpar o banco de dados local de tarefas humanas
    console.log("[Prune] Limpando banco de dados local de tarefas humanas...");
    const dbPath = path.resolve(PROJECT_ROOT, "data", "human-tasks-database.json");
    try {
      await fs.writeFile(dbPath, JSON.stringify({ pendingTasks: [] }, null, 2));
      console.log("[Prune] Banco de dados local limpo.");
    } catch (err: any) {
      console.warn(`[Prune] Aviso: Não foi possível limpar o banco de dados local: ${err.message}`);
    }

    console.log("[Prune] Concluído com sucesso.");
    process.exit(0);
  } catch (err: any) {
    console.error(`[Prune] Erro fatal: ${err.message}`);
    process.exit(1);
  }
}

prune();
