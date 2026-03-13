import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function run() {
  const transport = new StdioClientTransport({
    command: process.platform === "win32" ? "npx.cmd" : "npx",
    args: ["tsx", "src/mcp-server.ts"],
  });

  const client = new Client(
    {
      name: "test-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  console.log("🔄 Conectando ao servidor MCP...");
  await client.connect(transport);
  console.log("✅ Conectado com sucesso!");

  console.log("\n📦 Listando ferramentas disponíveis...");
  const toolsResponse = await client.listTools();
  console.log(JSON.stringify(toolsResponse.tools, null, 2));

  console.log("\n🚀 Executando a ferramenta 'hello_world'...");
  const result = await client.callTool({
    name: "hello_world",
    arguments: { name: "Antigravity Agent" },
  });
  console.log("📩 Resposta recebida:");
  console.log(JSON.stringify(result, null, 2));

  process.exit(0);
}

run().catch((error) => {
  console.error("❌ Erro ao testar servidor MCP:", error);
  process.exit(1);
});
