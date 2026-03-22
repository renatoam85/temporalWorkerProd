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

    console.log("[Prune] Listando todos os workflows...");
    
    // Lista todos os workflows
    const allExecutions = client.workflow.list();

    let count = 0;
    for await (const execution of allExecutions) {
      console.log(`[Prune] Excluindo workflow: ${execution.workflowId} (RunId: ${execution.runId}) - Status: ${execution.status.name}`);
      const handle = client.workflow.getHandle(execution.workflowId, execution.runId);
      try {
        // Tenta excluir permanentemente usando a API de serviço
        await client.workflowService.deleteWorkflowExecution({
          namespace: 'default',
          workflowExecution: {
            workflowId: execution.workflowId,
            runId: execution.runId,
          },
        });
        count++;
      } catch (err: any) {
        // Se falhar (ex: servidor muito antigo), tenta ao menos terminar se estiver rodando
        if (execution.status.name === 'RUNNING') {
          console.warn(`[Prune] Falha ao excluir ${execution.workflowId}: ${err.message}. Tentando apenas terminar.`);
          const handle = client.workflow.getHandle(execution.workflowId, execution.runId);
          await handle.terminate("Pruned by cleanup script");
        } else {
          console.warn(`[Prune] Falha ao excluir ${execution.workflowId} (status: ${execution.status.name}): ${err.message}`);
        }
      }
    }

    console.log(`[Prune] ${count} workflows excluídos.`);

    // Limpar o banco de dados local de tarefas humanas
    console.log("[Prune] Limpando bancos de dados locais de tarefas humanas...");
    const dbPaths = [
      path.resolve(PROJECT_ROOT, "data", "human-tasks-database.json"),
      path.resolve(PROJECT_ROOT, "data", "human-tasks-database-teste.json")
    ];

    for (const dbPath of dbPaths) {
      try {
        await fs.writeFile(dbPath, JSON.stringify({ pendingTasks: [] }, null, 2));
        console.log(`[Prune] Banco de dados local limpo: ${path.basename(dbPath)}`);
      } catch (err: any) {
        console.warn(`[Prune] Aviso: Não foi possível limpar o banco de dados ${path.basename(dbPath)}: ${err.message}`);
      }
    }

    console.log("[Prune] Concluído com sucesso.");
    process.exit(0);
  } catch (err: any) {
    console.error(`[Prune] Erro fatal: ${err.message}`);
    process.exit(1);
  }
}

prune();
