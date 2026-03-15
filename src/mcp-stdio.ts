import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./mcp-server";

/**
 * Script dedicado para rodar o MCP Server via STDIO,
 * que é o padrão exigido pelo Claude Desktop App.
 */
async function main() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // O console.error no NodeJS nativo não interfere no STDIO do MCP.
  console.error("Servidor MCP inciado via STDIO para Claude Desktop.");
}

main().catch((error) => {
  console.error("Erro fatal iniciando Servidor MCP via STDIO:", error);
  process.exit(1);
});
