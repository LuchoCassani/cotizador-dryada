# Tasks: docker-railway-deploy

**Feature**: docker-railway-deploy
**Plan**: specs/docker-railway-deploy/plan.md
**Generated**: 2026-06-14

---

## TASK-001: Reescribir backend/Dockerfile con Debian Slim, better-sqlite3 nativo y PrusaSlicer

**Status**: completed
**Requirements**: FR-001, FR-002, FR-011, NFR-001, NFR-002, NFR-005, NFR-006, EC-001, EC-002
**Complexity**: L
**Depends on**: none
**Files**: `backend/Dockerfile`

### Description
Reescribir el Dockerfile del backend completo. Stage `build`: imagen base `node:20-bookworm-slim`, instalar herramientas de sistema (`python3 make g++ curl squashfs-tools`), correr `npm ci`, compilar TypeScript con `npx tsc`, descargar el AppImage de PrusaSlicer y extraerlo con `unsquashfs -o 193728`. Stage `runtime`: imagen base `node:20-bookworm-slim` limpia, copiar `dist/` y `node_modules/` del stage build (el binario nativo `.node` de `better-sqlite3` viaja aquí), instalar dependencias de sistema de PrusaSlicer (`libglib2.0-0 libgl1 libgtk-3-0` y el resto del listado en C-5), copiar el directorio extraído de PrusaSlicer y crear el symlink en `/usr/local/bin/prusa-slicer`, crear usuario no-root `appuser`, crear `/app/data` con `chown appuser`, cambiar a `USER appuser`, exponer puerto 3001, `CMD ["node", "dist/server.js"]`.

### Validation
`docker build --platform linux/amd64 -t backend-test ./backend` completa sin error. `docker run --rm backend-test prusa-slicer --version` imprime la versión de PrusaSlicer. `docker run --rm -u appuser backend-test whoami` devuelve `appuser`. El tamaño de imagen reportado por `docker images backend-test` es menor a 1GB.

---

## TASK-002: Agregar data/*.db a backend/.dockerignore

**Status**: completed
**Requirements**: FR-005
**Complexity**: S
**Depends on**: none
**Files**: `backend/.dockerignore`

### Description
Agregar la línea `data/*.db` al archivo `backend/.dockerignore` existente. También agregar `data/*.db-shm` y `data/*.db-wal` para excluir los archivos WAL de SQLite que aparecen en el directorio `backend/data/`.

### Validation
El archivo `backend/.dockerignore` contiene las líneas `data/*.db`, `data/*.db-shm`, `data/*.db-wal`. Al buildear la imagen del backend, el comando `docker run --rm backend-test ls /app/data/` no muestra archivos `.db` copiados desde el contexto del build.

---

## TASK-003: Agregar bind mount de SQLite en docker-compose.yml

**Status**: completed
**Requirements**: FR-006, C-3
**Complexity**: S
**Depends on**: none
**Files**: `docker-compose.yml`

### Description
En el servicio `backend` del `docker-compose.yml`, agregar una sección `volumes` con el bind mount `./backend/data:/app/data`. Esto garantiza que el archivo SQLite persista en disco local entre reinicios del contenedor en desarrollo.

### Validation
`docker compose up` levanta ambos servicios. Después de cotizar algo y reiniciar con `docker compose restart backend`, los datos (materiales, máquinas, parámetros) siguen disponibles. El archivo `backend/data/cotizador.db` existe en el host tras el primer arranque.

---

## TASK-004: Verificar endpoint GET /health en backend/src/server.ts

**Status**: completed
**Requirements**: FR-008, NFR-004, EC-005
**Complexity**: S
**Depends on**: none
**Files**: `backend/src/server.ts`

### Description
Confirmar que el endpoint `GET /health` existe en `server.ts`, responde `200 { "status": "ok" }` y está fuera del alcance del hook de Bearer token (el hook solo aplica a rutas que empiezan con `/api/`). Si la ruta no existe o tiene algún problema, crearla/corregirla en este task.

### Validation
`curl http://localhost:3001/health` (sin header Authorization) devuelve `{"status":"ok"}` con código 200. Con `API_TOKEN` seteado, el mismo curl sigue respondiendo 200 sin token — confirma que el hook de auth no intercepta `/health`.

