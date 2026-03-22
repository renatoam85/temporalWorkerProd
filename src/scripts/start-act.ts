import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

async function main() {
  const workflowId = "onboard-1774215011496";
  const transport = new SSEClientTransport(new URL("http://localhost:3100/sse"));
  const client = new Client({ name: "start-act", version: "1.0.0" });
  await client.connect(transport);

  console.log(`🚀 Chamando start_activity para ${workflowId}...`);
  const result = await client.callTool({ 
    name: "start_activity", 
    arguments: { workflowExecutionId: workflowId } 
  });
  
  console.log("\n--- CONTEXTO DA ATIVIDADE ---");
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
