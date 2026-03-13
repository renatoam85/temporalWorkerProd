// MCP Client - Listar e aprovar automaticamente a atividade pendente
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

async function main() {
  console.log("🔌 Conectando ao MCP Server via SSE...");
  
  const transport = new SSEClientTransport(new URL("http://localhost:3100/sse"));
  const client = new Client({ name: "test-client", version: "1.0.0" });
  
  await client.connect(transport);
  console.log("✅ Conectado!\n");

  // 1. Listar
  console.log("📋 Listando atividades...");
  const listResult = await client.callTool({ name: "list_hitl_activities", arguments: {} });
  const tasks = JSON.parse((listResult.content as any)[0].text);
  
  if (tasks.length === 0) {
    console.log("⚠️  Nenhuma atividade pendente.");
    process.exit(0);
  }

  const latest = tasks[0];
  console.log(`🎯 Atividade encontrada: ${latest.activityId} do workflow ${latest.workflowExecutionId}\n`);

  // 2. Aprovar
  console.log("✅ Chamando complete_activity (APROVADO)...");
  const result = await client.callTool({ 
    name: "complete_activity", 
    arguments: { 
      workflowExecutionId: latest.workflowExecutionId,
      activityId: latest.activityId,
      resultStatus: "aprovado",
      dataPayload: JSON.stringify({ validado_por: "automacao_teste", observacao: "Fix webhook verificado." })
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
