# Tasks: PrusaSlicer Base Image

**Feature**: prusaslicer-base-image
**Plan**: specs/prusaslicer-base-image/plan.md
**Generated**: 2026-06-14

---

## TASK-001: Crear docker/Dockerfile.prusaslicer

**Status**: pending
**Requirements**: FR-001, FR-006, NFR-002, C-1, C-2
**Complexity**: M
**Depends on**: none
**Files**: `docker/Dockerfile.prusaslicer`

### Description
Crear el directorio `docker/` y el archivo `docker/Dockerfile.prusaslicer` con dos stages. Stage `extractor` (`FROM node:20-bookworm-slim`): instalar `squashfs-tools curl ca-certificates`, descargar el AppImage de PrusaSlicer 2.8.1 vía curl, extraer con `unsquashfs -q -o 193728`, mover `squashfs-root/usr` a `/opt/prusaslicer`, limpiar temporales. Stage `base` (`FROM node:20-bookworm-slim`): copiar `/opt/prusaslicer` desde el stage extractor, instalar las dependencias runtime (`libglib2.0-0 libgl1 libgtk-3-0 libgdk-pixbuf2.0-0 libatk1.0-0 libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libharfbuzz0b libfontconfig1 libfreetype6 libx11-6 libwebkit2gtk-4.1-0`), crear symlink `/usr/local/bin/prusa-slicer`, setear `ENV LD_LIBRARY_PATH=/opt/prusaslicer/lib`, agregar `LABEL prusaslicer.version="2.8.1"`.

### Validation
`docker build --platform linux/amd64 -t prusaslicer-base-test -f docker/Dockerfile.prusaslicer .` completa sin error. `docker run --rm prusaslicer-base-test prusa-slicer --version` imprime `PrusaSlicer-2.8.1`. `docker run --rm prusaslicer-base-test node --version` imprime la versión de Node.js (confirma que Node está incluido).

---

## TASK-002: Crear .github/workflows/build-prusaslicer-base.yml

**Status**: pending
**Requirements**: FR-002, FR-003, NFR-002, NFR-003, EC-002, EC-003
**Complexity**: S
**Depends on**: none
**Files**: `.github/workflows/build-prusaslicer-base.yml`

### Description
Crear el workflow de GitHub Actions con trigger `workflow_dispatch` que acepta un input `version` (tipo string, default `2.8.1`). El job corre en `ubuntu-latest` con `permissions: packages: write`. Steps: `actions/checkout@v4`, `docker/login-action@v3` autenticando en `ghcr.io` con `${{ github.actor }}` y `${{ secrets.GITHUB_TOKEN }}`, `docker/build-push-action@v5` con `context: .`, `file: docker/Dockerfile.prusaslicer`, `push: true`, y dos tags: `ghcr.io/luchocassani/dryada-prusaslicer-base:${{ inputs.version }}` y `ghcr.io/luchocassani/dryada-prusaslicer-base:latest`.

### Validation
El archivo existe con la estructura correcta. Al triggerlearlo manualmente desde GitHub Actions → Run workflow con version `2.8.1`, el job completa en verde y `ghcr.io/luchocassani/dryada-prusaslicer-base:2.8.1` y `:latest` son visibles en el tab Packages del repo.

---

## TASK-003: Actualizar etapa runtime de backend/Dockerfile

**Status**: pending
**Requirements**: FR-004, FR-005, NFR-001, EC-001, EC-004
**Complexity**: S
**Depends on**: none
**Files**: `backend/Dockerfile`

### Description
En `backend/Dockerfile`, reemplazar la etapa `runtime` completa. La línea `FROM node:20-bookworm-slim AS runtime` se reemplaza por `FROM ghcr.io/luchocassani/dryada-prusaslicer-base:latest AS runtime`. Eliminar el bloque `RUN apt-get update && apt-get install -y ...` (todas las libs de sistema) y el bloque de descarga/extracción de PrusaSlicer (`RUN curl ... && unsquashfs ...`). Eliminar el `RUN ln -s ...` del symlink y el `ENV LD_LIBRARY_PATH=...` — ya están en la imagen base. Mantener intacta la etapa `build` (sigue siendo `FROM node:20-bookworm-slim AS build`). El resto de la etapa runtime (`COPY --from=build`, `RUN mkdir -p /app/data`, `EXPOSE`, `CMD`) no cambia.

### Validation
`backend/Dockerfile` contiene `FROM ghcr.io/luchocassani/dryada-prusaslicer-base:latest AS runtime` y no contiene ninguna referencia a `apt-get install`, `unsquashfs`, `PrusaSlicer.AppImage`, ni `LD_LIBRARY_PATH` en la etapa runtime. La etapa `build` sigue siendo `FROM node:20-bookworm-slim AS build` sin cambios.

---

## TASK-004: Publicar imagen base en GHCR y verificar deploy del backend

**Status**: pending
**Requirements**: NFR-001, NFR-003, EC-001, EC-002, EC-003, EC-004
**Complexity**: S
**Depends on**: TASK-001, TASK-002, TASK-003

### Description
Paso operacional previo al primer deploy post-implementación. Triggerlear el workflow `build-prusaslicer-base.yml` manualmente desde GitHub Actions con `version=2.8.1`. Una vez que el workflow completa, hacer push a `main` para que el pipeline `deploy.yml` corra `railway up --service backend` usando el nuevo Dockerfile. Verificar que el deploy completa y el backend responde en el healthcheck.

### Validation
`docker pull ghcr.io/luchocassani/dryada-prusaslicer-base:latest` (sin autenticación) descarga la imagen. El pipeline de CI completa el job `Deploy backend` en < 2 minutos. `curl https://backend-production-ff3d.up.railway.app/health` responde `{"status":"ok"}`.

---
