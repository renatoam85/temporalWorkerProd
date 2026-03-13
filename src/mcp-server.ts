import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import "dotenv/config";
import { Connection, Client } from "@temporalio/client";

// Pega o IP do servidor Temporal do arquivo .env, fallback para localhost se não estiver definido
const TEMPORAL_SERVER_ADDRESS = process.env.TEMPORAL_SERVER_IP 
    ? `${process.env.TEMPORAL_SERVER_IP}:7233` 
    : "localhost:7233";

// Inicializa o servidor MCP
const server = new Server(
  {
    name: "projeto-temporal-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {}, // Habilitamos a capacidade de prover ferramentas (tools)
    },
  }
);

// 1. Definindo as ferramentas que este servidor MCP fornece aos LLMs (Clients)
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "hello_world",
        description: "Ferramenta de exemplo que retorna uma saudação",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Nome para saudar",
            },
          },
          required: ["name"],
        },
      },
      // No futuro, você pode expor uma ferramenta aqui como "start_temporal_workflow"
      // que permite à IA (como o Claude/Cursor) disparar workflows diretamente!
    ],
  };
});

// 2. Executando as ferramentas quando solicitadas pelo LLM (Client)
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "hello_world") {
    // Extrai o argumento (neste caso, "name")
    const personName = String(args?.name || "Mundo");
    
    // Configurando a conexão com o servidor Temporal
    // const connection = await Connection.connect({
    //   address: TEMPORAL_SERVER_ADDRESS,
    // });
    // const client = new Client({ connection });

    return {
      content: [
        {
          type: "text",
          text: `Olá, ${personName}! O Servidor MCP Node.js está funcionando. (Temporal IP configurado para: ${TEMPORAL_SERVER_ADDRESS})`,
        },
      ],
    };
  }

  // Fallback caso a ferramenta recebida seja desconhecida
  throw new Error(`Ferramenta não reconhecida: ${name}`);
});

// 3. Função de entrada (entrypoint) para subir o servidor com transporte via STDIO 
// (padrão para quando o Cursor/Claude Desktop conectam-se localmente)
async function start() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🚀 Servidor MCP executando (Transporte: STDIO)");
  console.error(`Configurado para o Temporal Server em: ${TEMPORAL_SERVER_ADDRESS}`);
  console.error("Disponível e pronto para receber conexões!");
}

start().catch((error) => {
  console.error("Erro fatal iniciando Servidor MCP:", error);
  process.exit(1);
});
