import { z } from "zod";

function getIsProd(): boolean {
  return typeof process !== 'undefined' && process.env?.NODE_ENV === "production";
}

const isProd = getIsProd();
const suffix = isProd ? "" : "-teste";

// Nomes Base das Filas (usamos para construir nomes dinâmicos se necessário)
export const QUEUE_ORCHESTRATION_BASE = "orchestration-v3-queue";
export const QUEUE_HUMAN_TASK_BASE = "human-task-v3-queue";
export const QUEUE_AUTOMATION_BASE = "automation-v3-queue";

// Nome do arquivo de banco de dados conforme o ambiente
export const HUMAN_TASKS_DB_FILENAME = `human-tasks-database${suffix}.json`;

// Valores aceitos para fila (para uso em Workers e Clients fora do sandbox)
export const QUEUE_ORCHESTRATION = `${QUEUE_ORCHESTRATION_BASE}${suffix}`;
export const QUEUE_HUMAN_TASK = `${QUEUE_HUMAN_TASK_BASE}${suffix}`;
export const QUEUE_AUTOMATION = `${QUEUE_AUTOMATION_BASE}${suffix}`;

// Tipo de Workflow Registrado no Temporal
export const WORKFLOW_TYPE_NAME = isProd ? "Processo" : "Processo_teste";


// Enumeração de tipos de etapas válidos
export const StepTypeEnum = z.enum([
  "tarefa_humana",
  "tarefa_agente",
  "webhook",
  "automatizada",
  "executar_com_ia",
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
  versao: z.string(),
  descricao: z.string().optional(),
  abreviacao: z.string().optional(),
  passo_inicial: z.string(),
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

// Interface estruturada para o que fica pendente no banco de Tarefas Humanas
export interface PendingHumanTask {
  activityId: string;           // Temporal Activity ID gerado
  workflowExecutionId: string;  // Workflow ID gerado pelo Temporal
  workflowType: string;         // Tipo registrado no Temporal (Processo ou Processo_teste)
  envMode: string;              // "produção" ou "teste" conforme o Worker
  processId: string;            // ID semântico do processo (ex: processo_onboarding)
  stepId: string;               // ID da etapa de Tarefa Humana sendo tocada
  type: "tarefa_humana" | "tarefa_agente";
  context: WorkflowState;       // Estado acumulado até este momento
  markdownContent?: string;     // Todo documento ou a parte relevante exportada pro MCP
  createdAt: string;            // ISO Date
}
