---
id: "processo_soma"
versao: "1.0.0"
descricao: "Processo simples para coletar dois números, somá-los com IA e submeter o resultado para aprovação humana"
passo_inicial: "step_informar_numeros"
---

# Processo de Soma

Fluxo simples com três etapas: coleta de dois números por humano, soma automatizada por IA e aprovação final por humano.

### Etapa 1: Informar dois números
O usuário humano deve informar dois números para serem utilizados no cálculo. Para avançar, conclua esta tarefa com status `sucesso` e retorne no payload os campos `numero1` e `numero2`.

```yaml
id: "step_informar_numeros"
tipo: "tarefa_humana"
navegacao:
  sucesso: "step_somar_numeros"
  falha: "finalizado"
```

### Etapa 2: Somar os números com IA
A IA deve ler os valores `numero1` e `numero2` do contexto da execução, calcular a soma e registrar o resultado no payload no campo `resultado`.

```yaml
id: "step_somar_numeros"
tipo: "executar_com_ia"
navegacao:
  sucesso: "step_aprovar_resultado"
  falha: "finalizado"
```

### Etapa 3: Aprovar ou reprovar o resultado
O humano deve verificar os números informados e o resultado calculado. Para avançar, conclua esta tarefa com status `aprovado` ou `rejeitado`.

```yaml
id: "step_aprovar_resultado"
tipo: "tarefa_humana"
navegacao:
  aprovado: "finalizado"
  rejeitado: "finalizado"
```
