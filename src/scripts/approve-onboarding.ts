import { completeHumanTask } from "../activities/human-task-activities";
import path from "path";
import dotenv from "dotenv";

const PROJECT_ROOT = process.cwd();
dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });

async function run() {
  const workflowId = "onboard-1774129880188";
  const activityId = "2"; // Obtido do state anterior
  const status = "aprovado";
  const data = { nota: "Aprovado automaticamente pelo Agente durante o teste." };

  console.log(`[Teste] Tentando aprovar atividade ${activityId} do workflow ${workflowId}...`);
  
  try {
    await completeHumanTask(workflowId, activityId, status, data);
    console.log("[Teste] Atividade aprovada com sucesso via lógica do MCP Server.");
    process.exit(0);
  } catch (err: any) {
    console.error(`[Teste] Erro ao aprovar atividade: ${err.message}`);
    process.exit(1);
  }
}

run();
