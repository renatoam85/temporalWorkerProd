import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

async function main() {
  console.log("🔌 Conectando ao MCP Server via SSE...");
  
  const transport = new SSEClientTransport(new URL("http://localhost:3100/sse"));
  const client = new Client({ name: "trigger-onboarding", version: "1.0.0" });
  
  await client.connect(transport);
  console.log("✅ Conectado!\n");

  console.log("🎯 Iniciando processo de onboarding...");
  const result = await client.callTool({ 
    name: "start_process", 
    arguments: { 
      processId: "processo_onboarding_teste",
      initialData: JSON.stringify({ 
        cliente: "Cliente Teste MCP", 
        email: "teste@mcp.com" 
      })
    } 
  });
  
  console.log("\n--- RESPOSTA DO MCP ---");
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
