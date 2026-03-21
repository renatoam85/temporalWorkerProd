"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const mcp_server_1 = require("./mcp-server");
const index_1 = require("./workers/index");
const client_1 = require("@temporalio/client");
const markdown_parser_1 = require("./utils/markdown-parser");
const process_orchestrator_1 = require("./workflows/process-orchestrator");
const path_1 = __importDefault(require("path"));
// Expondo a porta do Temporal
const TEMPORAL_SERVER_ADDRESS = process.env.TEMPORAL_SERVER_IP
    ? `${process.env.TEMPORAL_SERVER_IP}:7233`
    : "localhost:7233";
async function main() {
    console.log("==========================================");
    console.log("   INICIALIZANDO APLICAÇÃO ÚNICA (3.0)    ");
    console.log("==========================================");
    // 1. Iniciar os 3 Workers
    const workerPromise = (0, index_1.startWorkers)(TEMPORAL_SERVER_ADDRESS).catch(err => {
        console.error("Falha ao iniciar os workers do Temporal:", err);
    });
    // 2. Iniciar o servidor MCP
    const mcpPromise = (0, mcp_server_1.startMcpServer)().catch(err => {
        console.error("Falha ao iniciar o Servidor MCP:", err);
    });
    // Aguardar que todos tenham rodado (Promessas contínuas em loop)
    // Mas não vamos parar o main.
    console.log("\nAbrimos também um endpoint de utilidade para rodar um fluxo...");
    // (Pequeno script de helper para executar o fluxo que criaremos na pasta tempFiles)
    const isDebugRun = process.argv.includes("--test-run");
    if (isDebugRun) {
        console.log("--- DEBUG RUN DETECTADO --- Iniciando Workflow Teste do Markdown");
        setTimeout(async () => {
            try {
                const connection = await client_1.Connection.connect({ address: TEMPORAL_SERVER_ADDRESS });
                const client = new client_1.Client({ connection });
                const { definition, content } = await (0, markdown_parser_1.parseProcessMarkdown)("processo_onboarding_teste_v1.0.0", path_1.default.join(process.cwd(), "tempFiles"));
                const workflowIdBase = definition.abreviacao || definition.id;
                const handle = await client.workflow.start("processOrchestrator", {
                    args: [definition, content],
                    taskQueue: process_orchestrator_1.ORCHESTRATION_QUEUE,
                    workflowId: `${workflowIdBase}-${Date.now()}`,
                    searchAttributes: {
                        ProcessName: [definition.id],
                        ProcessVersion: [definition.version]
                    }
                });
                console.log(`Workflow iniciado: ${handle.workflowId}`);
            }
            catch (err) {
                console.error("Falha na chamada local de teste.", err.message);
            }
        }, 5000); // 5 segundos apos boot
    }
}
main().catch(err => {
    console.error("Erro fatal na aplicação:", err);
    process.exit(1);
});
