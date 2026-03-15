# Configurações do Ambiente (Temporal Worker)

## Variáveis de Ambiente
Crie um arquivo `.env` contendo o IP do servidor Temporal:
```env
TEMPORAL_SERVER_IP=3.129.253.57
```

## Atributos de Busca Opcionais (Temporal)
É obrigatório registrar esses dois *Search Attributes* no cluster Temporal para que a orquestração dos processos funcione corretamente:

```bash
curl -sSf https://temporal.download/cli.sh | sh

echo 'export PATH="$PATH:/home/ubuntu/.temporalio/bin"' >> ~/.bashrc

source ~/.bashrc

temporal operator search-attribute create --name ProcessName --type Keyword

temporal operator search-attribute create --name ProcessVersion --type Keyword
```
*Observação: Execute estes comandos através do servidor remoto hospedando o Temporal.*
