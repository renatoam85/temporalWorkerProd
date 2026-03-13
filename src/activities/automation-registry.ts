import { ProcessStep, WorkflowState, ActivityResult } from "../types/workflow";

export type AutomationFunction = (
  step: ProcessStep,
  state: WorkflowState,
  markdownContent?: string
) => Promise<ActivityResult>;

/**
 * Registro de Funções ("Registry"). 
 */
export const AUTOMATION_REGISTRY: Record<string, AutomationFunction> = {};

export function registerAutomation(name: string, fn: AutomationFunction) {
  AUTOMATION_REGISTRY[name] = fn;
}

// Inicializa o registro importando as atividades isoladas
import { extrair_dados_basicos } from "./extrair_dados_basicos";
import { executeWebhook } from "./executeWebhook";

registerAutomation("extrair_dados_basicos", extrair_dados_basicos);
registerAutomation("webhook", (step, state) => executeWebhook({ step, state }));
