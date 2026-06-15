# PrusaSlicer Base Image — Specification

**Version:** 1.0
**Date:** 2026-06-14
**Status:** Specified
**PRD Reference:** None
**Constitution:** Confirmed compliant

---

## 1. Metadata

| Field | Value |
|-------|-------|
| Feature | prusaslicer-base-image |
| Author | LuchoCassani |
| Version | 1.0 |
| Status | Specified |
| Created | 2026-06-14 |
| Last updated | 2026-06-14 |

---

## 2. Context

Cada vez que se hace `railway up --service backend`, Railway ejecuta un Docker build completo del backend. En ese build, la etapa `build` del Dockerfile descarga el AppImage de PrusaSlicer (~300MB desde GitHub Releases) y lo extrae con `unsquashfs` — una operación que toma varios minutos de cómputo en los servidores de Railway. Esto ocurre aunque el código Node.js del backend no haya cambiado en absoluto.

Railway cobra por minutos de build y uso de recursos. Con la imagen actual (1.45GB), el crédito gratuito de $5 se agotó en un solo día de testing con múltiples redeploys. Con el plan Hobby ($5/mes), el patrón de deploys normal del proyecto podría superar ese límite mensualmente.

La solución es extraer PrusaSlicer a una imagen base independiente publicada en GitHub Container Registry (GHCR). El backend hace `FROM ghcr.io/luchocassani/dryada-prusaslicer-base:latest` en su etapa runtime. Railway pullea esa imagen en segundos desde GHCR — no descarga ni extrae nada — y solo buildea el código Node.js encima.

---

## 3. Goals & Non-Goals

### Goals

1. El build del backend en Railway no descarga ni extrae el AppImage de PrusaSlicer.
2. El tiempo de `railway up --service backend` se reduce de ~10 minutos a < 2 minutos.
3. La imagen base de PrusaSlicer se buildea una sola vez (o cuando cambia de versión) vía GitHub Actions con `workflow_dispatch`.
4. La imagen base es pública en GHCR y Railway puede pullearla sin credenciales adicionales.

### Non-Goals

1. **Actualización automática de versión de PrusaSlicer** — Por qué: la versión validada (2.8.1 con offset 193728) requiere testing manual antes de un upgrade. El trigger automático introduciría riesgo de romper el backend sin validación.
2. **Reducir el tamaño de la imagen base** — Por qué: el tamaño está determinado por `libwebkit2gtk-4.1-0` que PrusaSlicer requiere en runtime y no se puede eliminar. Ya se aceptó como restricción en el feature `docker-railway-deploy`.
3. **Imagen base privada / autenticación de GHCR en Railway** — Por qué: complejidad innecesaria para una imagen que no contiene secretos.

---

## 4. User Stories

### Actor: Developer (al actualizar PrusaSlicer)
**Story:** Cuando sale una nueva versión de PrusaSlicer validada, el developer triggerlea el workflow manualmente desde GitHub Actions ingresando el número de versión.
**Acceptance criteria:**
- Dado que el developer hace `workflow_dispatch` con `version=2.9.0`, cuando el workflow completa, entonces `ghcr.io/luchocassani/dryada-prusaslicer-base:2.9.0` y `:latest` existen en GHCR.

### Actor: GitHub Actions CI (en cada push a main)
**Story:** El pipeline de deploy buildea y sube el backend a Railway sin ejecutar ningún paso relacionado con PrusaSlicer.
**Acceptance criteria:**
- Dado un push a main con cambios en `backend/src/`, cuando corre el job `deploy`, entonces `railway up --service backend` completa en < 2 minutos.
- Dado que no hay imagen base en GHCR, cuando corre `railway up --service backend`, entonces el build falla con error legible de Docker (`manifest unknown` o similar).

---

## 5. Functional Requirements

- **FR-001:** Existe `docker/Dockerfile.prusaslicer` que define la imagen base: instala las dependencias de sistema de PrusaSlicer, descarga el AppImage, lo extrae con `unsquashfs -o 193728` y crea el symlink en `/usr/local/bin/prusa-slicer`. El `LD_LIBRARY_PATH=/opt/prusaslicer/lib` está seteado como `ENV`.
- **FR-002:** Existe `.github/workflows/build-prusaslicer-base.yml` con trigger `workflow_dispatch` que acepta un input `version` (default `2.8.1`). El workflow buildea y pushea la imagen con dos tags: `ghcr.io/luchocassani/dryada-prusaslicer-base:<version>` y `ghcr.io/luchocassani/dryada-prusaslicer-base:latest`.
- **FR-003:** El workflow usa `GITHUB_TOKEN` con permiso `packages: write` para autenticarse en GHCR. No requiere secretos adicionales.
- **FR-004:** `backend/Dockerfile` reemplaza la etapa `runtime` para hacer `FROM ghcr.io/luchocassani/dryada-prusaslicer-base:latest`. Las líneas de instalación de dependencias de sistema y extracción de PrusaSlicer se eliminan de esa etapa.
- **FR-005:** La etapa `build` del `backend/Dockerfile` no cambia — sigue usando `node:20-bookworm-slim` con las herramientas de compilación para `better-sqlite3`.
- **FR-006:** `docker/Dockerfile.prusaslicer` incluye un `LABEL` con la versión de PrusaSlicer (`LABEL prusaslicer.version="2.8.1"`).

---

## 6. Non-Functional Requirements

