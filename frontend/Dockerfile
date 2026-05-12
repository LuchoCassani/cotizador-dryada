# ── Etapa 1: build ────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

ARG VITE_API_TOKEN
ENV VITE_API_TOKEN=$VITE_API_TOKEN

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.ts tsconfig*.json ./
COPY src/ ./src/
COPY public/ ./public/

RUN npm run build

# ── Etapa 2: runtime con nginx ────────────────────────────────
FROM nginx:alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
