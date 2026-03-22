import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

async function main() {
  const workflowId = "onboard-1774215011496";
  const transport = new SSEClientTransport(new URL("http://localhost:3100/sse"));
  const client = new Client({ name: "get-info", version: "1.0.0" });
  await client.connect(transport);

  console.log(`ℹ️ Obtendo info para ${workflowId}...`);
  const result = await client.callTool({ 
    name: "get_process_info", 
    arguments: { workflowExecutionId: workflowId } 
  });
  
  console.log("\n--- INFO DO PROCESSO ---");
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
