import { ProcessStep, WorkflowState, ActivityResult } from "../types/workflow";

/**
 * Exemplo de função de automação: Extração de dados simples.
 */
export async function extrair_dados_basicos(
  step: ProcessStep,
  state: WorkflowState
): Promise<ActivityResult> {
  return {
    status: "sucesso",
    data: {
      nome: "Cliente Teste",
      idade: 35,
      cargo: "Engenheiro de Software"
    }
  };
}
