# Documentação do Schema de Workflows em Markdown

Este documento define as regras e marcações disponíveis para a criação de processos no sistema Orquestrador (via MCP).
Cada processo é definido por um arquivo Markdown `.md` que contém tanto as configurações sistêmicas invisíveis ao usuário quanto as explicações contextuais legíveis para Humanos e Inteligências Artificiais.

---

## 1. Estrutura Base
O arquivo sempre deve começar com um **Frontmatter YAML** obrigatório, delimitado por `---`. Esse bloco define o cabeçalho do processo.

```yaml
---
id: "meu_processo_v1"
version: "1.0.0"
description: "Breve explicação sobre o que o processo resolve"
initial_step: "step_inicial"
---
```
> **Nota:** O `initial_step` diz ao orquestrador exatamente por qual passo o workflow deve começar.

---

## 2. Definindo as Etapas do Processo

Ao longo do Markdown, você pode inserir títulos, textos de orientação, imagens, etc. 
Porém, para registrar uma etapa rastreável sistemicamente, você **deve criar um bloco de código do tipo `yaml`**.

### Modelo de um bloco de Etapa:
```yaml
id: "identificador_unico_do_passo"
tipo: "hitl_humano"
atividade: "nome_da_atividade_registrada" # (Opcional)
parametros: # (Opcional - Pode conter dados soltos)
  chave: "valor"
navegacao:
  status_esperado: "id_do_proximo_passo"
  default: "id_do_passo_fallback"
```

---

## 3. Tipos de Etapas (`tipo`)

O campo `tipo` obriga a etapa a ser roteada para o Worker correto. Atualmente suportamos os seguintes tipos estritos:

| Tipo | Fila de Destino | Comportamento |
| :--- | :--- | :--- |
| **`automatizada`** | `automation-queue` | Roda código nativo sem interação externa. **Obriga** o preenchimento do campo `"atividade"` com uma chave de função previamente registrada no sistema. |
| **`webhook`** | `automation-queue` | Dispara um Webhook nativo sem código adicional. A etapa espera que a requisição finalize. Usa a URL do bloco `parametros`. |
| **`hitl_humano`** | `hitl-queue` | (*Human in the Loop*) Interrompe a orquestração e coloca a etapa em modo pendente no banco local. Um Humano usando o Claude Desktop/Cursor listará as pendências via MCP e fechará a tarefa. |
| **`hitl_agente`** | `hitl-queue` | (*Agent in the Loop*) Identico ao humano, porém voltado a ser executado por fluxos de agentes autônomos por webhook em lote via MCP. |

---

## 4. O Campo Atividade (`atividade`)

Utilizado em conjunto com o tipo `"automatizada"`. Determina especificamente **qual** trecho do código vai processar esta etapa.
Exemplo:
```yaml
id: "step_extract"
tipo: "automatizada"
atividade: "extrair_dados_basicos"
navegacao:
  sucesso: "finalizado"
```
*Se aividade `extrair_dados_basicos` não existir no Worker de Automações, o processo falhará.*

---

## 5. Webhooks Nativos

Se o tipo for `"webhook"`, não preencha `"atividade"`. Em vez disso, passe as configurações HTTP através de `"parametros"`:
```yaml
id: "step_comunicador"
tipo: "webhook"
parametros:
  url: "https://api.meusistema.com.br/update"
  method: "POST"
  payload:
    processamento: "Concluido com sucesso"
navegacao:
  sucesso: "finalizado"
```

---

## 6. O Bloco de Navegação (`navegacao`)

O campo de navegação é obrigatório e dita o fluxo da automação após a finalização da atividade atual.
O sistema avaliará o status retornado pela atividade para definir o próximo step.

**Estrutura de Roteamento:**
```yaml
navegacao:
  sucesso: "step_envio_email"
  falha: "step_revisao_manual"
  default: "finalizado"
```

### Regras do Roteamento
- Você define as chaves de acordo com os _Status_ que espera de retorno. Se a automação ou o humano sinalizarem `sucesso`, o fluxo vai para a etapa `step_envio_email`.
- Usamos a palavra especial **`"finalizado"`** para designar que, a partir desse retorno, o workflow está completamente encerrado e finalizado com sucesso.
- O campo **`"default"`** pode ser utilizado como uma rota *fallback* (usado caso o retorno obtido não seja uma das chaves explícitas).

---

## 7. Contexto Contextual para o Agente ou Humano

Tudo o que for inserido no corpo do Markdown, *de fora do Bloco JSON*, é contexto qualitativo que enriquece os dados.
Recomenda-se adicionar explicações imediatamente cima/abaixo do JSON para guiar quem está avaliando aquela etapa HITL. Esse texto será enviado integralmente via ferramenta do Servidor MCP `start_activity`.

