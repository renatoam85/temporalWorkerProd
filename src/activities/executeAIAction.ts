import { ProcessStep, WorkflowState, ActivityResult } from "../types/workflow";
import path from "path";
import fs from "fs";

/**
 * Atividade que chama a API da OpenAI para executar uma ação baseada no contexto do processo.
 */
export async function executeAIAction({
  processId,
  step,
  state,
  markdownContent
}: {
  processId: string,
  step: ProcessStep,
  state: WorkflowState,
  markdownContent?: string
}): Promise<ActivityResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_API_MODEL || "gpt-5.4";

  if (!apiKey) {
    return {
      status: "falha",
      error: "OPENAI_API_KEY não configurada no ambiente."
    };
  }

  const possibleStatuses = Object.keys(step.navegacao || {});
  const prompt = `
Você é um motor de execução de processos inteligente. Sua tarefa é decidir o resultado da etapa atual do processo "${processId}".

ETAPA ATUAL:
- ID: ${step.id}
- Tipo: ${step.tipo}
- Parâmetros: ${JSON.stringify(step.parametros || {}, null, 2)}
- Status de Saída Possíveis: ${possibleStatuses.join(", ")}

CONTEXTO DO PROCESSO (HISTÓRICO):
${JSON.stringify(state.history, null, 2)}

DOCUMENTAÇÃO COMPLETA DO PROCESSO:
${markdownContent || "Não fornecida."}

SUAS INSTRUÇÕES:
1. Localize a seção referente à etapa "${step.id}" na documentação acima.
2. Analise as regras de negócio descritas para esta etapa e o histórico de dados.
3. Determine o "status" de saída correto obrigatoriamente entre as opções: [${possibleStatuses.join(", ")}].
4. Produza dados de saída no campo "data" se necessário.
5. Responda obrigatoriamente e exclusivamente com um objeto JSON válido:
   {
     "status": "valor_escolhido",
     "data": { ... },
     "error": null
   }

Responda em PORTUGUÊS.
`;

  try {
    // Extração de parâmetros para MCP
    const servidorMcp = step.parametros?.servidor_mcp;
    const idToken = step.parametros?.id_token;
    let token = undefined;

    if (idToken) {
      token = process.env[idToken];
    }

    // URL da API configurável para suporte a gateways (ex: endpoint /responses)
    let apiUrl = process.env.OPENAI_API_URL || "https://api.openai.com/v1/chat/completions";
    
    // Se a URL não terminar em /responses e tivermos ferramentas MCP, 
    // é provável que precisemos do endpoint de respostas do gateway
    if (servidorMcp && !apiUrl.endsWith("/responses") && apiUrl.includes("api.openai.com")) {
       // Apenas um fallback caso o usuário esqueça, mas o ideal é vir do .env
       //apiUrl = apiUrl.replace("/chat/completions", "/responses");
    }

    const tools: any[] = [];
    if (servidorMcp) {
      tools.push({
        type: "mcp",
        server_label: `mcp-${processId}`, // Prefixo para evitar conflitos
        server_url: servidorMcp,
        server_token: token,
        require_approval: "never"
      });
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        input: [
          { role: "system", content: "Você é um assistente especializado em automação de processos via Temporal." },
          { role: "user", content: prompt }
        ],
        temperature: 0.1,
        text: { format: { type: "json_object" } },
        ...(tools.length > 0 ? { tools } : {})
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        status: "falha",
        error: `Erro na API da OpenAI (${response.status}): ${errorText}`
      };
    }

    const result = await response.json();
    fs.writeFileSync(path.join(process.cwd(), "tmp", "ai_response.log"), JSON.stringify(result, null, 2));
    
    // Suporte ao formato Responses API (output array) ou Chat Completions (choices)
    let content = "";
    
    if (result.output && Array.isArray(result.output)) {
      // Procura a resposta final do assistente no array de output
      const finalMessage = result.output.find((item: any) => 
        item.type === "message" && item.phase === "final_answer"
      );
      if (finalMessage?.content?.[0]?.text) {
        content = finalMessage.content[0].text;
      }
    } else if (result.choices?.[0]?.message?.content) {
      content = result.choices[0].message.content;
    } else if (result.output_text) {
      content = result.output_text;
    }
    
    if (!content) {
      return {
        status: "falha",
        error: `Resposta da IA incompleta ou em formato desconhecido. Estrutura recebida: ${Object.keys(result).join(", ")}`
      };
    }
    
    try {
      const parsedResult = JSON.parse(content);
      return {
        status: parsedResult.status || "sucesso",
        data: parsedResult.data,
        error: parsedResult.error
      };
    } catch (e) {
      return {
        status: "falha",
        error: `Falha ao fazer o parse da resposta da IA: ${content}`
      };
    }

  } catch (error: any) {
    return {
      status: "falha",
      error: `Erro de rede ou execução na chamada de IA: ${error.message}`
    };
  }
}
