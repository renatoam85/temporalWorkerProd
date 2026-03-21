"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const mcp_server_1 = require("./mcp-server");
/**
 * Script dedicado para rodar o MCP Server via STDIO,
 * que é o padrão exigido pelo Claude Desktop App.
 */
async function main() {
    const server = (0, mcp_server_1.createMcpServer)();
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    // O console.error no NodeJS nativo não interfere no STDIO do MCP.
    console.error("Servidor MCP inciado via STDIO para Claude Desktop.");
}
main().catch((error) => {
    console.error("Erro fatal iniciando Servidor MCP via STDIO:", error);
    process.exit(1);
});
