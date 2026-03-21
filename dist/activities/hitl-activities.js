"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPendingHitlTasks = getPendingHitlTasks;
exports.completeHitlTask = completeHitlTask;
const client_1 = require("@temporalio/client");
const node_1 = require("lowdb/node");
const path_1 = __importDefault(require("path"));
// Raiz do projeto: process.cwd() funciona tanto em dev (tsx) quanto em Docker (WORKDIR /app)
const PROJECT_ROOT = process.cwd();
async function getDb() {
    const dbPath = path_1.default.resolve(PROJECT_ROOT, "data", "hitl-database.json");
    return (0, node_1.JSONFilePreset)(dbPath, { pendingTasks: [] });
}
// -------------------------------------------------------------
// FUNÇÕES UTILITÁRIAS PARA O MCP SERVER (Fora do Contexto Temporal)
// ------------------------------------------------------------- 
async function getPendingHitlTasks() {
    const db = await getDb();
    return db.data.pendingTasks;
}
async function completeHitlTask(workflowExecutionId, activityId, resultStatus, data, errorMsg) {
    const db = await getDb();
    // Encontra qual é
    const index = db.data.pendingTasks.findIndex(t => t.activityId === activityId && t.workflowExecutionId === workflowExecutionId);
    if (index === -1) {
        throw new Error(`Atividade HITL ${activityId} não encontrada pendente para execução.`);
    }
    // PRIMEIRO: Sinalizar o Temporal com o resultado ANTES de remover do banco.
    // Se falhar, a task permanece no banco e pode ser retentada.
    const TEMPORAL_SERVER_ADDRESS = process.env.TEMPORAL_SERVER_IP
        ? `${process.env.TEMPORAL_SERVER_IP}:7233`
        : "localhost:7233";
    const { Connection } = await Promise.resolve().then(() => __importStar(require("@temporalio/client")));
    const connection = await Connection.connect({ address: TEMPORAL_SERVER_ADDRESS });
    const completionResult = {
        status: resultStatus,
        data,
        error: errorMsg
    };
    try {
        const asyncCompletionClient = new client_1.AsyncCompletionClient({ connection });
        await asyncCompletionClient.complete({ workflowId: workflowExecutionId, activityId: activityId }, completionResult);
    }
    catch (err) {
        throw new Error(`Falha ao sinalizar orquestrador para a atividade ${activityId} do processo ${workflowExecutionId}. ` +
            `A atividade permanece pendente na lista. Detalhes: ${err.message}`);
    }
    // SOMENTE APÓS sucesso no Temporal: remover da lista local
    db.data.pendingTasks.splice(index, 1);
    await db.write();
}
