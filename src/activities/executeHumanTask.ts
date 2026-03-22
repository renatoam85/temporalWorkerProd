import { Context } from "@temporalio/activity";
import { JSONFilePreset } from "lowdb/node";
import path from "path";
import { 
  ProcessStep, 
  WorkflowState, 
  ActivityResult, 
  PendingHumanTask,
  HUMAN_TASKS_DB_FILENAME
} from "../types/workflow";

// Estrutura do banco local para Tarefas Humanas
type Data = { pendingTasks: PendingHumanTask[] };

async function getDb() {
  const dbPath = path.resolve(process.cwd(), "data", HUMAN_TASKS_DB_FILENAME);
  return JSONFilePreset<Data>(dbPath, { pendingTasks: [] });
}

/**
 * Atividade principal de Tarefa Humana: Persiste a tarefa e dorme aguardando completamento externo via MCP.
 */
export async function executeHumanTask({
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
    console.log(`[DEBUG] executeHumanTask: NODE_ENV="${process.env.NODE_ENV}", DB="${HUMAN_TASKS_DB_FILENAME}"`);
    const isProd = process.env.NODE_ENV === "production";
    const pendingTask: PendingHumanTask = {
      activityId: info.activityId,
      workflowExecutionId: info.workflowExecution.workflowId, 
      workflowType: info.workflowType,
      envMode: isProd ? "produção" : "teste",
      processId,
      stepId: step.id,
      type: step.tipo as "tarefa_humana" | "tarefa_agente",
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
