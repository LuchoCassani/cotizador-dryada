# ── Etapa 1: build ────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# ── Etapa 2: runtime ──────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY src/data/ ./dist/data/

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3001

CMD ["node", "dist/server.js"]
