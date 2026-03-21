"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMcpServer = createMcpServer;
exports.startMcpServer = startMcpServer;
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const sse_js_1 = require("@modelcontextprotocol/sdk/server/sse.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
// Raiz do projeto: process.cwd() funciona tanto em dev (tsx) quanto em Docker (WORKDIR /app)
const PROJECT_ROOT = process.cwd();
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: path_1.default.join(PROJECT_ROOT, ".env") });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const hitl_activities_1 = require("./activities/hitl-activities");
const client_1 = require("@temporalio/client");
const markdown_parser_1 = require("./utils/markdown-parser");
const process_orchestrator_1 = require("./workflows/process-orchestrator");
const MCP_PORT = Number(process.env.MCP_PORT) || 3100;
const TEMPORAL_SERVER_ADDRESS = process.env.TEMPORAL_SERVER_IP
    ? `${process.env.TEMPORAL_SERVER_IP}:7233`
    : "localhost:7233";
let temporalClient = null;
async function getTemporalClient() {
    if (!temporalClient) {
        const connection = await client_1.Connection.connect({ address: TEMPORAL_SERVER_ADDRESS });
        temporalClient = new client_1.Client({ connection });
    }
    return temporalClient;
}
function createMcpServer() {
    const server = new index_js_1.Server({
        name: "process-orchestrator-mcp",
        version: "1.0.0",
    }, {
        capabilities: {
            tools: {},
        },
    });
    // 1. Definindo as ferramentas que este servidor MCP fornece aos Agents e Humanos
    server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
        return {
            tools: [
                {
                    name: "list_hitl_activities",
                    description: "Lista todas as atividades Human-In-The-Loop ou Agent-In-The-Loop pendentes de resolução retornando uma Tabela Markdown estruturada para visualização humana.",
                    inputSchema: {
                        type: "object",
                        properties: {},
                    },
                },
                {
                    name: "start_activity",
                    description: "Inicia uma atividade pendente e retorna seu contexto completo e conteúdo Markdown.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workflowExecutionId: {
                                type: "string",
                                description: "O ID de Execução do Processo (Execution ID) da atividade pendente.",
                            },
                        },
                        required: ["workflowExecutionId"],
                    },
                },
                {
                    name: "complete_activity",
                    description: "Completa uma atividade pendente enviando o resultado de volta para o Orquestrador de Processos.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workflowExecutionId: {
                                type: "string",
                                description: "O ID de Execução do Processo associado à atividade"
                            },
                            resultStatus: {
                                type: "string",
                                description: "O status final. Ex: 'sucesso', 'falha', 'aprovado', 'rejeitado'. Ele determina a navegação da orquestração."
                            },
                            dataPayload: {
                                type: "string",
                                description: "O payload JSON contendo o resultado da sua ação."
                            }
                        },
                        required: ["workflowExecutionId", "resultStatus"],
                    },
                },
                {
                    name: "start_process",
                    description: "Inicia a execução de um Processo automatizado. Por padrão inicia a versão mais recente, ou uma especificada.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            processId: { type: "string", description: "O ID único do processo definido no frontmatter." },
                            version: { type: "string", description: "(Opcional) A versão exata a iniciar. Ex: '1.0.0'. Se omitido, busca a mais recente." },
                            initialData: { type: "string", description: "(Opcional) Payload JSON com dados iniciais para a orquestração." }
                        },
                        required: ["processId"]
                    }
                },
                {
                    name: "get_process_info",
                    description: "Obtém as informações detalhadas e o status atual de um Processo em execução.",
                    inputSchema: {
                        type: "object",
                        properties: { workflowExecutionId: { type: "string" } },
                        required: ["workflowExecutionId"]
                    }
                },
                {
                    name: "get_process_schema",
                    description: "Retorna o documento WORKFLOW_SCHEMA.md contendo todas as regras, parâmetros e boas práticas estruturais para a criação de um processo em Markdown.",
                    inputSchema: { type: "object", properties: {} }
                },
                {
                    name: "validate_process_markdown",
                    description: "Valida uma string Markdown de Processo em memória para checar a sintaxe e a aderência ao Schema antes de registrá-lo definitivamente.",
                    inputSchema: {
                        type: "object",
                        properties: { markdownContent: { type: "string", description: "O texto completo do markdown do processo." } },
                        required: ["markdownContent"]
                    }
                },
                {
                    name: "register_process_markdown",
                    description: "Salva/Registra um novo arquivo Markdown de Processo. Exige que a versão não exista previamente (falha se houver colisão).",
                    inputSchema: {
                        type: "object",
                        properties: { markdownContent: { type: "string", description: "Texto markdown completo com frontmatter." } },
                        required: ["markdownContent"]
                    }
                }
            ],
        };
    });
    // 2. Executando as ferramentas quando solicitadas pelo LLM (Client)
    server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        if (name === "list_hitl_activities") {
            const tasks = await (0, hitl_activities_1.getPendingHitlTasks)();
            if (tasks.length === 0) {
                return {
                    content: [{ type: "text", text: "Nenhuma atividade pendente no momento." }],
                };
            }
            // Formatamos a saída como Tabela Markdown para melhor UX no Client (Cursor/Claude Desktop)
            let markdownTable = "| Activity ID | Execution ID | Process ID | Step ID | Type | Criada Em |\n";
            markdownTable += "|---|---|---|---|---|---|\n";
            tasks.forEach(t => {
                const dateStr = t.createdAt ? new Date(t.createdAt).toISOString() : "N/A";
                markdownTable += `| \`${t.activityId}\` | \`${t.workflowExecutionId}\` | ${t.processId} | ${t.stepId} | ${t.type} | ${dateStr} |\n`;
            });
            return {
                content: [{ type: "text", text: markdownTable }],
            };
        }
        if (name === "start_activity") {
            const workflowExecId = String(args?.workflowExecutionId);
            const tasks = await (0, hitl_activities_1.getPendingHitlTasks)();
            const task = tasks.find(t => t.workflowExecutionId === workflowExecId);
            if (!task) {
                throw new Error(`Atividade para a execução ${workflowExecId} não encontrada pendente.`);
            }
            return {
                content: [{ type: "text", text: JSON.stringify(task, null, 2) }],
            };
        }
        if (name === "complete_activity") {
            const workflowId = String(args?.workflowExecutionId);
            const status = String(args?.resultStatus);
            // Resolve o activityId automaticamente a partir do banco
            const tasks = await (0, hitl_activities_1.getPendingHitlTasks)();
            const task = tasks.find(t => t.workflowExecutionId === workflowId);
            if (!task) {
                throw new Error(`Atividade para a execução ${workflowId} não encontrada pendente.`);
            }
            const activityId = task.activityId;
            let objectData = undefined;
            if (args?.dataPayload) {
                try {
                    objectData = JSON.parse(String(args.dataPayload));
                }
                catch (err) {
                    objectData = String(args.dataPayload);
                }
            }
            try {
                await (0, hitl_activities_1.completeHitlTask)(workflowId, activityId, status, objectData);
                return {
                    content: [{ type: "text", text: `Atividade da execução ${workflowId} atualizada com STATUS: ${status} e resultado enviado para o Orquestrador.` }],
                };
            }
            catch (err) {
                throw new Error(`Falha ao completar a atividade: ${err.message}`);
            }
        }
        if (name === "start_process") {
            const processId = String(args?.processId);
            const version = args?.version ? String(args.version) : null;
            let initialData = undefined;
            if (args?.initialData) {
                try {
                    initialData = JSON.parse(String(args.initialData));
                }
                catch (e) {
                    initialData = String(args.initialData);
                }
            }
            const folderPath = path_1.default.join(PROJECT_ROOT, "tempFiles");
            let targetVersion = version;
            if (!targetVersion) {
                targetVersion = await (0, markdown_parser_1.findLatestProcessVersion)(processId, folderPath);
                if (!targetVersion) {
                    throw new Error(`Processo ${processId} não encontrado em ${folderPath}`);
                }
            }
            else {
                // Se a versão foi enviada explicitamente, vamos ver se ela já vem no formato 'id_vX' 
                // Ou se temos que reconstruir
                if (!targetVersion.startsWith(processId)) {
                    targetVersion = `${processId}_v${targetVersion}`;
                }
            }
            // targetVersion aqui é o fileName sem extensão
            const { definition, content } = await (0, markdown_parser_1.parseProcessMarkdown)(targetVersion, folderPath);
            const client = await getTemporalClient();
            const workflowIdBase = definition.abreviacao || definition.id;
            const runId = `${workflowIdBase}-${Date.now()}`;
            const handle = await client.workflow.start("processOrchestrator", {
                args: [definition, content, initialData],
                taskQueue: process_orchestrator_1.ORCHESTRATION_QUEUE,
                workflowId: runId,
                searchAttributes: {
                    ProcessName: [definition.id],
                    ProcessVersion: [definition.version]
                }
            });
            return {
                content: [{ type: "text", text: `Processo iniciado com sucesso! ID de Execução (Workflow ID): ${handle.workflowId}` }]
            };
        }
        if (name === "get_process_info") {
            const workflowId = String(args?.workflowExecutionId);
            const client = await getTemporalClient();
            const handle = client.workflow.getHandle(workflowId);
            const description = await handle.describe();
            let statusText = `**Status**: ${description.status.name}\n`;
            statusText += `**Criado em**: ${description.startTime}\n`;
            if (description.closeTime)
                statusText += `**Fechado em**: ${description.closeTime}\n`;
            return {
                content: [{ type: "text", text: statusText }]
            };
        }
        if (name === "get_process_schema") {
            const schemaPath = path_1.default.join(PROJECT_ROOT, "WORKFLOW_SCHEMA.md");
            const content = await promises_1.default.readFile(schemaPath, "utf-8");
            return { content: [{ type: "text", text: content }] };
        }
        if (name === "validate_process_markdown") {
            const mdContent = String(args?.markdownContent);
            try {
                const { definition } = (0, markdown_parser_1.parseProcessMarkdownString)(mdContent, "validação-memória");
                return {
                    content: [{ type: "text", text: `Markdown válido! Processo: ${definition.id} v${definition.version}. Pode prosseguir para registrá-lo.` }]
                };
            }
            catch (e) {
                return {
                    content: [{ type: "text", text: `Markdown INVÁLIDO:\n\n${e.message}` }]
                };
            }
        }
        if (name === "register_process_markdown") {
            const mdContent = String(args?.markdownContent);
            const folderPath = path_1.default.join(PROJECT_ROOT, "tempFiles");
            try {
                const savedName = await (0, markdown_parser_1.saveProcessMarkdown)(mdContent, folderPath);
                return {
                    content: [{ type: "text", text: `Processo registrado e salvo como ${savedName}.md com sucesso no diretório de processos.` }]
                };
            }
            catch (e) {
                throw new Error(`Falha ao registrar: ${e.message}`);
            }
        }
        throw new Error(`Ferramenta não reconhecida: ${name}`);
    });
    return server;
}
async function startMcpServer() {
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)());
    // NÃO usar express.json() aqui! O SSEServerTransport precisa ler o body raw do request.
    const mcpServer = createMcpServer();
    // Armazena os transportes ativos por sessão
    const transports = {};
    // Endpoint SSE — o client se conecta aqui para receber eventos
    app.get("/sse", async (req, res) => {
        const transport = new sse_js_1.SSEServerTransport("/message", res);
        transports[transport.sessionId] = transport;
        res.on("close", () => {
            delete transports[transport.sessionId];
        });
        await mcpServer.connect(transport);
    });
    // Endpoint para receber mensagens do client
    app.post("/message", async (req, res) => {
        const sessionId = req.query.sessionId;
        const transport = transports[sessionId];
        if (!transport) {
            res.status(400).json({ error: "Sessão não encontrada. Conecte-se primeiro via /sse" });
            return;
        }
        await transport.handlePostMessage(req, res);
    });
    // Health check
    app.get("/health", (_req, res) => {
        res.json({ status: "ok", server: "projeto-temporal-mcp", transport: "sse" });
    });
    app.listen(MCP_PORT, () => {
        console.log(`🚀 Servidor MCP (SSE) rodando em: http://localhost:${MCP_PORT}`);
        console.log(`   → SSE Endpoint: http://localhost:${MCP_PORT}/sse`);
        console.log(`   → Message Endpoint: http://localhost:${MCP_PORT}/message`);
    });
}
// Se for chamado diretamente via npx (standalone)
if (require.main === module) {
    startMcpServer().catch((error) => {
        console.error("Erro fatal iniciando Servidor MCP:", error);
        process.exit(1);
    });
}
