# Proposta: Substituição do JSON Database por Signal + Search Attributes para Tarefas Humanas

**Data:** 2026-03-22
**Status:** Proposta — Aguardando aprovação
**Área afetada:** Human Task Worker, MCP Server, Process Orchestrator

---

## 1. Contexto e Problema Atual

### Como funciona hoje

Quando o orquestrador de processos chega em um passo do tipo `tarefa_humana` ou `tarefa_agente`, ele despacha uma atividade para a fila `human-task-queue`. Essa atividade (`executeHumanTask`) faz duas coisas:

1. **Grava** um registro da tarefa pendente no arquivo `data/human-tasks-database.json` (ou `human-tasks-database-teste.json`)
2. **Lança** um `CompleteAsyncError` — pausando a atividade no Temporal indefinidamente até que o MCP chame `AsyncCompletionClient.complete()`

O MCP Server (`list_human_tasks`, `start_activity`, `complete_activity`) **lê e escreve exclusivamente** nesse arquivo JSON para saber o que está pendente.

### Diagrama do fluxo atual

```
Orchestrator
    │
    ├─ step.tipo === "tarefa_humana"
    │
    ▼
humanTaskActivities.executeHumanTask()
    │
    ├─ [1] Grava em data/human-tasks-database.json
    ├─ [2] throw CompleteAsyncError()
    │
    ▼ Atividade suspensa no Temporal (async pending)

MCP list_human_tasks()
    ├─ Lê human-tasks-database.json
    └─ Retorna lista de tasks

MCP complete_activity()
    ├─ Lê activityId do JSON
    ├─ Chama AsyncCompletionClient.complete()  ──→ Temporal resume
    └─ Remove do JSON
```

### Problemas identificados

| Problema | Impacto |
|---------|---------|
| **Duplo estado**: JSON file + Temporal Activity precisam estar sempre em sincronia | Se o processo cair após gravar no JSON mas antes do Temporal confirmar (ou vice-versa), o estado fica inconsistente |
| **Arquivo local**: O JSON fica preso na máquina onde o worker roda | Impossibilita escalar horizontalmente — múltiplas instâncias do worker causariam conflito de leitura/escrita |
| **Limpeza manual necessária**: O script `prune-temporal.ts` existe exatamente por causa desse problema de sincronia | Workflows finalizados ou cancelados no Temporal podem deixar entradas zumbis no JSON |
| **Visibilidade limitada**: Não é possível ver no Temporal UI quais workflows estão aguardando humano | Dificulta debugging e observabilidade operacional |
| **Busca ineficiente**: MCP lê o arquivo inteiro e filtra em memória | Não escala para muitas tarefas simultâneas |

---

## 2. Proposta: Signal-Based Human Tasks

### Conceito central

Em vez de gravar em um arquivo JSON externo, o próprio **Temporal se torna a fonte de verdade**. O orquestrador:

1. Define um **Signal Handler** no workflow para receber a conclusão da tarefa humana
2. Ao chegar em um passo humano, define o **Search Attribute** `StepAfterSignal` com o ID do passo atual
3. **Aguarda o signal** (em vez de despachar uma atividade para a fila `human-task-queue`)
4. O MCP consulta o Temporal diretamente usando o search attribute para listar tarefas pendentes
5. Ao completar, envia um signal para o workflow (em vez de usar `AsyncCompletionClient`)
6. O workflow **limpa** o search attribute após receber o signal

### Diagrama do fluxo proposto