---

## 8. INSTRUÇÕES MANDATÓRIAS PARA AGENTES DE IA (System Prompt)

**ATENÇÃO LLMs e Agentes Autônomos:** Você deve **ESTRITAMENTE** seguir as instruções e o modelo estrutural padrão ao gerar um arquivo Markdown de processo. O sistema de análise falhará criticamente se você não respeitar as formatações exatas demonstradas abaixo.

### 8.1. Regras Estruturais Obrigatórias (CRÍTICO)
1. **Frontmatter YAML Obrigatório:** O arquivo DEVE iniciar obrigatoriamente com um bloco delimitado por `---` contendo o YAML Frontmatter com todas as chaves exigidas (`id`, `version`, `description`, `initial_step`).
2. **Código Markdown `yaml` para Etapas:** As definições em JSON/YAML de todas as etapas (steps) DEVEM ser convertidas para sintaxe pura YAML e DEVEM estar contidas dentro de um bloco de código de linguagem yaml (iniciado por ` ```yaml ` e finalizado por ` ``` `). **NUNCA** deixe o YAML/JSON solto no texto e **NUNCA** use listas de bullet points para descrever as chaves e valores sistêmicos de configuração do processo.
3. **Ponteiros de Navegação Exatos:** Ao nomear os rumos do fluxo no campo `navegacao`, baseie-se nos resultados lógicos da atividade. Use exatamente os identificadores (`id`) dos próximos passos. Para sinalizar o fim global do processo sob aquela rota, use o valor estrito de string: `"finalizado"`.

### 8.2. Template Estrito de Geração
Sempre utilize este exato design de estrutura como sua fundação basal ao gerar as propostas de Processos Markdown. Ao redigir a instrução a um humano no HITL, detalhe antes do bloco yaml as chaves que ele deve retornar via ferramenta.

```markdown
---
id: "identificador_unico_sem_espaco"
version: "1.0.0"
description: "Explique em uma frase resumida a função do processo"
initial_step: "step_inicial"
---

# Título do Modelo de Processo

Adicione contexto geral da finalidade deste fluxo inteiro.

### Etapa 1: Coletar de Dados
Instrução direta ao usuário na tela sobre o que analisar ou informar nesta etapa. Para avançar usando as ferramentas do MCP, envie os status "sucesso" ou "rejeitado".

\`\`\`yaml
id: "step_inicial"
tipo: "hitl_humano"
navegacao:
  sucesso: "step_aprovacao_final"
  rejeitado: "finalizado"
\`\`\`

### Etapa 2: Processamento e Finalização Estrutural
Mais orientações situacionais em linguajar natural para que o avaliador ou o debugador compreenda a sequência.

\`\`\`yaml
id: "step_aprovacao_final"
tipo: "automatizada"
atividade: "referencia_logica_worker"
navegacao:
  sucesso: "finalizado"
\`\`\`
```

### 8.3. Atividades Automatizadas Disponíveis
Se for configurar uma etapa utilizando `"tipo": "automatizada"`, você **deve** referenciar uma das seguintes atividades previamente conhecidas no servidor Worker da infraestrutura pelo campo `"atividade"`:
- **`extrair_dados_basicos`**: Uma simulação padrão que extrai/mocka dados iniciais ou secundários dentro do Worker e salva no payload.

---

## 9. Referência Completa de Campos (Validação Sistêmica)

O sistema utiliza validação rígida (Zod) ao processar os arquivos Markdown. **Somente os campos listados abaixo são aceitos.** Qualquer campo diferente será **ignorado ou causará erro.**

### 9.1. Campos do Frontmatter (entre `---`)

| Campo | Obrigatório | Tipo | Descrição |
| :--- | :---: | :--- | :--- |
| `id` | ✅ Sim | string | Identificador único do processo (snake_case, sem espaços) |
| `version` | ✅ Sim | string | Versão semântica. Ex: `"1.0.0"` |
| `description` | ❌ Não | string | Breve explicação do que o processo resolve |
| `abreviacao` | ❌ Não | string | Abreviação curta usada na geração de IDs de execução |
| `initial_step` | ✅ Sim | string | O `id` exato da primeira etapa a ser executada |

### 9.2. Campos de cada Etapa (dentro de blocos ` ```yaml ``` `)

