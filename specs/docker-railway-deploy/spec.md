# Docker + Railway Deploy — Specification

**Version:** 1.0
**Date:** 2026-06-14
**Status:** Specified
**PRD Reference:** specs/infra-deploy-sdd.md
**Constitution:** Reviewed

---

## 1. Metadata

| Campo | Valor |
|---|---|
| Feature | docker-railway-deploy |
| Autor | Lucho |
| Versión | 1.0 |
| Estado | Specified |
| Creado | 2026-06-14 |
| Última actualización | 2026-06-14 |

---

## 2. Context

El Cotizador Dryada corre actualmente solo en local (`npm run dev`). Esta feature lo lleva a producción en Railway con Docker como unidad de deploy. La referencia de arquitectura ya existe en `specs/infra-deploy-sdd.md`; esta spec concreta la implementación para el estado actual del stack:

- **Backend**: Node.js 20 + Fastify + better-sqlite3 + PrusaSlicer CLI
- **Frontend**: React + Vite → SPA estática servida por nginx
- **Base de datos**: SQLite (archivo `.db`), requiere persistencia entre deploys
- **Slicer**: PrusaSlicer CLI instalado en la imagen del backend

Decisiones ya tomadas en el infra doc que se respetan sin discusión:
- Railway como plataforma, plan Hobby
- Docker multi-stage para backend y frontend
- nginx:alpine para servir la SPA
- GitHub Actions como pipeline CI/CD
- `VITE_API_URL` como build arg del frontend

**Adiciones respecto al infra doc** (el doc es previo a SQLite y PrusaSlicer):
- El backend Dockerfile instala PrusaSlicer CLI y sus dependencias en la imagen de runtime
- SQLite se persiste en un Railway Volume montado en `DB_PATH`
- `better-sqlite3` requiere compilación nativa — la imagen base debe tener `python3` y `make` disponibles en la etapa de build, o usar una imagen Debian en lugar de Alpine
- `docker-compose.yml` no incluye PostgreSQL (stack actual es SQLite, no Postgres)

---

## 3. Goals & Non-Goals

### Goals

1. Crear `backend/Dockerfile` multi-stage con Node 20, PrusaSlicer CLI y soporte nativo para `better-sqlite3`.
2. Crear `frontend/Dockerfile` multi-stage con build de Vite y nginx:alpine como runtime.
3. Crear `frontend/nginx.conf` con SPA fallback, caché de assets y compresión gzip.
4. Crear `.dockerignore` en `backend/` y `frontend/`.
5. Crear `docker-compose.yml` en la raíz para levantar el stack localmente (backend + frontend, sin PostgreSQL).
6. Actualizar `vite.config.ts` para leer el target del proxy desde `BACKEND_URL` env var.
7. Agregar endpoint `GET /health` en el backend para el healthcheck de Railway.
8. Crear `.github/workflows/deploy.yml` con pipeline typecheck → test → deploy.
9. Documentar en este spec los pasos de setup en Railway (proyecto, servicios, Volume, variables de entorno).

### Non-Goals

1. Migración a PostgreSQL — la base de datos sigue siendo SQLite con Volume de Railway.
2. Panel de admin, historial de cotizaciones por empleado — scope de N3.
3. SSL/TLS manual — Railway lo provee automáticamente.
4. Nginx reverse proxy en producción — Railway maneja el routing público.
5. Configurar Redis, caches externas u otros servicios.
6. Docker Compose para CI/CD — GitHub Actions corre los jobs nativamente, no en Docker Compose.

---

## 4. User Stories

### Actor: Developer (Lucho)

**Story:** Hacer un push a `main` y que el deploy ocurra automáticamente sin intervención manual.

**Acceptance criteria:**
- Given que hay un push a `main`, when el pipeline CI/CD corre, then typecheck y tests pasan antes de que empiece el deploy.
- Given que typecheck o tests fallan, when el pipeline corre, then el deploy no ocurre y Railway no recibe código roto.
- Given un deploy exitoso, when Railway termina el rollout, then la URL pública del frontend muestra la app y el backend responde en `/health`.