```
Orchestrator (ao iniciar o workflow)
    │
    ├─ [1] Registra Signal Handler: setHandler(humanTaskSignal, handler)
    │
    ▼

Loop de passos
    │
    ├─ step.tipo === "tarefa_humana"
    │
    ▼
    ├─ [2] upsertSearchAttributes({ StepAfterSignal: [step.id] })
    ├─ [3] await condition(() => signalResult !== null, '30 days')
    │       └─ Workflow SUSPENDE aguardando signal
    │
    ▼ (após signal recebido)
    ├─ [4] result = signalResult
    └─ [5] upsertSearchAttributes({ StepAfterSignal: [''] })  // limpa

MCP list_human_tasks()
    ├─ client.workflow.list({ query: 'StepAfterSignal != "" AND ExecutionStatus = "Running"' })
    └─ Retorna workflows com StepAfterSignal preenchido

MCP start_activity()
    ├─ handle.query(getCurrentStateQuery)  ──→ retorna WorkflowState + markdownContent
    └─ Retorna contexto completo ao humano

MCP complete_activity()
    ├─ handle.signal(humanTaskSignal, { status, data })
    └─ Workflow resume automaticamente
```

---

## 3. Análise Comparativa Detalhada

| Dimensão | Atual (JSON Database) | Proposta (Signal + Search Attr) | Veredito |
|---------|----------------------|--------------------------------|---------|
| **Fonte de verdade** | Dupla: JSON + Temporal | Única: Temporal | ✅ Proposta |
| **Consistência** | Frágil — sujeita a dessincronização | Garantida pelo Temporal | ✅ Proposta |
| **Escalabilidade horizontal** | Impossível (arquivo local) | Nativa | ✅ Proposta |
| **Busca de tarefas pendentes** | Lê arquivo inteiro, filtra em memória | Query indexada no Temporal | ✅ Proposta |
| **Visibilidade no Temporal UI** | Activity em estado "async pending" | Search attribute visível na listagem | ✅ Proposta |
| **Necessidade de prune script** | Sim (limpeza de zumbis) | Não (Temporal gerencia o ciclo de vida) | ✅ Proposta |
| **Complexidade de implementação** | Baixa | Média | ⚠️ Atual mais simples |
| **Infraestrutura adicional** | Nenhuma | Registro do search attribute `StepAfterSignal` | ⚠️ Custo mínimo |
| **Obtenção de contexto completo** | Armazenado no JSON | Requer Query Handler no workflow | ⚠️ Precisa de adição |
| **Maturidade no projeto** | Estável e testado | Mudança de paradigma | ⚠️ Requer migration plan |
| **Mecanismo de completion** | `AsyncCompletionClient` (gRPC direto) | `workflow.signal()` (API padrão) | ✅ Proposta (mais idiomático) |
| **`markdownContent` disponível** | Sim, no JSON | Precisa de Query Handler | ⚠️ Precisa de adição |

---

## 4. Requisitos Técnicos da Implementação

### 4.1 Infraestrutura (pré-requisito único)

Registrar o novo search attribute no servidor Temporal **antes** de qualquer mudança de código:

```bash
temporal operator search-attribute create \
  --name StepAfterSignal \
  --type Keyword
```

> Este atributo armazenará o `stepId` do passo humano aguardando resolução. Valor vazio `""` significa que não há tarefa pendente.

### 4.2 Mudanças no Process Orchestrator (`process-orchestrator.ts`)

**Adições necessárias:**

```typescript
import {
  defineSignal, setHandler, condition,
  upsertSearchAttributes, defineQuery
} from "@temporalio/workflow";
import { ActivityResult, WorkflowState } from "../types/workflow";

// Definições (fora do workflow, no escopo do módulo — obrigatório para determinismo)
const humanTaskSignal = defineSignal<[ActivityResult]>('human_task_completed');
const getCurrentStateQuery = defineQuery<{ state: WorkflowState; markdownContent: string }>('get_current_state');
```

**Dentro do `processOrchestratorImpl`:**