- **NFR-001:** `railway up --service backend` completa en < 2 minutos en condiciones normales (Railway pullea base image en caché + buildea layers de Node.js).
- **NFR-002:** El workflow `build-prusaslicer-base.yml` completa en < 20 minutos en GitHub Actions (límite superior para la descarga + extracción del AppImage).
- **NFR-003:** La imagen base en GHCR es pública — accesible sin autenticación con `docker pull ghcr.io/luchocassani/dryada-prusaslicer-base:latest`.

---

## 7. Technical Design

### Stack

- **GitHub Container Registry (ghcr.io)**: registro de imágenes Docker gratuito para repos públicos.
- **GitHub Actions**: `docker/login-action@v3` + `docker/build-push-action@v5` para el build y push.
- **Docker multi-stage** (en `Dockerfile.prusaslicer`): stage `extractor` con herramientas de build, stage `base` con solo el runtime. Evita que `squashfs-tools` y `curl` queden en la imagen final.

### Architecture

```
GitHub Actions (workflow_dispatch)
  └── build-prusaslicer-base.yml
        ├── Build docker/Dockerfile.prusaslicer
        └── Push ghcr.io/luchocassani/dryada-prusaslicer-base:2.8.1
                                                              :latest

deploy.yml (push to main)
  └── railway up --service backend
        └── Docker build backend/Dockerfile
              ├── Stage build: node:20-bookworm-slim (unchanged)
              └── Stage runtime: FROM ghcr.io/.../dryada-prusaslicer-base:latest
                    └── COPY dist/ node_modules/ from build stage
```

### Decisions & Rationale

**Decision:** Imagen base con two-stage build (extractor + base)
**Context:** `squashfs-tools` y `curl` solo se necesitan para extraer el AppImage, no en runtime.
**Rationale:** Mantener la imagen base limpia reduce su tamaño y superficie de ataque.
**Consequences:** El Dockerfile de la imagen base es un multi-stage; Railway solo ve el stage final.

**Decision:** Tag `latest` apunta siempre a la última versión buildeada
**Context:** El backend Dockerfile hace `FROM .../dryada-prusaslicer-base:latest`.
**Rationale:** Evita tener que actualizar el backend Dockerfile cada vez que cambia la versión de PrusaSlicer. El tag versionado (`2.8.1`) existe para rollback.
**Consequences:** Si se pushea un `latest` roto, el próximo `railway up` falla. Mitigación: siempre testear la imagen base antes de pushear.

---

## 8. Data Models

No aplica — esta feature no toca la base de datos ni modelos de dominio.

---

## 9. API Contracts

No aplica — esta feature no agrega ni modifica endpoints HTTP.

---

## 10. Edge Cases & Error Handling

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| EC-001 | La imagen base no existe en GHCR cuando Railway ejecuta el build | El build falla con `manifest unknown`. El developer debe correr `build-prusaslicer-base.yml` antes del primer deploy. |
| EC-002 | El workflow `build-prusaslicer-base.yml` falla (red, URL del AppImage cambia) | La imagen anterior en GHCR con tag `latest` sigue vigente. El backend continúa deployando sin cambios. El developer investiga y retriggerea. |
| EC-003 | La nueva imagen base rompe el backend en runtime | Rollback: actualizar el tag en `backend/Dockerfile` a la versión anterior (`dryada-prusaslicer-base:2.8.1`) y redeploy. El tag versionado garantiza que la versión anterior siempre esté disponible en GHCR. |
| EC-004 | GHCR está caído cuando Railway ejecuta el build | El build falla con error de red al pullear la base image. No hay mitigación automática — Railway reintenta el deploy o el developer lo triggerlea de nuevo. |

---

## 11. Open Questions

- [ ] ¿Hace falta buildear la imagen base antes de mergear este PR, o el primer deploy puede fallar y se buildea después? — Owner: LuchoCassani — By: antes del primer deploy post-implementación.

---

## Clarifications

<!-- Added by /sdd:clarify. Do not edit manually. -->

### C-2: Dependencias de sistema en la imagen base
**Type:** assumption
**Q:** ¿La imagen base debe incluir todas las dependencias de sistema del backend actual, o solo las de PrusaSlicer?
**A:** Son las mismas. Todas las `lib*` (`libglib2.0-0`, `libwebkit2gtk-4.1-0`, etc.) son requeridas por PrusaSlicer — Node.js no necesita nada extra sobre `node:20-bookworm-slim`. La imagen base incluye todo y la etapa runtime del backend queda sin ningún `apt-get install`.
**Pattern tip:** Cuando extraés dependencias a una imagen base, listá explícitamente qué deps son "del runtime de la app" vs "del binario externo" — facilita decidir qué va en cada capa.

### C-1: Base OS de Dockerfile.prusaslicer
**Type:** assumption
**Q:** ¿Cuál debe ser la imagen base de `Dockerfile.prusaslicer`? ¿`node:20-bookworm-slim` (incluye Node.js) o `debian:bookworm-slim` (más liviana pero el backend tendría que instalar Node.js)?
**A:** `node:20-bookworm-slim` en ambas etapas del multi-stage (extractor y base). El backend hace `FROM` directo sin necesidad de instalar Node.js.
**Pattern tip:** Cuando una imagen base va a ser usada como `FROM` por otro Dockerfile, confirmá explícitamente qué runtime necesita el consumidor — evita sorpresas en la etapa de implementación.
