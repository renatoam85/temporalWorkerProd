"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUTOMATION_REGISTRY = void 0;
exports.registerAutomation = registerAutomation;
/**
 * Registro de Funções ("Registry").
 */
exports.AUTOMATION_REGISTRY = {};
function registerAutomation(name, fn) {
    exports.AUTOMATION_REGISTRY[name] = fn;
}
// Inicializa o registro importando as atividades isoladas
const extrair_dados_basicos_1 = require("./extrair_dados_basicos");
const executeWebhook_1 = require("./executeWebhook");
registerAutomation("extrair_dados_basicos", extrair_dados_basicos_1.extrair_dados_basicos);
registerAutomation("webhook", (step, state) => (0, executeWebhook_1.executeWebhook)({ step, state }));