### Actor: Denise / empleada de ventas

**Story:** Abrir una URL en el browser y usar el cotizador sin instalar nada.

**Acceptance criteria:**
- Given la URL del frontend de Railway, when Denise abre el browser, then carga la app correctamente.
- Given que sube un STL y completa el formulario, when presiona "Cotizar", then recibe el resultado (con PrusaSlicer si está disponible, con fallback N1 si no).
- Given que cierra el browser y vuelve al día siguiente, then los materiales, máquinas y parámetros globales están intactos (SQLite persistió en el Volume).

---

## 5. Functional Requirements

| ID | Descripción |
|---|---|
| FR-001 | `backend/Dockerfile` tiene dos stages: `build` (compila TypeScript, incluye devDeps y herramientas nativas para `better-sqlite3`) y `runtime` (solo deps de producción + dist compilado). |
| FR-002 | El stage `runtime` del backend instala PrusaSlicer CLI. El binario queda disponible en el PATH como `prusa-slicer`. |
| FR-003 | `frontend/Dockerfile` tiene dos stages: `build` (Vite build con `VITE_API_URL` como `ARG`) y `runtime` (nginx:alpine sirviendo `/usr/share/nginx/html`). |
| FR-004 | `frontend/nginx.conf` configura: SPA fallback (`try_files $uri /index.html`), caché 1 año para assets con hash, no-cache para `index.html`, compresión gzip. |
| FR-005 | `backend/.dockerignore` y `frontend/.dockerignore` excluyen `node_modules/`, `dist/`, `.env*`, `*.log`, `data/*.db`. |
| FR-006 | `docker-compose.yml` en la raíz levanta `backend` (port 3001) y `frontend` (port 5173) con hot reload. Sin servicio de PostgreSQL. |
| FR-007 | `vite.config.ts` lee el target del proxy desde `process.env.BACKEND_URL` (fallback `http://localhost:3001`). |
| FR-008 | El backend expone `GET /health` que responde `200 { status: 'ok' }` sin autenticación (sin Bearer token para este endpoint). |
| FR-009 | `.github/workflows/deploy.yml` define tres jobs: `typecheck` (tsc --noEmit en backend y frontend), `test` (vitest en backend, requiere typecheck), `deploy` (Railway CLI, requiere typecheck + test, solo en push a `main`). |
| FR-010 | El job `deploy` hace `railway up` para backend y frontend por separado. El frontend se buildea con `--build-arg VITE_API_URL=${{ vars.RAILWAY_BACKEND_URL }}`. |
| FR-011 | La base de datos SQLite se persiste en un Railway Volume montado en el path de `DB_PATH`. El Dockerfile crea el directorio `/app/data` con permisos correctos para el usuario no-root. |

---

## 6. Non-Functional Requirements

| ID | Descripción |
|---|---|
| NFR-001 | La imagen de runtime del backend pesa menos de 500MB (multi-stage elimina devDeps y fuentes TypeScript). |
| NFR-002 | El backend corre como usuario no-root en producción (`adduser appuser`). |
| NFR-003 | El pipeline completo (typecheck + test + deploy) tarda menos de 5 minutos en condiciones normales. |
| NFR-004 | El endpoint `/health` no requiere autenticación — Railway necesita acceder a él sin Bearer token para el healthcheck. |
| NFR-005 | `UPLOADS_DIR` dentro del contenedor apunta a un directorio efímero (dentro de `/tmp`). Los STLs son temporales; no requieren Volume. |
| NFR-006 | El Dockerfile del backend soporta compilación nativa de `better-sqlite3` (requiere `python3`, `make`, `g++` en la etapa de build). |

---

## 7. Technical Design

### Estrategia de imagen base para el backend

`better-sqlite3` necesita compilación nativa con `node-gyp`, que a su vez requiere `python3`, `make` y `g++`. En Alpine estos paquetes están disponibles pero el entorno musl puede causar problemas de compatibilidad.

