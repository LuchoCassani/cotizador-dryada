# Plan: PrusaSlicer Base Image

## Architecture

El cambio afecta exclusivamente la capa de infraestructura Docker y CI/CD. No hay cambios en código de aplicación (Node.js, TypeScript, rutas Fastify).

El flujo resultante tiene dos pipelines independientes:

**Pipeline 1 — Base image (manual, infrecuente):**
```
developer → workflow_dispatch en GitHub → build-prusaslicer-base.yml
  → docker build docker/Dockerfile.prusaslicer
  → docker push ghcr.io/luchocassani/dryada-prusaslicer-base:2.8.1
  → docker push ghcr.io/luchocassani/dryada-prusaslicer-base:latest
```

**Pipeline 2 — Backend deploy (automático, en cada push a main):**
```
push a main → deploy.yml → railway up --service backend
  → Docker build backend/Dockerfile
      Stage build: node:20-bookworm-slim → compila TS, compila better-sqlite3
      Stage runtime: FROM ghcr.io/.../dryada-prusaslicer-base:latest
        (Railway pullea desde GHCR — PrusaSlicer ya está adentro)
        → COPY dist/ node_modules/ from build stage
        → CMD node dist/server.js
```

`docker/Dockerfile.prusaslicer` usa multi-stage internamente:
- Stage `extractor`: `node:20-bookworm-slim` + `squashfs-tools` + `curl` → descarga y extrae PrusaSlicer
- Stage `base`: `node:20-bookworm-slim` limpio → copia `/opt/prusaslicer` + instala runtime libs

Esto garantiza que `squashfs-tools` y `curl` no queden en la imagen final publicada en GHCR.

## Dependencies

**GitHub Actions (nuevas actions):**
- `docker/login-action@v3` — autenticación en ghcr.io con `GITHUB_TOKEN`
- `docker/build-push-action@v5` — build y push multi-platform

**Infraestructura:**
- GitHub Container Registry (ghcr.io) — registro público, sin costo para repos públicos
- `GITHUB_TOKEN` con `permissions: packages: write` — provisto automáticamente por GitHub Actions, sin secrets adicionales

**Sin cambios en:**
- Dependencias npm del backend
- Código TypeScript
- Variables de entorno de Railway

## Files Affected

**CI/CD:**
- `.github/workflows/build-prusaslicer-base.yml` [create] — workflow `workflow_dispatch` para buildear y pushear la imagen base

**Docker:**
- `docker/Dockerfile.prusaslicer` [create] — Dockerfile multi-stage de la imagen base
- `backend/Dockerfile` [modify] — etapa `runtime`: reemplazar `FROM node:20-bookworm-slim` + bloque `apt-get` + bloque PrusaSlicer por `FROM ghcr.io/luchocassani/dryada-prusaslicer-base:latest`

## Risks and Trade-offs

**Riesgo 1 — Orden de operaciones en el primer deploy:**
El backend Dockerfile referencia `ghcr.io/.../dryada-prusaslicer-base:latest`. Si el workflow de la imagen base no se corrió antes del primer `railway up`, el build falla con `manifest unknown`. Mitigación: buildear y pushear la imagen base antes de mergear el PR.

**Riesgo 2 — Tag `latest` mutable:**
Si se pushea una imagen base rota con el tag `latest`, el próximo deploy del backend falla. Mitigación: el tag versionado (`2.8.1`) siempre existe en GHCR para rollback inmediato — basta cambiar el FROM en `backend/Dockerfile` a la versión anterior y redeploy.

**Riesgo 3 — Railway layer cache:**
Railway puede o no cachear la capa base entre builds. Si no cachea, pullea la imagen completa (~1.45GB) cada vez desde GHCR — sigue siendo más rápido que buildear, pero no alcanza el NFR-001 (< 2 min) si la descarga toma más de eso. Railway sí cachea layers en la práctica; riesgo bajo.

**Trade-off — Imagen base separada vs. cache de GitHub Actions:**
La alternativa sería usar `cache-from: type=gha` en el `deploy.yml` para cachear la capa de PrusaSlicer en GitHub Actions. No aplica porque `railway up` sube el contexto a los builders de Railway, que no leen el cache de GitHub Actions. La imagen base en GHCR es la única forma de evitar el rebuild en Railway.

## Decision

See docs/adr/007-prusaslicer-base-image-ghcr.md
