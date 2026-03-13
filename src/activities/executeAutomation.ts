import { ProcessStep, WorkflowState, ActivityResult } from "../types/workflow";
import { AUTOMATION_REGISTRY } from "./automation-registry";

/**
 * Atividade principal de Automação: Roteia o passo para a implementação correta no Registry.
 */
export async function executeAutomation({
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
  const funcName = step.atividade;

  if (!funcName) {
    return {
      status: "falha",
      error: `Atividade "automatizada" precisa informar o campo 'atividade'.`
    };
  }

  const func = AUTOMATION_REGISTRY[funcName];
  if (!func) {
    return {
      status: "falha",
      error: `Atividade "${funcName}" não registrada no worker automation.`
    };
  }

  try {
    const result = await func(step, state, markdownContent);
    return result;
  } catch (error: any) {
    return {
      status: "falha",
      error: `Erro executando ${funcName}: ${error.message}`
    };
  }
}
