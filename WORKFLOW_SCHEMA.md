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