---

## TASK-005: Verificar archivos de frontend contra spec

**Status**: completed
**Requirements**: FR-003, FR-004, FR-005, FR-007
**Complexity**: S
**Depends on**: none
**Files**: `frontend/Dockerfile`, `frontend/nginx.conf`, `frontend/.dockerignore`, `frontend/vite.config.ts`

### Description
Revisar los cuatro archivos de frontend existentes y confirmar que cumplen los requisitos de la spec. `frontend/Dockerfile`: dos stages, `node:20-alpine` build con ARGs `VITE_API_URL` y `VITE_API_TOKEN`, `nginx:alpine` runtime (FR-003). `frontend/nginx.conf`: SPA fallback `try_files`, gzip, caché 1 año para assets hasheados, no-cache para `index.html`, security headers (FR-004). `frontend/.dockerignore`: excluye `node_modules/`, `dist/`, `.env*`, `*.log` (FR-005). `frontend/vite.config.ts`: proxy target lee `process.env.BACKEND_URL` con fallback a `http://localhost:3001` (FR-007). Si algún archivo no cumple, corregirlo en este task.

### Validation
`docker build --platform linux/amd64 --build-arg VITE_API_URL=http://localhost:3001 -t frontend-test ./frontend` completa sin error. `docker run --rm -p 8080:80 frontend-test` sirve la app en `http://localhost:8080`. `curl -I http://localhost:8080/` incluye los headers de seguridad (`X-Frame-Options`, `Content-Security-Policy`).

---

## TASK-006: Verificar .github/workflows/deploy.yml contra spec

**Status**: completed
**Requirements**: FR-009, FR-010, NFR-003, EC-004
**Complexity**: S
**Depends on**: none
**Files**: `.github/workflows/deploy.yml`

### Description
Revisar el pipeline existente y confirmar que cumple FR-009 y FR-010: tres jobs (`typecheck`, `test`, `deploy`), `typecheck` corre `tsc --noEmit` en backend y frontend, `test` depende de `typecheck` y corre vitest, `deploy` depende de ambos y solo corre en push a `main`, usa `railway up --service backend` y `railway up --service frontend` con `--build-arg VITE_API_URL=${{ vars.RAILWAY_BACKEND_URL }}`. Si hay gaps, corregirlos en este task.

### Validation
El archivo `.github/workflows/deploy.yml` tiene los tres jobs con las dependencias correctas. En un PR (no push a main), solo corren `typecheck` y `test` — `deploy` queda skipped. En un push a main, los tres jobs corren en orden.

---

## TASK-007: Setup Railway y primer deploy

**Status**: pending
**Requirements**: FR-011, EC-003, EC-006, EC-007
**Complexity**: M
**Depends on**: TASK-001, TASK-002, TASK-003, TASK-004, TASK-005, TASK-006

### Description
Configuración manual de Railway y ejecución del primer deploy. Pasos: (1) Crear proyecto Railway con dos servicios: `backend` y `frontend`. (2) Crear Railway Volume `cotizador-db` montado en `/app/data` en el servicio `backend` — esto debe hacerse ANTES del primer deploy. (3) Setear todas las variables de entorno del backend según §8 de la spec: `DB_PATH=/app/data/cotizador.db`, `UPLOADS_DIR=/tmp/cotizador-uploads`, `PRUSASLICER_BIN=prusa-slicer`, `PRUSA_LAYER_HEIGHT=0.20`, `API_TOKEN`, `FRONTEND_URL` (URL pública del frontend, disponible después de crear el servicio), `SMTP_*`, `EMAIL_FROM`, `UPLOAD_MAX_MB=50`. (4) Setear en GitHub Actions: secret `RAILWAY_TOKEN` y variable `RAILWAY_BACKEND_URL`. (5) Hacer push a `main` para disparar el pipeline. (6) Verificar que el healthcheck de Railway pase en el servicio backend.

### Validation
El pipeline de GitHub Actions completa los tres jobs en verde. `curl https://<backend-url>/health` devuelve `{"status":"ok"}`. La URL pública del frontend carga la app. Subiendo un STL y cotizando, el resultado llega correctamente. Reiniciando el servicio backend desde el dashboard de Railway, los datos de SQLite persisten (Volume funciona).
