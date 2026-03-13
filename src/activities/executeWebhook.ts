import { ProcessStep, WorkflowState, ActivityResult } from "../types/workflow";

/**
 * Implementação Nativa do Webhook
 */
export async function executeWebhook({
  step,
  state
}: {
  step: ProcessStep,
  state: WorkflowState
}): Promise<ActivityResult> {
  const url = step.parametros?.url;
  const method = step.parametros?.method || "GET";
  const payload = step.parametros?.payload;

  if (!url) {
    return { status: "falha", error: "URL não informada para o webhook" };
  }

  try {
    const options: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json"
      }
    };

    if (payload && ["POST", "PUT", "PATCH"].includes(method)) {
      options.body = JSON.stringify(payload);
    }

    const res = await fetch(url, options);

    if (!res.ok) {
      return { status: "falha", error: `HTTP ${res.status}: ${res.statusText}` };
    }

    const data = await res.json().catch(() => ({})); 
    return {
      status: "sucesso",
      data: {
        http_status: res.status,
        response: data
      }
    };
  } catch (error: any) {
    return {
      status: "falha",
      error: `Erro ao chamar webhook: ${error.message}`
    };
  }
}
