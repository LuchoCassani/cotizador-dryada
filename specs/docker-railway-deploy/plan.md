# Plan: docker-railway-deploy

## Architecture

Esta feature es de infraestructura pura — no hay lógica de negocio nueva. El objetivo es empaquetar el stack existente en imágenes Docker y automatizar su deploy a Railway.

### Dos imágenes Docker independientes

**Backend** (`node:20-bookworm-slim`):
- Stage `build`: instala todas las dependencias (incluidas devDeps para compilar TypeScript y `better-sqlite3` nativo), compila TypeScript a `dist/`, luego instala herramientas del sistema para extraer PrusaSlicer.
- Stage `runtime`: parte de `node:20-bookworm-slim` limpio, copia `dist/` y `node_modules/` del stage build (binario nativo `better-sqlite3` incluido), instala PrusaSlicer y sus dependencias de sistema, crea usuario no-root `appuser`, crea `/app/data` con los permisos correctos.

**Frontend** (`node:20-alpine` → `nginx:alpine`):
- Stage `build`: instala deps, recibe `VITE_API_URL` como build arg, genera `dist/` con Vite.
- Stage `runtime`: nginx:alpine sirviendo `/usr/share/nginx/html`, con SPA fallback, gzip y caché de assets.

### Flujo de un deploy

```
push a main
  → GitHub Actions: typecheck (backend + frontend en paralelo)
  → GitHub Actions: test (vitest backend, depende de typecheck)
  → GitHub Actions: railway up --service backend
  → GitHub Actions: railway up --service frontend --build-arg VITE_API_URL=...
  → Railway: build imagen → healthcheck GET /health → route traffic
```

### Dev local con docker-compose

Dos servicios: `backend` (tsx watch, hot reload) y `frontend` (vite dev, hot reload).
El backend monta `./backend/data:/app/data` como bind mount — SQLite persiste entre reinicios.
El frontend usa `BACKEND_URL=http://backend:3001` para el proxy de Vite.

### Puntos de integración con el stack existente

| Componente | Qué cambia |
|---|---|
| `backend/src/server.ts` | Agregar `GET /health` sin Bearer token |
| `frontend/vite.config.ts` | Proxy target lee `process.env.BACKEND_URL` |
| `backend/Dockerfile` | Reescribir: Debian Slim + better-sqlite3 + PrusaSlicer |
| `docker-compose.yml` | Agregar bind mount para `./backend/data` |
| `backend/.dockerignore` | Agregar `data/*.db` |

---

## Dependencies

### Sistema (en imagen backend)
- `python3`, `make`, `g++`, `curl`, `squashfs-tools` — herramientas de build y extracción (solo stage build)
- `libglib2.0-0 libgl1 libgtk-3-0 libgdk-pixbuf2.0-0 libatk1.0-0 libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libharfbuzz0b libfontconfig1 libfreetype6 libx11-6 libwebkit2gtk-4.1-0` — dependencias runtime de PrusaSlicer

### NPM — sin cambios
No se agregan ni eliminan paquetes. `better-sqlite3` ya es prod dep; su binario compilado viaja desde el stage build.

### Infraestructura externa
- Railway Hobby plan (con soporte de Volumes — confirmar OQ-004 antes del primer deploy)
- GitHub Actions (ya disponible en cualquier repo público/privado)
- PrusaSlicer 2.8.1 AppImage `newer-distros` x64

---

## Files Affected

### Backend
| Archivo | Acción | Motivo |
|---|---|---|
| `backend/Dockerfile` | modify | Reescribir: Debian Slim, COPY node_modules del build stage, PrusaSlicer vía unsquashfs |
| `backend/.dockerignore` | modify | Agregar `data/*.db` (faltaba en FR-005) |
| `backend/src/server.ts` | modify | Agregar `GET /health` sin autenticación (FR-008) |

### Frontend
| Archivo | Acción | Motivo |
|---|---|---|
| `frontend/Dockerfile` | verify/no-op | Ya correcto según spec FR-003 |
| `frontend/nginx.conf` | verify/no-op | Ya correcto según spec FR-004 |
| `frontend/.dockerignore` | verify/no-op | Ya correcto según spec FR-005 |
| `frontend/vite.config.ts` | verify/no-op | Ya lee `BACKEND_URL` según FR-007 |

### Raíz
| Archivo | Acción | Motivo |
|---|---|---|
| `docker-compose.yml` | modify | Agregar `volumes: - ./backend/data:/app/data` (C-3) |
| `.github/workflows/deploy.yml` | verify/no-op | Ya correcto según spec FR-009/FR-010 |

### Infraestructura (configuración manual — sin archivos de código)
- Crear proyecto en Railway con dos servicios: `backend` y `frontend`
- Crear Railway Volume `cotizador-db` montado en `/app/data` del servicio backend
- Setear todas las variables de entorno del backend listadas en §8
- Setear `VITE_API_URL` en el servicio frontend
- Agregar `RAILWAY_TOKEN` y `RAILWAY_BACKEND_URL` a GitHub Actions secrets/variables

---

## Risks and Trade-offs

### Riesgo 1 — Tamaño de imagen del backend (NFR-001: <500MB)
PrusaSlicer extraído + dependencias de sistema + Node.js + node_modules en Debian Slim probablemente supere los 500MB. El NFR-001 puede ser difícil de cumplir con PrusaSlicer incluido.

**Mitigación**: aceptar que la imagen final sea mayor a 500MB si PrusaSlicer lo requiere. El límite de 500MB fue especificado antes de que PrusaSlicer entrara al scope (C-5). Actualizar NFR-001 a <1GB como nuevo target realista.

### Riesgo 2 — Build lento por descarga de PrusaSlicer
El AppImage pesa ~300MB. Railway rebuildeará la imagen en cada deploy y no hay caché garantizado entre builds.

**Mitigación**: usar `--cache-from` en el Railway build o mover la instalación de PrusaSlicer a un stage separado que cambie raramente (Docker cachea por capas). Si el build tarda demasiado, evaluar publicar una imagen base propia con PrusaSlicer ya instalado.

### Riesgo 3 — Railway Volume (OQ-003 y OQ-004)
Si el Volume no está configurado antes del primer deploy, SQLite arranca sin persistencia. Los datos del seed se recrean pero cualquier dato real se pierde al siguiente deploy.

**Mitigación**: el Volume debe crearse en Railway **antes** del primer deploy. Documentar el orden en la guía de setup de Railway (§9 de la spec).

### Riesgo 4 — Variables de entorno faltantes en Railway
Si `FRONTEND_URL` no está seteada, CORS bloquea el frontend en producción silenciosamente. Si `VITE_API_URL` no está como build arg del frontend, el bundle lo hornea como `undefined`.

**Mitigación**: el job `deploy` del pipeline puede validar que las variables existan antes de buildear. Alternativamente, documentar el checklist de variables como requisito previo al primer deploy.

### Trade-off — COPY node_modules vs npm ci en runtime
Copiar `node_modules/` completo del stage build (incluyendo devDeps) hace la imagen más grande pero garantiza que el binario nativo de `better-sqlite3` esté disponible. Alternativa (instalar solo prod deps en runtime) requiere herramientas de build en el stage runtime, que es peor.

**Decisión**: COPY node_modules. Aceptar imagen algo más grande a cambio de simplicidad y confiabilidad.

---

## Decision

Ver `docs/adr/006-docker-deploy-strategy.md`
