import { processOrchestratorImpl } from "./process-orchestrator";

/**
 * Stub de Produção: Exporta o orquestrador com o nome oficial "Processo".
 * Isso impede que o Worker de Produção registre ou aceite outros nomes de teste.
 */
export const Processo = processOrchestratorImpl;
