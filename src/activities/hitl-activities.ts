import { AsyncCompletionClient } from "@temporalio/client";
import { JSONFilePreset } from "lowdb/node";

import { 
  ActivityResult, 
  PendingHitlActivity 
} from "../types/workflow";
import path from "path";

// A estrutura do nosso banco.
// db.data.pendingTasks guarda todas as tasks que aguardam serem pegas via MCP
type Data = { pendingTasks: PendingHitlActivity[] };

async function getDb() {
  const dbPath = path.resolve(process.cwd(), "hitl-database.json");
  return JSONFilePreset<Data>(dbPath, { pendingTasks: [] });
}

// -------------------------------------------------------------
// FUNÇÕES UTILITÁRIAS PARA O MCP SERVER (Fora do Contexto Temporal)
// ------------------------------------------------------------- 

export async function getPendingHitlTasks(): Promise<PendingHitlActivity[]> {
  const db = await getDb();
  return db.data.pendingTasks;
}

export async function completeHitlTask(
  workflowExecutionId: string, 
  activityId: string, 
  resultStatus: string, 
  data?: any, 
  errorMsg?: string
): Promise<void> {

  const db = await getDb();
  
  // Encontra qual é
  const index = db.data.pendingTasks.findIndex(
    t => t.activityId === activityId && t.workflowExecutionId === workflowExecutionId
  );

  if (index === -1) {
    throw new Error(`Atividade HITL ${activityId} não encontrada pendente para execução.`);
  }

  // Remove da lista
  db.data.pendingTasks.splice(index, 1);
  await db.write();

  // Acorda o temporal com o completamento. Note que isso pressupõe de o Client estar setado e Temporal estar vivo.
  // Vamos instanciar um Temporal Client novo para completar assincronamente fora do ambiente do Worker.
  const TEMPORAL_SERVER_ADDRESS = process.env.TEMPORAL_SERVER_IP 
      ? `${process.env.TEMPORAL_SERVER_IP}:7233` 
      : "localhost:7233";

  // Usar a biblioteca @temporalio/client
  // Para ser rápido (evitar importar todo a Connection só para completar), assumimos local:
  // Se for Nuvem você vai precisar de Certificados e Chaves. Num MVP local funciona.
  const { Connection } = await import("@temporalio/client");
  const connection = await Connection.connect({ address: TEMPORAL_SERVER_ADDRESS });

  const completionResult: ActivityResult = {
    status: resultStatus,
    data,
    error: errorMsg
  };

  // FORMA CORRETA NO TEMPORAL TS SDK PARA ASYNC COMPLETION SEM TOKEN (Usando IDs):
  const asyncCompletionClient = new AsyncCompletionClient({ connection });
  await asyncCompletionClient.complete(
    { workflowId: workflowExecutionId, activityId: activityId },
    completionResult
  );
}
