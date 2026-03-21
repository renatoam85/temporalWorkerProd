"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeAutomation = executeAutomation;
const automation_registry_1 = require("./automation-registry");
/**
 * Atividade principal de Automação: Roteia o passo para a implementação correta no Registry.
 */
async function executeAutomation({ processId, step, state, markdownContent }) {
    const funcName = step.atividade;
    if (!funcName) {
        return {
            status: "falha",
            error: `Atividade "automatizada" precisa informar o campo 'atividade'.`
        };
    }
    const func = automation_registry_1.AUTOMATION_REGISTRY[funcName];
    if (!func) {
        return {
            status: "falha",
            error: `Atividade "${funcName}" não registrada no worker automation.`
        };
    }
    try {
        const result = await func(step, state, markdownContent);
        return result;
    }
    catch (error) {
        return {
            status: "falha",
            error: `Erro executando ${funcName}: ${error.message}`
        };
    }
}
