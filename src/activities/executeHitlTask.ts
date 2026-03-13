import { Context } from "@temporalio/activity";
import { JSONFilePreset } from "lowdb/node";
import path from "path";
import { 
  ProcessStep, 
  WorkflowState, 
  ActivityResult, 
  PendingHitlActivity 
} from "../types/workflow";

// Estrutura do banco local para HITL
type Data = { pendingTasks: PendingHitlActivity[] };

async function getDb() {
  const dbPath = path.resolve(process.cwd(), "hitl-database.json");
  return JSONFilePreset<Data>(dbPath, { pendingTasks: [] });
}

/**
 * Atividade principal HITL: Persiste a tarefa e dorme aguardando completamento externo via MCP.
 */
export async function executeHitlTask({
  processId,
  step,
  state,
  markdownContent
}: {
  processId: string,
  step: ProcessStep,
  state: WorkflowState,
  markdownContent: string
}): Promise<ActivityResult> {

  const db = await getDb();
  const info = Context.current().info;

  // Guard: evita duplicatas caso o Temporal re-execute a activity
  const alreadyExists = db.data.pendingTasks.some(
    t => t.activityId === info.activityId && t.workflowExecutionId === info.workflowExecution.workflowId
  );

  if (!alreadyExists) {
    const pendingTask: PendingHitlActivity = {
      activityId: info.activityId,
      workflowExecutionId: info.workflowExecution.workflowId, 
      processId,
      stepId: step.id,
      type: step.tipo as "hitl_humano" | "hitl_agente",
      context: state,
      markdownContent,
      createdAt: new Date().toISOString()
    };

    db.data.pendingTasks.push(pendingTask);
    await db.write();
  }

  // 7 dias = 604_800_000 ms (dentro do limite de 32-bit signed int: 2_147_483_647)
  throw Context.current().sleep("7 days");
}
