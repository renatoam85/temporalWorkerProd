"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeHitlTask = executeHitlTask;
const activity_1 = require("@temporalio/activity");
const node_1 = require("lowdb/node");
const path_1 = __importDefault(require("path"));
async function getDb() {
    const dbPath = path_1.default.resolve(process.cwd(), "data", "hitl-database.json");
    return (0, node_1.JSONFilePreset)(dbPath, { pendingTasks: [] });
}
/**
 * Atividade principal HITL: Persiste a tarefa e dorme aguardando completamento externo via MCP.
 */
async function executeHitlTask({ processId, step, state, markdownContent }) {
    const db = await getDb();
    const info = activity_1.Context.current().info;
    // Guard: evita duplicatas caso o Temporal re-execute a activity
    const alreadyExists = db.data.pendingTasks.some(t => t.activityId === info.activityId && t.workflowExecutionId === info.workflowExecution.workflowId);
    if (!alreadyExists) {
        const pendingTask = {
            activityId: info.activityId,
            workflowExecutionId: info.workflowExecution.workflowId,
            processId,
            stepId: step.id,
            type: step.tipo,
            context: state,
            markdownContent,
            createdAt: new Date().toISOString()
        };
        db.data.pendingTasks.push(pendingTask);
        await db.write();
    }
    // 7 dias = 604_800_000 ms (dentro do limite de 32-bit signed int: 2_147_483_647)
    throw activity_1.Context.current().sleep("7 days");
}
