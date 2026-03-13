# Mapa de Funções — Visão por Módulos

## TEMPLATE

### Visão Geral dos Módulos

| Módulo | Arquivo | Tipo | Responsabilidade |
|------|--------|------|------------------|
| <Nome do módulo> | `<arquivo.ts>` | <Específico \| Reutilizável> | <Descrição objetiva> |

---

### Módulo — `<arquivo.ts>`

| Função | Papel | Dependências | Impacto de Mudanças |
|------|------|--------------|---------------------|
| `<nomeDaFuncao>` | <O que faz> | <Funções ou módulos usados> | <Baixo \| Médio \| Alto> |

---

### Módulo — `<outro_arquivo.ts>`

| Função | Categoria | Escopo | Impacto de Mudanças |
|------|-----------|--------|---------------------|
| `<nomeDaFuncao>` | <Infra \| Negócio \| Utilitário> | <Local \| Global> | <Baixo \| Médio \| Alto> |

---

---

## EXEMPLO

### Visão Geral dos Módulos

| Módulo | Arquivo | Tipo | Responsabilidade |
|------|--------|------|------------------|
| Google Search | `google_search.ts` | Específico | Scraping e regras do Google |
| Browser Utils | `browser_utils.ts` | Reutilizável | Utilitários genéricos de navegação |

---

### Módulo — `google_search.ts`

| Função | Papel | Dependências | Impacto de Mudanças |
|------|------|--------------|---------------------|
| `scrapeGoogle()` | Orquestra fluxo, URL e seletores | `launchPersistentBrowser`, `simulateHumanTyping`, `handleCookieConsent` | Médio |

---

### Módulo — `browser_utils.ts`

| Função | Categoria | Escopo | Impacto de Mudanças |
|------|-----------|--------|---------------------|
| `launchPersistentBrowser()` | Infraestrutura | Global | Médio |
| `simulateHumanTyping()` | Comportamento humano | Global | Alto |
| `handleCookieConsent()` | Navegação | Global | Médio |
| `captureFailureScreenshot()` | Observabilidade | Global | Baixo |
