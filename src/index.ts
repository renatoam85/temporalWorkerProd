import "dotenv/config";
console.log(`[DEBUG] index.ts Startup: NODE_ENV="${process.env.NODE_ENV}"`);
import { startMcpServer } from "./mcp-server";
import { startWorkers } from "./workers/index";
import { Connection, Client } from "@temporalio/client";
import { parseProcessMarkdown } from "./utils/markdown-parser";
import { QUEUE_ORCHESTRATION, WORKFLOW_TYPE_NAME } from "./types/workflow";
import path from "path";

// Expondo a porta do Temporal
const TEMPORAL_SERVER_ADDRESS = process.env.TEMPORAL_SERVER_IP 
    ? `${process.env.TEMPORAL_SERVER_IP}:7233` 
    : "localhost:7233";

async function main() {
  console.log("==========================================");
  console.log("   INICIALIZANDO APLICAÇÃO ÚNICA (3.0)    ");
  console.log("==========================================");

  // 1. Iniciar os 3 Workers
  console.log("[DEBUG] Chamando startWorkers...");
  const workerPromise = startWorkers(TEMPORAL_SERVER_ADDRESS).catch(err => {
    console.error("[CRITICAL] Falha nos workers:", err);
    process.exit(1);
  });

  // 2. Iniciar o servidor MCP
  console.log("[DEBUG] Chamando startMcpServer...");
  const mcpPromise = startMcpServer().catch(err => {
    console.error("[CRITICAL] Falha no MCP:", err);
    process.exit(1);
  });

  // (Pequeno script de helper para executar o fluxo que criaremos na pasta tempFiles)
  const isDebugRun = process.argv.includes("--test-run");
  if (isDebugRun) {
    console.log("--- DEBUG RUN DETECTADO --- Iniciando Workflow Teste do Markdown");
    setTimeout(async () => {
      try {
         const connection = await Connection.connect({ address: TEMPORAL_SERVER_ADDRESS });
         const client = new Client({ connection });

         const { definition, content } = await parseProcessMarkdown("processo_onboarding_teste_v1.0.0", path.join(process.cwd(), "tempFiles"));

         const workflowIdBase = definition.abreviacao || definition.id;
         const handle = await client.workflow.start(WORKFLOW_TYPE_NAME, {
            args: [definition, content],
            taskQueue: QUEUE_ORCHESTRATION,
            workflowId: `${workflowIdBase}-${Date.now()}`,
            searchAttributes: {
              ProcessName: [definition.id],
              ProcessVersion: [definition.versao]
            }
         });

         console.log(`Workflow iniciado: ${handle.workflowId}`);
      } catch(err: any) {
        console.error("Falha na chamada local de teste.", err.message);
      }
    }, 5000); // 5 segundos apos boot
  }

  // Aguardar que todos tenham rodado (Promessas contínuas em loop)
  console.log("[DEBUG] Aguardando promessas (Promise.all)...");
  await Promise.all([workerPromise, mcpPromise]);
  console.log("[DEBUG] Todas as promessas iniciais resolvidas.");
}

main().catch(err => {
  console.error("Erro fatal na aplicação:", err);
  process.exit(1);
});