```typescript
// [NOVO] Registrar query handler para expor estado ao MCP
let currentMarkdownContent = markdownContent;
setHandler(getCurrentStateQuery, () => ({
  state,
  markdownContent: currentMarkdownContent
}));

// [NOVO] Registrar signal handler para receber conclusão de tarefas humanas
let pendingSignalResult: ActivityResult | null = null;
setHandler(humanTaskSignal, (result: ActivityResult) => {
  pendingSignalResult = result;
});

// ... dentro do loop while ...

if (step.tipo === "tarefa_humana" || step.tipo === "tarefa_agente") {
  // [NOVO] Marca o workflow como aguardando tarefa humana
  await upsertSearchAttributes({ StepAfterSignal: [step.id] });

  // Aguarda o signal (timeout igual ao atual: 30 dias)
  pendingSignalResult = null;
  await condition(() => pendingSignalResult !== null, "30 days");

  // [NOVO] Limpa o search attribute após conclusão
  await upsertSearchAttributes({ StepAfterSignal: [''] });

  result = pendingSignalResult!;
}
```

**Remoção necessária:**
- O bloco que chama `humanTaskActivities.executeHumanTask()` é substituído pelo código acima
- O proxy `humanTaskActivities` pode ser removido (a fila `human-task-queue` para de ser necessária para tarefas humanas)

### 4.3 Mudanças no MCP Server (`mcp-server.ts`)

**`list_human_tasks`** — substitui leitura do JSON por query no Temporal:

```typescript
const client = await getTemporalClient();
const iterator = client.workflow.list({
  query: `StepAfterSignal != "" AND ExecutionStatus = "Running"`
});

const tasks = [];
for await (const workflow of iterator) {
  tasks.push({
    workflowExecutionId: workflow.workflowId,
    processName: workflow.searchAttributes?.ProcessName?.[0],
    processVersion: workflow.searchAttributes?.ProcessVersion?.[0],
    pendingStep: workflow.searchAttributes?.StepAfterSignal?.[0],
    startTime: workflow.startTime
  });
}
```

**`start_activity`** — substitui leitura do JSON por query handler:

```typescript
const handle = client.workflow.getHandle(workflowExecutionId);
const { state, markdownContent } = await handle.query(getCurrentStateQuery);
// Retorna contexto completo ao humano/agente
```

**`complete_activity`** — substitui `AsyncCompletionClient` por signal:

```typescript
const handle = client.workflow.getHandle(workflowExecutionId);
const result: ActivityResult = { status: resultStatus, data: objectData };
await handle.signal('human_task_completed', result);
```

### 4.4 Arquivos a Remover / Deprecar

| Arquivo | Destino |
|---------|---------|
| `src/activities/executeHumanTask.ts` | Remover (substituído por signal no orchestrator) |
| `src/activities/human-task-activities.ts` | Remover `getPendingHumanTasks()` e `completeHumanTask()` |
| `data/human-tasks-database.json` | Deprecar (manter por segurança durante migração, remover após) |
| `data/human-tasks-database-teste.json` | Idem |

### 4.5 Tipos a Atualizar (`src/types/workflow.ts`)

- A interface `PendingHumanTask` se torna desnecessária (o estado vive no Temporal)
- `HUMAN_TASKS_DB_FILENAME` pode ser removido
- Adicionar export das definições de signal/query para uso compartilhado entre workflow e MCP

---

## 5. Pontos de Atenção e Riscos

### 5.1 Obtenção do contexto completo (`markdownContent` + `WorkflowState`)

**Situação atual:** o JSON armazena o estado completo incluindo `markdownContent` no momento em que a tarefa foi criada.

**Na proposta:** o Query Handler retorna o estado **atual** do workflow. Isso é equivalente ou superior — o estado retornado reflete exatamente o que o workflow tem no momento da consulta, sem risco de desatualização.

> O `markdownContent` precisa estar acessível via closure no workflow. Já está disponível como parâmetro de entrada do `processOrchestratorImpl`, portanto basta expô-lo no Query Handler.

### 5.2 Múltiplas tarefas humanas simultâneas no mesmo workflow

O design atual (e o proposto) assume que um workflow processa um passo de cada vez (loop sequencial). Portanto, apenas **uma** tarefa humana por workflow pode estar pendente ao mesmo tempo — o que é correto pela arquitetura.

Se no futuro surgir necessidade de paralelismo, o design precisará evoluir. Mas não é uma limitação para o cenário atual.

### 5.3 Migração de workflows em andamento

