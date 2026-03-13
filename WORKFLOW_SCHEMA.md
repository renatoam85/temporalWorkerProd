# Documentação do Schema de Workflows em Markdown

Este documento define as regras e marcações disponíveis para a criação de processos no sistema Orquestrador (Temporal + MCP).
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
Porém, para registrar uma etapa rastreável sistemicamente, você **deve criar um bloco de código do tipo `json`**.

### Modelo de um bloco de Etapa:
```json
{
  "id": "identificador_unico_do_passo",
  "tipo": "hitl_humano",
  "atividade": "nome_da_atividade_registrada", // (Opcional)
  "parametros": { // (Opcional - Pode conter dados soltos)
    "chave": "valor"
  },
  "navegacao": {
    "status_esperado": "id_do_proximo_passo",
    "default": "id_do_passo_fallback"
  }
}
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
```json
{
  "id": "step_extract",
  "tipo": "automatizada",
  "atividade": "extrair_dados_basicos",
  "navegacao": { "sucesso": "finalizado" }
}
```
*Se aividade `extrair_dados_basicos` não existir no Worker de Automações, o processo falhará.*

---

## 5. Webhooks Nativos

Se o tipo for `"webhook"`, não preencha `"atividade"`. Em vez disso, passe as configurações HTTP através de `"parametros"`:
```json
{
  "id": "step_comunicador",
  "tipo": "webhook",
  "parametros": {
    "url": "https://api.meusistema.com.br/update",
    "method": "POST",
    "payload": {
      "processamento": "Concluido com sucesso"
    }
  },
  "navegacao": { "sucesso": "finalizado" }
}
```

---

## 6. O Bloco de Navegação (`navegacao`)

O campo de navegação é obrigatório e dita o fluxo da automação após a finalização da atividade atual.
O sistema avaliará o status retornado pela atividade para definir o próximo step.

**Estrutura de Roteamento:**
```json
"navegacao": {
  "sucesso": "step_envio_email",
  "falha": "step_revisao_manual",
  "default": "finalizado"
}
```

### Regras do Roteamento
- Você define as chaves de acordo com os _Status_ que espera de retorno. Se a automação ou o humano sinalizarem `sucesso`, o fluxo vai para a etapa `step_envio_email`.
- Usamos a palavra especial **`"finalizado"`** para designar que, a partir desse retorno, o workflow está completamente encerrado e finalizado com sucesso.
- O campo **`"default"`** pode ser utilizado como uma rota *fallback* (usado caso o retorno obtido não seja uma das chaves explícitas).

---

## 7. Contexto Contextual para o Agente ou Humano

Tudo o que for inserido no corpo do Markdown, *de fora do Bloco JSON*, é contexto qualitativo que enriquece os dados.
Recomenda-se adicionar explicações imediatamente cima/abaixo do JSON para guiar quem está avaliando aquela etapa HITL. Esse texto será enviado integralmente via ferramenta do Servidor MCP `start_activity`.
