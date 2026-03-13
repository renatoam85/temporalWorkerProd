import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import "dotenv/config";
import express from "express";
import cors from "cors";
import { getPendingHitlTasks, completeHitlTask } from "./activities/hitl-activities";

const MCP_PORT = Number(process.env.MCP_PORT) || 3100;

function createMcpServer() {
  const server = new Server(
    {
      name: "projeto-temporal-mcp",
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
          name: "list_hitl_activities",
          description: "Lista todas as atividades Human-In-The-Loop ou Agent-In-The-Loop pendentes de resolução.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "start_activity",
          description: "Inicia uma atividade e retorna seu contexto completo e conteúdo Markdown.",
          inputSchema: {
            type: "object",
            properties: {
              activityId: {
                type: "string",
                description: "O ID da atividade pendente a ser iniciada.",
              },
            },
            required: ["activityId"],
          },
        },
        {
          name: "complete_activity",
          description: "Completa uma atividade pendente enviando o resultado de volta para o Temporal Orquestrador.",
          inputSchema: {
            type: "object",
            properties: {
              workflowExecutionId: {
                type: "string",
                description: "O ID de Execução do Workflow associado à atividade"
              },
              activityId: {
                type: "string",
                description: "O ID da atividade a ser completada",
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
            required: ["workflowExecutionId", "activityId", "resultStatus"],
          },
        }
      ],
    };
  });

  // 2. Executando as ferramentas quando solicitadas pelo LLM (Client)
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "list_hitl_activities") {
      const tasks = await getPendingHitlTasks();
      
      // Simplificamos a visualização enviando uma lista resumida
      const summaryList = tasks.map(t => ({
        activityId: t.activityId,
        workflowExecutionId: t.workflowExecutionId,
        processId: t.processId,
        stepId: t.stepId,
        type: t.type,
        createdAt: t.createdAt
      }));

      return {
        content: [{ type: "text", text: JSON.stringify(summaryList, null, 2) }],
      };
    }

    if (name === "start_activity") {
      const activityId = String(args?.activityId);
      const tasks = await getPendingHitlTasks();
      const task = tasks.find(t => t.activityId === activityId);

      if (!task) {
        throw new Error(`Atividade ${activityId} não encontrada pendente.`);
      }

      return {
        content: [{ type: "text", text: JSON.stringify(task, null, 2) }],
      };
    }

    if (name === "complete_activity") {
      const workflowId = String(args?.workflowExecutionId);
      const activityId = String(args?.activityId);
      const status = String(args?.resultStatus);
      
      let objectData = undefined;
      if (args?.dataPayload) {
        try {
          objectData = JSON.parse(String(args.dataPayload));
        } catch (err) {
          objectData = String(args.dataPayload);
        }
      }

      try {
        await completeHitlTask(workflowId, activityId, status, objectData);
        return {
           content: [{ type: "text", text: `Atividade ${activityId} atualizada com STATUS: ${status} e resultado enviado para o Workflow.` }],
        };
      } catch(err: any) {
        throw new Error(`Falha ao completar a atividade: ${err.message}`);
      }
    }

    throw new Error(`Ferramenta não reconhecida: ${name}`);
  });

  return server;
}

export async function startMcpServer() {
  const app = express();
  app.use(cors());
  // NÃO usar express.json() aqui! O SSEServerTransport precisa ler o body raw do request.

  const mcpServer = createMcpServer();

  // Armazena os transportes ativos por sessão
  const transports: Record<string, SSEServerTransport> = {};

  // Endpoint SSE — o client se conecta aqui para receber eventos
  app.get("/sse", async (req, res) => {
    const transport = new SSEServerTransport("/message", res);
    transports[transport.sessionId] = transport;
    
    res.on("close", () => {
      delete transports[transport.sessionId];
    });

    await mcpServer.connect(transport);
  });

  // Endpoint para receber mensagens do client
  app.post("/message", async (req, res) => {
    const sessionId = req.query.sessionId as string;
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
