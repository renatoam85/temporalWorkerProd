# ============================================
# Stage 1: Builder
# ============================================
FROM node:20-slim AS builder

WORKDIR /app

# Copiar manifestos de dependência primeiro (cache de camada)
COPY package.json package-lock.json ./

# Instalar TODAS as dependências (inclui devDeps para compilar TS)
RUN npm ci

# Copiar código fonte e compilar
COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ============================================
# Stage 2: Runner (Produção)
# ============================================
FROM node:20-slim AS runner

WORKDIR /app

# Copiar manifestos e instalar apenas produção
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copiar build compilado
COPY --from=builder /app/dist ./dist

# Copiar arquivos de runtime necessários
COPY WORKFLOW_SCHEMA.md ./

# Criar diretórios de dados com permissões apropriadas
RUN mkdir -p /app/data /app/tempFiles

# Variáveis de ambiente com defaults sensatos
ENV NODE_ENV=production
ENV MCP_PORT=3100

# Expor apenas a porta do MCP Server (HTTP/SSE)
EXPOSE ${MCP_PORT}

CMD ["npm", "start"]
