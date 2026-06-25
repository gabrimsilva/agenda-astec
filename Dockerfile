# ============================================================
#  ASTEC - Gestor de Agenda
#  Build em multi-stage: compila o app e gera uma imagem enxuta
#  de produção com Chromium do sistema (para o Puppeteer/RAT).
# ============================================================

# ---------- Stage 1: build ----------
FROM node:20-bookworm-slim AS builder

# Evita que o puppeteer baixe o Chromium no npm install (usamos o do sistema)
ENV PUPPETEER_SKIP_DOWNLOAD=true

WORKDIR /app

# Ferramentas para compilar módulos nativos (bcrypt etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Instala dependências (inclui devDependencies, necessárias para o build)
COPY package*.json ./
RUN npm ci

# Copia o restante do código e gera o build
COPY . .

# Variável embutida no frontend pelo Vite em tempo de build
ARG VITE_ONESIGNAL_APP_ID=""
ENV VITE_ONESIGNAL_APP_ID=$VITE_ONESIGNAL_APP_ID

RUN npm run build

# ---------- Stage 2: runtime ----------
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Chromium do sistema (Puppeteer) + fontes + init leve para PID 1
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation fonts-noto-color-emoji \
      ca-certificates dumb-init \
 && rm -rf /var/lib/apt/lists/*

# Dependências já instaladas e artefatos de build vindos do stage anterior
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Arquivos necessários para o drizzle-kit push (criação/sincronização do schema)
COPY package*.json ./
COPY drizzle.config.ts ./
COPY shared ./shared

# Script de inicialização
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 5000

ENTRYPOINT ["dumb-init", "--", "./docker-entrypoint.sh"]
