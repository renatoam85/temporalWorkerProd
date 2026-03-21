"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessDefinitionSchema = exports.StepSchema = exports.NavigationMapSchema = exports.StepTypeEnum = exports.QUEUE_AUTOMATION = exports.QUEUE_HITL = exports.QUEUE_ORCHESTRATION = void 0;
const zod_1 = require("zod");
// Valores aceitos para fila
exports.QUEUE_ORCHESTRATION = "orchestration-queue";
exports.QUEUE_HITL = "hitl-queue";
exports.QUEUE_AUTOMATION = "automation-queue";
// Enumeração de tipos de etapas válidos
exports.StepTypeEnum = zod_1.z.enum([
    "hitl_humano",
    "hitl_agente",
    "webhook",
    "automatizada",
]);
// Navegação entre os steps: mapeamento de "resultado" -> "id_do_proximo_step"
exports.NavigationMapSchema = zod_1.z.record(zod_1.z.string(), zod_1.z.string());
exports.StepSchema = zod_1.z.object({
    id: zod_1.z.string(),
    tipo: exports.StepTypeEnum,
    atividade: zod_1.z.string().optional(), // Obrigatório p/ tipo 'automatizada'
    parametros: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional(),
    navegacao: exports.NavigationMapSchema,
});
exports.ProcessDefinitionSchema = zod_1.z.object({
    id: zod_1.z.string(),
    version: zod_1.z.string(),
    description: zod_1.z.string().optional(),
    abreviacao: zod_1.z.string().optional(),
    initial_step: zod_1.z.string(),
    steps: zod_1.z.record(zod_1.z.string(), exports.StepSchema),
    // steps é um dicionário facilitado: { "id_do_step": StepSchema }
});