**Decisión**: usar `node:20-bookworm-slim` (Debian Slim) como base para ambas stages del backend. Más pesada que Alpine (~80MB vs ~5MB) pero sin problemas de compatibilidad con `better-sqlite3` ni con el AppImage de PrusaSlicer.

Para el frontend sigue siendo `node:20-alpine` en build y `nginx:alpine` en runtime (sin deps nativas problemáticas).

### Instalación de PrusaSlicer

PrusaSlicer se distribuye como AppImage para Linux, pero los AppImage usan FUSE que no está disponible en Docker. Alternativas:

**Opción elegida**: descargar el AppImage, extraerlo con `--appimage-extract` y copiar el resultado al PATH. El ejecutable extraído puede correr en Linux sin FUSE, sin display (headless para `--export-gcode`).

```dockerfile
# Requiere: apt-get install -y curl squashfs-tools (en el stage que instale PrusaSlicer)
# --appimage-extract no funciona en ARM64 ni en algunos entornos sin FUSE.
# unsquashfs con offset fijo 193728 es el método validado.
RUN curl -sL -o /tmp/PrusaSlicer.AppImage \
      "https://github.com/prusa3d/PrusaSlicer/releases/download/version_2.8.1/PrusaSlicer-2.8.1%2Blinux-x64-newer-distros-GTK3-202409181416.AppImage" \
    && unsquashfs -q -o 193728 -d /tmp/squashfs-root /tmp/PrusaSlicer.AppImage \
    && mv /tmp/squashfs-root/usr /opt/prusaslicer \
    && ln -s /opt/prusaslicer/bin/prusa-slicer /usr/local/bin/prusa-slicer \
    && rm -rf /tmp/PrusaSlicer.AppImage /tmp/squashfs-root
```

Dependencias runtime del sistema operativo requeridas (instalar junto con PrusaSlicer):
`libglib2.0-0 libgl1 libgtk-3-0 libgdk-pixbuf2.0-0 libatk1.0-0 libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libharfbuzz0b libfontconfig1 libfreetype6 libx11-6 libwebkit2gtk-4.1-0`

### Persistencia de SQLite en Railway

Railway destruye el filesystem del contenedor en cada deploy. `DB_PATH=./data/cotizador.db` apunta a un archivo dentro del contenedor que se pierde.

**Solución**: Railway Volume — disco persistente que sobrevive a los redeploys.

Configuración:
- Crear Volume en Railway: `cotizador-db` montado en `/app/data`
- `DB_PATH` se setea como `/app/data/cotizador.db` en las variables del servicio backend

### Estructura de archivos nuevos

```
cotizador-dryada/
├── docker-compose.yml          [create]
├── .github/
│   └── workflows/
│       └── deploy.yml          [create]
├── backend/
│   ├── Dockerfile              [create]
│   └── .dockerignore           [create]
└── frontend/
    ├── Dockerfile              [create]
    ├── nginx.conf              [create]
    ├── .dockerignore           [create]
    └── vite.config.ts          [modify]
```

Backend también requiere:
- `backend/src/server.ts` [modify] — agregar ruta `/health`

---

## 8. Data Models

No hay cambios en modelos de datos. SQLite schema se mantiene igual; el Volume solo cambia dónde vive el archivo.

### Variables de entorno del backend en Railway

