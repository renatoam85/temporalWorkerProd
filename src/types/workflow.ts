import { z } from "zod";

// Valores aceitos para fila
export const QUEUE_ORCHESTRATION = "orchestration-queue";
export const QUEUE_HITL = "hitl-queue";
export const QUEUE_AUTOMATION = "automation-queue";

// Enumeração de tipos de etapas válidos
export const StepTypeEnum = z.enum([
  "hitl_humano",
  "hitl_agente",
  "webhook",
  "automatizada",
]);
export type StepType = z.infer<typeof StepTypeEnum>;

// Navegação entre os steps: mapeamento de "resultado" -> "id_do_proximo_step"
export const NavigationMapSchema = z.record(z.string(), z.string());
export type NavigationMap = z.infer<typeof NavigationMapSchema>;

export const StepSchema = z.object({
  id: z.string(),
  tipo: StepTypeEnum,
  atividade: z.string().optional(), // Obrigatório p/ tipo 'automatizada'
  parametros: z.record(z.string(), z.any()).optional(),
  navegacao: NavigationMapSchema,
});
export type ProcessStep = z.infer<typeof StepSchema>;

export const ProcessDefinitionSchema = z.object({
  id: z.string(),
  version: z.string(),
  description: z.string().optional(),
  initial_step: z.string(),
  steps: z.record(z.string(), StepSchema), 
  // steps é um dicionário facilitado: { "id_do_step": StepSchema }
});
export type ProcessDefinition = z.infer<typeof ProcessDefinitionSchema>;

// Estado retornado pela atividade
export interface ActivityResult {
  status: string; // Ex: 'sucesso', 'falha', 'aprovado', 'rejeitado'
  data?: any;     // Payload arbitrário gerado pela atividade
  error?: string;
}

// Histórico do workflow 
export interface WorkflowState {
  process_id: string;
  current_step: string;
  history: Record<string, ActivityResult>;
  is_completed: boolean;
}

// Interface estruturada para o que fica pendente no banco HITL
export interface PendingHitlActivity {
  activityId: string;           // Temporal Activity ID gerado
  workflowExecutionId: string;  // Workflow ID gerado pelo Temporal
  processId: string;            // ID semântico do processo (ex: processo_onboarding)
  stepId: string;               // ID da etapa HITL sendo tocada
  type: "hitl_humano" | "hitl_agente";
  context: WorkflowState;       // Estado acumulado até este momento
  markdownContent?: string;     // Todo documento ou a parte relevante exportada pro MCP
  createdAt: string;            // ISO Date
}