| Campo | Obrigatório | Tipo | Valores Aceitos / Descrição |
| :--- | :---: | :--- | :--- |
| `id` | ✅ Sim | string | Identificador único do step (snake_case) |
| `tipo` | ✅ Sim | enum estrito | `hitl_humano`, `hitl_agente`, `webhook`, `automatizada` |
| `atividade` | Condicional | string | **Obrigatório** se `tipo` = `automatizada`. Deve referenciar uma função registrada no Worker. |
| `parametros` | ❌ Não | Record (chave: valor) | Parâmetros livres. Usado principalmente com `tipo: webhook` para `url`, `method`, `payload`. |
| `navegacao` | ✅ Sim | Record (resultado: próximo_step) | Mapa de navegação. Chaves = status esperados. Valores = `id` do próximo step ou `"finalizado"`. |

---

## 10. Anti-Patterns — Erros Comuns que INVALIDAM o Processo

> **ATENÇÃO: Os erros abaixo são os mais frequentes e causam falha total no sistema. Evite-os a todo custo.**

### ❌ NUNCA coloque as etapas (steps) dentro do Frontmatter
O Frontmatter contém **apenas** `id`, `version`, `description`, `abreviacao` e `initial_step`. As etapas são definidas em blocos ` ```yaml ``` ` separados no corpo do Markdown.

### ❌ NUNCA use nomes de campos inventados
Os seguintes campos **NÃO EXISTEM** no sistema e causarão erro:
- `name`, `processId`, `type`, `parameters`, `nextSteps`, `condition`, `steps`, `enum`, `required`

### ❌ NUNCA use listas YAML para definir steps
Cada step é um **bloco individual** ` ```yaml ``` ` com campos planos, não uma lista `- id: ...` dentro de outro bloco.

### ❌ NUNCA omita o campo `navegacao`
Toda etapa deve ter o campo `navegacao` com pelo menos uma rota (ex: `sucesso: "finalizado"` ou `default: "finalizado"`).

### ❌ NUNCA use `type: human` em vez de `tipo: hitl_humano`
Os campos são em **português**. Use `tipo`, `navegacao`, `atividade`, `parametros` — nunca traduções em inglês.

---

## 11. Exemplo Completo Funcional (Referência)

O arquivo abaixo é um processo **real e funcional** no sistema. Use-o como modelo basal ao gerar novos processos:

````markdown
---
id: "processo_onboarding_teste"
version: "1.0.0"
description: "Teste de Onboarding de Cliente com validação sistêmica e aprovação HITL"
abreviacao: "onboard"
initial_step: "step_extrair_dados"
---

# Fluxo de Onboarding de Cliente

Estas são as etapas para executar o processo na prova de conceito.

### Etapa: step_extrair_dados
```yaml
id: step_extrair_dados
tipo: automatizada
atividade: extrair_dados_basicos
navegacao:
  sucesso: step_validacao_hitl
```
Esta etapa apenas simulará a criação de dados básicos pelo *automation-worker*.

### Etapa: step_validacao_hitl
```yaml
id: step_validacao_hitl
tipo: hitl_humano
navegacao:
  aprovado: step_notificar_conclusao
  rejeitado: finalizado
```
**Para o atendente**: Verifique os dados básicos. Chame a ferramenta do MCP retornando o status final: "aprovado" ou "rejeitado".

### Etapa: step_notificar_conclusao
```yaml
id: step_notificar_conclusao
tipo: webhook
parametros:
  url: "https://echo.free.beeceptor.com"
  method: POST
  payload:
    mensagem: "Onboarding concluído com sucesso."
navegacao:
  default: finalizado
```
````

---

## 12. Workflow Obrigatório de Geração (MANDATÓRIO para Agentes de IA)

> **INSTRUÇÃO CRÍTICA:** Ao gerar um arquivo Markdown de Processo, você **DEVE** seguir obrigatoriamente o fluxo abaixo. Não apresente o resultado ao usuário antes de completar todos os passos.

### Passo 1: Ler o Schema
Chame a ferramenta `get_process_schema` para obter este documento com todas as regras atualizadas.

### Passo 2: Gerar o Markdown
Gere o Markdown seguindo estritamente o template da Seção 8.2 e o exemplo da Seção 11. Respeite todos os campos da Seção 9 e evite todos os anti-patterns da Seção 10.

### Passo 3: Validar OBRIGATORIAMENTE
Chame a ferramenta `validate_process_markdown` passando o Markdown gerado como parâmetro. Esta ferramenta executará o Parser e a validação Zod do sistema real.

### Passo 4: Corrigir se necessário
Se a validação retornar erros, corrija o Markdown de acordo com as mensagens de erro e chame `validate_process_markdown` novamente. Repita até obter sucesso.

### Passo 5: Apresentar ao usuário
**SOMENTE** após receber a confirmação de "Markdown válido!" da ferramenta de validação, apresente o resultado ao usuário ou prossiga com o registro via `register_process_markdown`.