Workflows iniciados com a arquitetura atual (JSON database) **não receberão** o novo signal handler. A estratégia recomendada:

1. Fazer o `prune-temporal.ts` para limpar todos os workflows em andamento antes do deploy
2. Fazer o deploy da nova versão
3. Reiniciar os processos necessários

Não há caminho de migração "quente" (hot migration) para workflows já em estado `async pending`.

### 5.4 Determinismo do workflow

As definições de `defineSignal` e `defineQuery` devem ficar **fora** do corpo da função `processOrchestratorImpl`, no escopo do módulo. O `setHandler` deve ser chamado dentro do workflow, mas antes do loop. Isso garante que o Temporal possa recriar o estado determinístico corretamente ao fazer replay.

### 5.5 Visibilidade do `envMode` (produção vs. teste)

Atualmente, o JSON armazena `envMode` explicitamente. Na proposta, essa distinção já está codificada no `workflowType` (que é um search attribute `WorkflowType` nativo do Temporal). Não é necessário armazenar separadamente.

---

## 6. Benefícios Consolidados

1. **Elimina o JSON database** — remove completamente a necessidade de sincronizar dois sistemas de estado
2. **Elimina o script `prune-temporal.ts`** — o Temporal gerencia o ciclo de vida dos workflows nativamente
3. **Melhora a observabilidade** — qualquer pessoa com acesso ao Temporal UI pode ver imediatamente quais processos aguardam intervenção humana filtrando por `StepAfterSignal`
4. **Habilita escala horizontal** — múltiplas instâncias do worker/MCP podem operar sem conflito
5. **Simplifica a arquitetura** — remove um componente (human-task-queue) e dois arquivos de atividade
6. **Usa primitivos nativos do Temporal** — signals e search attributes são o padrão idiomático da plataforma para este exato cenário

---

## 7. Resumo Executivo

| | |
|---|---|
| **Viabilidade técnica** | ✅ Alta — todos os primitivos necessários existem no Temporal TypeScript SDK |
| **Risco de implementação** | Médio — requer mudanças coordenadas em 3 arquivos + registro de infraestrutura |
| **Recomendação** | **Implementar** — a proposta elimina problemas estruturais reais (dual state, sem escala, zumbis) com custo de implementação proporcional |
| **Pré-requisito crítico** | Registrar `StepAfterSignal` no Temporal antes do deploy |
| **Estratégia de migração** | Prune + deploy + reinício dos processos ativos |

---

## Apêndice: Comparação de Código (Antes vs. Depois)

### Antes: MCP `complete_activity`

```typescript
// 1. Busca activityId no JSON
const tasks = await getPendingHumanTasks();
const task = tasks.find(t => t.workflowExecutionId === workflowId);
const activityId = task.activityId;

// 2. Sinaliza via AsyncCompletionClient (gRPC direto)
const asyncCompletionClient = new AsyncCompletionClient({ connection });
await asyncCompletionClient.complete(
  { workflowId: workflowExecutionId, activityId },
  completionResult
);

// 3. Remove do JSON
db.data.pendingTasks.splice(index, 1);
await db.write();
```

### Depois: MCP `complete_activity`

```typescript
// Sinaliza o workflow diretamente (1 passo, sem JSON)
const handle = client.workflow.getHandle(workflowExecutionId);
await handle.signal('human_task_completed', { status: resultStatus, data: objectData });
```

### Antes: Orchestrator (tarefa humana)

```typescript
// Despacha para human-task-queue (que grava JSON + lança CompleteAsyncError)
result = await humanTaskActivities.executeHumanTask({
  processId, step, state, markdownContent
});
```

### Depois: Orchestrator (tarefa humana)

```typescript
// Sinaliza via search attribute e aguarda signal de retorno
await upsertSearchAttributes({ StepAfterSignal: [step.id] });
pendingSignalResult = null;
await condition(() => pendingSignalResult !== null, "30 days");
await upsertSearchAttributes({ StepAfterSignal: [''] });
result = pendingSignalResult!;
```
