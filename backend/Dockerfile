# ── Etapa 1: build ────────────────────────────────────────────
FROM node:20-bookworm-slim AS build

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc && cp -r src/data dist/data && npm prune --omit=dev

# ── Etapa 2: runtime ──────────────────────────────────────────
FROM ghcr.io/luchocassani/dryada-prusaslicer-base:latest AS runtime

WORKDIR /app

# node_modules copiado del build stage — incluye el binario nativo de better-sqlite3
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules

RUN mkdir -p /app/data

EXPOSE 3001

CMD ["node", "dist/server.js"]
