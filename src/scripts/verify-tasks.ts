import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

async function main() {
  console.log("🔌 Conectando ao MCP Server via SSE...");
  
  const transport = new SSEClientTransport(new URL("http://localhost:3100/sse"));
  const client = new Client({ name: "verify-tasks", version: "1.0.0" });
  
  await client.connect(transport);
  console.log("✅ Conectado!\n");

  console.log("📋 Listando atividades pendentes...");
  const result = await client.callTool({ 
    name: "list_human_tasks", 
    arguments: {} 
  });
  
  console.log("\n--- ATIVIDADES PENDENTES ---");
  for (const content of result.content as any[]) {
    if (content.type === "text") {
      console.log(content.text);
    }
  }

  await client.close();
  process.exit(0);
}

main().catch(err => {
  console.error("Erro:", err.message);
  process.exit(1);
});
