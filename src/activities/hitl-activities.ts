import { AsyncCompletionClient } from "@temporalio/client";
import { JSONFilePreset } from "lowdb/node";

import { 
  ActivityResult, 
  PendingHitlActivity 
} from "../types/workflow";
import path from "path";

// Raiz do projeto: process.cwd() funciona tanto em dev (tsx) quanto em Docker (WORKDIR /app)
const PROJECT_ROOT = process.cwd();

// A estrutura do nosso banco.
// db.data.pendingTasks guarda todas as tasks que aguardam serem pegas via MCP
type Data = { pendingTasks: PendingHitlActivity[] };

async function getDb() {
  const dbPath = path.resolve(PROJECT_ROOT, "data", "hitl-database.json");
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

  // PRIMEIRO: Sinalizar o Temporal com o resultado ANTES de remover do banco.
  // Se falhar, a task permanece no banco e pode ser retentada.
  const TEMPORAL_SERVER_ADDRESS = process.env.TEMPORAL_SERVER_IP 
      ? `${process.env.TEMPORAL_SERVER_IP}:7233` 
      : "localhost:7233";

  const { Connection } = await import("@temporalio/client");
  const connection = await Connection.connect({ address: TEMPORAL_SERVER_ADDRESS });

  const completionResult: ActivityResult = {
    status: resultStatus,
    data,
    error: errorMsg
  };

  try {
    const asyncCompletionClient = new AsyncCompletionClient({ connection });
    await asyncCompletionClient.complete(
      { workflowId: workflowExecutionId, activityId: activityId },
      completionResult
    );
  } catch (err: any) {
    throw new Error(
      `Falha ao sinalizar orquestrador para a atividade ${activityId} do processo ${workflowExecutionId}. ` +
      `A atividade permanece pendente na lista. Detalhes: ${err.message}`
    );
  }

  // SOMENTE APÓS sucesso no Temporal: remover da lista local
  db.data.pendingTasks.splice(index, 1);
  await db.write();
}