| Variable | Valor en Railway | Descripción |
|---|---|---|
| `PORT` | (Railway lo inyecta) | Puerto de Fastify |
| `DB_PATH` | `/app/data/cotizador.db` | Path del Volume |
| `UPLOADS_DIR` | `/tmp/cotizador-uploads` | Efímero, OK |
| `PRUSASLICER_BIN` | `prusa-slicer` | En el PATH del contenedor |
| `PRUSA_LAYER_HEIGHT` | `0.20` | Default |
| `SMTP_HOST` | `smtp.gmail.com` | |
| `SMTP_PORT` | `587` | |
| `SMTP_USER` | `<email real>` | |
| `SMTP_PASS` | `<app password>` | |
| `EMAIL_FROM` | `"Cotizador Dryada <...>"` | |
| `UPLOAD_MAX_MB` | `50` | |
| `API_TOKEN` | `<token secreto>` | Bearer token para todas las rutas /api/* |
| `FRONTEND_URL` | URL pública del frontend en Railway | CORS origin del backend — requerido en producción |

### Variables del frontend en Railway

| Variable | Valor | Descripción |
|---|---|---|
| `VITE_API_URL` | URL pública del backend | Build arg, se hornea en el bundle |

### Secretos y variables de GitHub Actions

| Nombre | Tipo | Descripción |
|---|---|---|
| `RAILWAY_TOKEN` | Secret | Token del Railway CLI |
| `RAILWAY_BACKEND_URL` | Variable | URL pública del backend, usada al buildear el frontend |

---

## 9. API Contracts

### GET /health

**Sin autenticación** (excepción explícita al hook de Bearer token).

```
GET /health
→ 200 { "status": "ok" }
```

Railway usa este endpoint como healthcheck antes de redirigir tráfico al nuevo contenedor.

---

## 10. Edge Cases & Error Handling

| ID | Escenario | Comportamiento esperado |
|---|---|---|
| EC-001 | `better-sqlite3` falla al compilar en Docker (musl/Alpine incompatibilidad) | Usar `node:20-bookworm-slim` en lugar de Alpine. La etapa de build incluye `python3`, `make`, `g++`. |
| EC-002 | PrusaSlicer AppImage no puede extraerse headless (necesita display) | Solo `--export-gcode` necesita ser headless. Verificar con `DISPLAY=` vacío antes de incluir en Dockerfile. Si falla, agregar Xvfb o descartar el binario de Railway (fallback N1 siempre). |
| EC-003 | Railway Volume no montado → `DB_PATH` no existe | El servidor arranca pero falla al intentar abrir la DB. Railway muestra el error en los logs. Solución: verificar que el Volume esté configurado en el dashboard antes del primer deploy. |
| EC-004 | El pipeline falla en `typecheck` | El job `test` y `deploy` no corren. Railway no recibe código roto. |
| EC-005 | El deploy falla el healthcheck de Railway | Railway no redirige tráfico al nuevo contenedor y mantiene el deploy anterior activo (rollback automático). |
| EC-006 | `VITE_API_URL` no configurada en el build del frontend | Vite lo hornea como `undefined`. Todas las llamadas a `/api` fallan. Mitigación: el pipeline valida que `vars.RAILWAY_BACKEND_URL` exista antes de buildear. |
| EC-007 | `UPLOAD_MAX_MB` no seteado en Railway | El default del código es 50MB. Comportamiento correcto sin la variable. |

---

## 11. Open Questions

| ID | Pregunta | Responsable | Deadline |
|---|---|---|---|
| OQ-001 | ¿PrusaSlicer AppImage extraído corre `--export-gcode` sin Xvfb en un contenedor Debian sin display? Verificar con prueba local antes de buildear la imagen de producción. | Lucho | Antes de TASK de Dockerfile backend |
| OQ-002 | ¿Qué versión exacta de PrusaSlicer usar? La 2.8.1 aparece en el diseño. ¿Es la última con CLI estable? | Lucho | Antes de TASK de Dockerfile backend |
| OQ-003 | ¿El Railway Volume necesita configurarse antes del primer deploy o puede agregarse después? Si la DB se crea sin Volume, los datos del primer run se pierden. | Lucho | Antes del primer deploy |
| OQ-004 | ¿El plan Hobby de Railway soporta Volumes? Confirmar en el dashboard de Railway. | Lucho | Antes de crear el proyecto |

---

## 12. Clarifications

### C-1: PrusaSlicer headless — validación pendiente bloquea el Dockerfile
**Type:** pregunta abierta sin resolver (OQ-001)
**Q:** ¿Verificaste que PrusaSlicer AppImage extraído corre `--export-gcode` sin display? ¿Cómo arrancamos con el Dockerfile dado que no está validado?
**A:** No se validó nada relacionado a PrusaSlicer headless. Decisión: resolver headless primero antes de dockerizar. Esta feature NO instala PrusaSlicer en el Dockerfile. FR-002 queda diferido. El backend en Railway corre con fallback N1 (fórmula geométrica). PrusaSlicer se integra en una feature separada posterior, una vez validado el enfoque headless en un contenedor Debian sin display.
**Pattern tip:** Cuando una decisión técnica depende de una prueba de concepto no ejecutada, registrala como OQ con owner y deadline — así el riesgo no queda enterrado en el diseño.

### C-2: better-sqlite3 — cómo llegan las deps de producción al stage runtime
**Type:** ambigüedad (FR-001)
**Q:** FR-001 dice "runtime tiene solo deps de producción", pero `better-sqlite3` tiene un binario nativo compilado. Si runtime corre `npm ci --omit=dev` sin herramientas de build, falla. ¿Cómo se resuelve?
**A:** Copiar `node_modules` completo del stage build con `COPY --from=build /app/node_modules ./node_modules`. El binario `.node` ya está compilado. El stage runtime no necesita python3/make/g++. FR-001 se actualiza para reflejar esto: el runtime no re-instala deps, las copia del build stage.
**Pattern tip:** En Dockerfiles multi-stage con módulos nativos, nunca asumas que `npm ci` en el runtime stage resuelve sólo — los binarios compilados deben venir del stage de build.

### C-3: SQLite en docker-compose local — persistencia entre reinicios
**Type:** ambigüedad (FR-006)
**Q:** El docker-compose no monta volumen para `./data`. En dev con docker-compose, el SQLite se perdería al reiniciar el contenedor. ¿Es aceptable o se necesita persistencia?
**A:** Agregar bind mount: `- ./backend/data:/app/data` en el servicio backend del docker-compose. El archivo `.db` persiste en el directorio local (ya en `.gitignore`). FR-006 se actualiza para incluir este volumen.
**Pattern tip:** Siempre definir explícitamente en la spec qué datos persisten en el entorno local y cuáles son efímeros — es fácil olvidar que los contenedores pierden estado al reiniciarse.

### C-4: FRONTEND_URL ausente de la tabla de env vars del backend
**Type:** structural gap (§8)
**Q:** El backend usa `process.env.FRONTEND_URL` para configurar CORS. Si no se setea en Railway, el origin default `http://localhost:5173` bloquea el frontend en producción. La variable no estaba en la tabla de §8.
**A:** Agregar `FRONTEND_URL` a la tabla de variables del backend en §8, con valor = URL pública del servicio frontend en Railway. Es una variable de deploy requerida, no opcional.
**Pattern tip:** Toda variable que tenga un default peligroso en producción (un origen localhost, un modo debug, un flag de auth deshabilitado) debe aparecer explícitamente en la tabla de env vars de la spec — el default seguro para dev puede ser un bug silencioso en prod.

### C-5: PrusaSlicer validado headless — decisión de C-1 revisada
**Type:** resolución de OQ-001 y OQ-002
**Q:** Tras la validación en contenedor Debian bookworm-slim, ¿funciona PrusaSlicer 2.8.1 sin display? ¿Incluimos la instalación en esta feature?
**A:** Confirmado que funciona. Hallazgos que afectan el Dockerfile:
- Requiere `--platform linux/amd64` (Railway es AMD64; en Apple Silicon el AppImage ARM64 no existe).
- URL correcta: `PrusaSlicer-2.8.1+linux-x64-newer-distros-GTK3-202409181416.AppImage` (no la URL del diseño original).
- Usar `curl -L` (no `wget` — falla silenciosamente con los redirects de GitHub).
- Extraer con `unsquashfs -o 193728` (no `--appimage-extract` — falla en ARM64 y en algunos entornos).
- Dependencias runtime requeridas: `libglib2.0-0 libgl1 libgtk-3-0 libgdk-pixbuf2.0-0 libatk1.0-0 libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libharfbuzz0b libfontconfig1 libfreetype6 libx11-6 libwebkit2gtk-4.1-0`.
- La decisión de C-1 ("diferir PrusaSlicer") queda revertida. FR-002 se incluye en esta feature. El §7 Technical Design se actualiza con el comando validado.
