import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import path from "path";
import fs from "fs/promises";

// Raiz do projeto: process.cwd() funciona tanto em dev (tsx) quanto em Docker (WORKDIR /app)
const PROJECT_ROOT = process.cwd();

import dotenv from "dotenv";
dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });

import express from "express";
import cors from "cors";
import { Connection, Client } from "@temporalio/client";
import { parseProcessMarkdown, parseProcessMarkdownString, saveProcessMarkdown, findLatestProcessVersion } from "./utils/markdown-parser";
import {
  QUEUE_ORCHESTRATION,
  WORKFLOW_TYPE_NAME,
  humanTaskSignal,
  getCurrentStateQuery,
  ActivityResult
} from "./types/workflow";

const MCP_PORT = Number(process.env.MCP_PORT) || 3100;
const TEMPORAL_SERVER_ADDRESS = process.env.TEMPORAL_SERVER_IP 
    ? `${process.env.TEMPORAL_SERVER_IP}:7233` 
    : "localhost:7233";

let temporalClient: Client | null = null;
async function getTemporalClient() {
  if (!temporalClient) {
    const connection = await Connection.connect({ address: TEMPORAL_SERVER_ADDRESS });
    temporalClient = new Client({ connection });
  }
  return temporalClient;
}

export function createMcpServer() {
  const server = new Server(
    {
      name: "process-orchestrator-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // 1. Definindo as ferramentas que este servidor MCP fornece aos Agents e Humanos
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "list_human_tasks",
          description: "Lista todas as tarefas humanas (Human Task) ou de agente (Agent Task) pendentes de resolução retornando uma Tabela Markdown estruturada para visualização.",
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
              versao: { type: "string", description: "(Opcional) A versão exata a iniciar. Ex: '1.0.0'. Se omitido, busca a mais recente." },
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
          description: "MANDATORY: Call this tool BEFORE attempting to create or modify a Process Markdown file. This returns the exact structural template, schema, syntax rules (YAML), and precise instructions on how to generate a valid process.",
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
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "list_human_tasks") {
      const client = await getTemporalClient();
      
      const isProd = process.env.NODE_ENV === "production";
      const workflowType = isProd ? "Processo" : "Processo_teste";

      // Consulta o Temporal por workflows que possuem o Search Attribute StepAfterSignal preenchido e pelo tipo de ambiente
      const iterator = client.workflow.list({
        query: `StepAfterSignal != "" AND ExecutionStatus = "Running" AND WorkflowType = "${workflowType}"`
      });

      const tasks = [];
      for await (const workflow of iterator) {
        tasks.push({
          workflowExecutionId: workflow.workflowId,
          processName: (workflow.searchAttributes?.ProcessName as string[])?.[0] || 'N/A',
          processVersion: (workflow.searchAttributes?.ProcessVersion as string[])?.[0] || 'N/A',
          pendingStep: (workflow.searchAttributes?.StepAfterSignal as string[])?.[0] || 'N/A',
          startTime: workflow.startTime
        });
      }
      
      if (tasks.length === 0) {
        return {
          content: [{ type: "text", text: "Nenhuma atividade pendente no momento." }],
        };
      }

      // Formatamos a saída como Tabela Markdown para melhor UX no Client (Cursor/Claude Desktop)
      let markdownTable = "| Execution ID | Process ID | Version | Pending Step | Criada Em |\n";
      markdownTable += "|---|---|---|---|---|\n";
      
      tasks.forEach(t => {
        const dateStr = t.startTime ? new Date(t.startTime).toISOString() : "N/A";
        markdownTable += `| \`${t.workflowExecutionId}\` | ${t.processName} | ${t.processVersion} | \`${t.pendingStep}\` | ${dateStr} |\n`;
      });

      return {
        content: [{ type: "text", text: markdownTable }],
      };
    }

    if (name === "start_activity") {
      const workflowExecId = String(args?.workflowExecutionId);
      const client = await getTemporalClient();
      const handle = client.workflow.getHandle(workflowExecId);

      try {
        // [NOVO] Consulta o estado atual diretamente do workflow via Query Handler
        const stateContext = await handle.query(getCurrentStateQuery);
        
        return {
          content: [{ type: "text", text: JSON.stringify({
            workflowExecutionId: workflowExecId,
            ...stateContext
          }, null, 2) }],
        };
      } catch (err: any) {
        throw new Error(`Não foi possível obter o contexto para a execução ${workflowExecId}: ${err.message}`);
      }
    }

    if (name === "complete_activity") {
      const workflowId = String(args?.workflowExecutionId);
      const status = String(args?.resultStatus);
      const client = await getTemporalClient();
      
      let objectData = undefined;
      if (args?.dataPayload) {
        try {
          objectData = JSON.parse(String(args.dataPayload));
        } catch (err) {
          objectData = String(args.dataPayload);
        }
      }

      const result: ActivityResult = { status, data: objectData };

      try {
        // [NOVO] Completa a atividade enviando um Signal diretamente para o workflow
        const handle = client.workflow.getHandle(workflowId);
        await handle.signal(humanTaskSignal, result);
        
        return {
           content: [{ type: "text", text: `Atividade da execução ${workflowId} atualizada com STATUS: ${status} e resultado enviado via Signal para o Orquestrador.` }],
        };
      } catch(err: any) {
        throw new Error(`Falha ao enviar signal para completar a atividade: ${err.message}`);
      }
    }

    if (name === "start_process") {
      const processId = String(args?.processId);
      const versao = args?.versao ? String(args.versao) : null;
      let initialData = undefined;
      
      if (args?.initialData) {
        try { initialData = JSON.parse(String(args.initialData)); } 
        catch (e) { initialData = String(args.initialData); }
      }

      const folderPath = path.join(PROJECT_ROOT, "tempFiles");
      
      let targetVersion = versao;
      if (!targetVersion) {
         targetVersion = await findLatestProcessVersion(processId, folderPath);
         if (!targetVersion) {
           throw new Error(`Processo ${processId} não encontrado em ${folderPath}`);
         }
      } else {
         // Se a versão foi enviada explicitamente, vamos ver se ela já vem no formato 'id_vX' 
         // Ou se temos que reconstruir
         if (!targetVersion.startsWith(processId)) {
            targetVersion = `${processId}_v${targetVersion}`;
         }
      }

      // targetVersion aqui é o fileName sem extensão
      const { definition, content } = await parseProcessMarkdown(targetVersion, folderPath);
      
      const client = await getTemporalClient();
      const workflowIdBase = definition.abreviacao || definition.id;
      const runId = `${workflowIdBase}-${Date.now()}`;
      
      const handle = await client.workflow.start(WORKFLOW_TYPE_NAME, {
        args: [definition, content, initialData],
        taskQueue: QUEUE_ORCHESTRATION,
        workflowId: runId,
        searchAttributes: {
          ProcessName: [definition.id],
          ProcessVersion: [definition.versao]
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
       statusText += `**Tipo (Temporal)**: ${description.type}\n`;
       statusText += `**Criado em**: ${description.startTime}\n`;
       if (description.closeTime) statusText += `**Fechado em**: ${description.closeTime}\n`;
       
       return {
         content: [{ type: "text", text: statusText }]
       };
    }

    if (name === "get_process_schema") {
       const schemaPath = path.join(PROJECT_ROOT, "WORKFLOW_SCHEMA.md");
       const content = await fs.readFile(schemaPath, "utf-8");
       return { content: [{ type: "text", text: content }] };
    }

    if (name === "validate_process_markdown") {
       const mdContent = String(args?.markdownContent);
       try {
         const { definition } = parseProcessMarkdownString(mdContent, "validação-memória");
         return {
           content: [{ type: "text", text: `Markdown válido! Processo: ${definition.id} v${definition.versao}. Pode prosseguir para registrá-lo.` }]
         };
       } catch (e: any) {
         return {
           content: [{ type: "text", text: `Markdown INVÁLIDO:\n\n${e.message}` }]
         };
       }
    }

    if (name === "register_process_markdown") {
       const mdContent = String(args?.markdownContent);
       const folderPath = path.join(PROJECT_ROOT, "tempFiles");
       try {
         const savedName = await saveProcessMarkdown(mdContent, folderPath);
         return {
           content: [{ type: "text", text: `Processo registrado e salvo como ${savedName}.md com sucesso no diretório de processos.` }]
         };
       } catch (e: any) {
         throw new Error(`Falha ao registrar: ${e.message}`);
       }
    }

    throw new Error(`Ferramenta não reconhecida: ${name}`);
  });

  return server;
}

export async function startMcpServer() {
  const app = express();
  app.use(cors());

  // Armazena os transportes ativos por sessão (SSE e Streamable HTTP)
  const transports: Record<string, SSEServerTransport | StreamableHTTPServerTransport> = {};

  //=============================================================================
  // STREAMABLE HTTP TRANSPORT (para OpenAI Responses API)
  //=============================================================================
  // JSON body parser apenas para o endpoint /mcp
  app.use('/mcp', express.json());

  app.all("/mcp", async (req, res) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        const existing = transports[sessionId];
        if (existing instanceof StreamableHTTPServerTransport) {
          transport = existing;
        } else {
          res.status(400).json({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Bad Request: Session uses a different transport protocol' },
            id: null
          });
          return;
        }
      } else if (!sessionId && req.method === 'POST' && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            console.log(`🔗 StreamableHTTP session initialized: ${sid}`);
            transports[sid] = transport;
          }
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            console.log(`🔌 StreamableHTTP session closed: ${sid}`);
            delete transports[sid];
          }
        };

        // Cada sessão Streamable HTTP recebe sua própria instância do MCP Server
        const mcpServer = createMcpServer();
        await mcpServer.connect(transport);
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
          id: null
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Erro no endpoint /mcp:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null
        });
      }
    }
  });

  //=============================================================================
  // LEGACY SSE TRANSPORT (para Cursor, Claude Desktop, etc.)
  //=============================================================================
  const sseMcpServer = createMcpServer();

  app.get("/sse", async (req, res) => {
    const transport = new SSEServerTransport("/message", res);
    transports[transport.sessionId] = transport;
    
    res.on("close", () => {
      delete transports[transport.sessionId];
    });

    await sseMcpServer.connect(transport);
  });

  app.post("/message", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const existing = transports[sessionId];
    if (!existing || !(existing instanceof SSEServerTransport)) {
      res.status(400).json({ error: "Sessão SSE não encontrada. Conecte-se primeiro via /sse" });
      return;
    }
    await existing.handlePostMessage(req, res);
  });

  //=============================================================================
  // HEALTH CHECK
  //=============================================================================
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "projeto-temporal-mcp", transport: ["sse", "streamable-http"] });
  });

  app.listen(MCP_PORT, () => {
    console.log(`🚀 Servidor MCP rodando em: http://localhost:${MCP_PORT}`);
    console.log(`   → Streamable HTTP: http://localhost:${MCP_PORT}/mcp  (OpenAI, Agents SDK)`);
    console.log(`   → SSE (legado):    http://localhost:${MCP_PORT}/sse  (Cursor, Claude Desktop)`);
  });
}

// Se for chamado diretamente via npx (standalone)
if (require.main === module) {
  startMcpServer().catch((error) => {
    console.error("Erro fatal iniciando Servidor MCP:", error);
    process.exit(1);
  });
}
