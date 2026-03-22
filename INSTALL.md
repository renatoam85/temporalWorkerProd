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

temporal operator search-attribute create --name StepAfterSignal --type Keyword
```
*Observação: Execute estes comandos através do servidor remoto hospedando o Temporal.*

## Requisitos do Sistema

### PostgreSQL
Certifique-se de que a extensão `uuid-ossp` esteja disponível no seu banco de dados, pois o Temporal utiliza UUIDs para IDs de workflow e tarefas.

### Docker
Configure o Docker para iniciar automaticamente com o Sistema Operacional para garantir a disponibilidade dos serviços.

## Implantação do Temporal
Ao configurar a UI do Temporal, **não utilize o endereço IP** para referenciar o servidor. Utilize nomes de host ou DNS configurados adequadamente.

## Instruções para Atualizações

Para atualizar o `temporal-worker` no Docker, siga os passos abaixo no repositório [temporalWorkerProd](https://github.com/renatoam85/temporalWorkerProd):

1. Baixe as mudanças mais recentes:
   ```bash
   git pull origin main
   ```
2. Reconstrua a imagem Docker:
   ```bash
   docker compose build --no-cache
   ```
3. Reinicie os containers:
   ```bash
   docker compose up -d
   ```
4. Verifique o status e o health check:
   ```bash
   docker compose ps
   curl http://localhost:3100/health
   ```

## Túnel Ngrok

Se precisar refazer o túnel para o worker:
```bash
ngrok config add-authtoken 3BEsgJn6BPryeKSLcTMCNkoYo17_7MEUKngYAvtAhbr4PStT7
ngrok http 3100
```
