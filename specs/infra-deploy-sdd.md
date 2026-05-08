# Software Design Description — Infraestructura y Deploy
## Cotizador Dryada

**Versión:** 1.0  
**Fecha:** 2026-04-29  
**Estado:** Draft — pendiente alineación

---

## 1. Resumen ejecutivo

La infraestructura del Cotizador Dryada se construye sobre **Railway** como plataforma de hosting, **Docker** como unidad de deploy, y **GitHub Actions** como pipeline de CI/CD. La estrategia prioriza la simplicidad operativa: el equipo de desarrollo no gestiona servidores, no configura nginx en producción manualmente, y no necesita conocimientos de DevOps para hacer un deploy.

Railway fue elegido sobre alternativas como Fly.io, Render o un VPS propio por una razón específica: su modelo de proyecto con múltiples servicios permite pasar de N1 (solo backend + frontend) a N2 (agregar PostgreSQL) con un único click en el dashboard, sin migrar la aplicación ni cambiar variables de entorno del resto de los servicios. El costo operativo para el volumen de uso interno de Dryada es predecible y bajo.

La containerización con Docker garantiza paridad entre el entorno de desarrollo local y producción. El mismo `Dockerfile` que corre en la laptop de un desarrollador es el que Railway despliega. Esto elimina la clase de bugs "funciona en mi máquina" y permite que cualquier miembro del equipo pueda reproducir el entorno de producción localmente con un solo comando.

El pipeline de GitHub Actions actúa como gatekeeper: ningún código llega a producción sin pasar por typecheck y tests. En N2, el pipeline también corre las migraciones de Prisma antes de activar el nuevo backend, garantizando que la base de datos esté siempre en el schema correcto antes de que el tráfico llegue al nuevo contenedor.

---

## 2. Arquitectura por nivel

### Nivel 1 — JSON + memoria (estado actual)

**Servicios activos en Railway:**

| Servicio | Imagen | Puerto interno | URL pública |
|---|---|---|---|
| `backend` | `Dockerfile` en `backend/` | 3001 | `https://<RAILWAY_BACKEND_DOMAIN>` |
| `frontend` | `Dockerfile` en `frontend/` | 80 | `https://<RAILWAY_FRONTEND_DOMAIN>` |

**No existe en N1:** PostgreSQL, Redis, worker de slicer.

**Comunicación entre servicios:**

El frontend es una SPA que corre en el browser del usuario. Las llamadas a la API van del browser directamente al backend por URL pública. No hay comunicación server-to-server entre frontend y backend.

```
Browser → https://<RAILWAY_FRONTEND_DOMAIN>  → nginx sirve index.html + assets
Browser → https://<RAILWAY_BACKEND_DOMAIN>/api/...  → Fastify
```

**Variables de entorno en N1:**

| Servicio | Variable | Descripción |
|---|---|---|
| backend | `PORT` | Puerto en el que escucha Fastify (Railway lo inyecta automáticamente) |
| backend | `SMTP_HOST` | Host del servidor SMTP |
| backend | `SMTP_PORT` | Puerto SMTP (587 para STARTTLS) |
| backend | `SMTP_USER` | Usuario Gmail |
| backend | `SMTP_PASS` | App Password de Gmail |
| backend | `EMAIL_FROM` | Nombre y dirección del remitente |
| backend | `UPLOAD_MAX_MB` | Límite de tamaño de archivos STL |
| frontend | `VITE_API_URL` | URL pública del backend, inyectada en build time |

> **Nota sobre `PORT`**: Railway inyecta `PORT` automáticamente en cada servicio. El backend ya lo lee con `process.env.PORT ?? '3001'`. No hace falta definirlo manualmente en el dashboard.

---

### Nivel 2 — PostgreSQL + PrusaSlicer

**Servicios activos en Railway:**

| Servicio | Imagen | Puerto interno | URL pública |
|---|---|---|---|
| `backend` | `Dockerfile` en `backend/` | 3001 | `https://<RAILWAY_BACKEND_DOMAIN>` |
| `frontend` | `Dockerfile` en `frontend/` | 80 | `https://<RAILWAY_FRONTEND_DOMAIN>` |
| `postgres` | `postgres:15` (nativo Railway) | 5432 | solo red interna |

**No existe en N2:** tabla `empleados`, panel de admin, `config_impresion` editable.

**Comunicación entre servicios:**

El backend accede a PostgreSQL por la red interna de Railway (no sale a internet):

```
backend → postgres.railway.internal:5432  (red privada, sin latencia de red pública)
```

**Variables de entorno adicionales en N2:**

| Servicio | Variable | Descripción |
|---|---|---|
| backend | `DATABASE_URL` | Connection string de PostgreSQL. Railway lo genera automáticamente al vincular el servicio Postgres al backend. Formato: `postgresql://postgres:<pass>@postgres.railway.internal:5432/railway` |

> **Cómo vincular en Railway**: en el dashboard, ir al servicio `backend` → Variables → Add Reference → seleccionar el servicio `postgres` → seleccionar `DATABASE_URL`. Railway genera y rota la variable automáticamente.

---

### Nivel 3 — Panel admin, historial, empleados

**Servicios activos en Railway:** los mismos que N2. No se agregan servicios nuevos.

**Cambios en N3:**
- El backend expone nuevas rutas para el panel de admin (`/api/admin/...`)
- Se activa `PostgresEmpleadoRepository` en `app.ts`
- Las variables de entorno no cambian

---

## 3. Estructura de archivos Docker

### `backend/Dockerfile`

**Propósito:** compilar TypeScript en la etapa de build y generar una imagen de runtime mínima sin devDependencies ni código fuente.

**Por qué multi-stage:** la imagen de build necesita TypeScript, tsx, y todos los `devDependencies`. La imagen de runtime solo necesita el JavaScript compilado y las `dependencies` de producción. Sin multi-stage, la imagen final pesa ~400MB. Con multi-stage, ~120MB.

```dockerfile
# ── Etapa 1: build ────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

# Instalar dependencias primero (capa cacheada si package.json no cambia)
COPY package.json package-lock.json ./
RUN npm ci

# Compilar TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# ── Etapa 2: runtime ──────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Solo dependencias de producción
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copiar el build compilado y los datos estáticos
COPY --from=build /app/dist ./dist
COPY src/data/ ./dist/data/

# Usuario no-root por seguridad
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3001

CMD ["node", "dist/server.js"]
```

**Puerto expuesto:** 3001 (Railway lo mapea al `PORT` que inyecta).

---

### `backend/.dockerignore`

```
node_modules/
dist/
.env
.env.*
*.log
coverage/
.DS_Store
```

---

### `frontend/Dockerfile`

**Propósito:** compilar la SPA con Vite en la etapa de build y servir los archivos estáticos con nginx en runtime.

**Por qué nginx y no `vite preview`:** `vite preview` es una herramienta de revisión post-build, no un servidor de producción. No tiene control de caché, no comprime con gzip, no maneja bien el routing de SPA bajo carga. nginx:alpine es una imagen de ~10MB diseñada exactamente para este uso.

**Por qué `VITE_API_URL` como build arg:** Vite reemplaza las variables `VITE_*` en el bundle en tiempo de compilación. No son variables de runtime. Por eso se pasan como `ARG` al Dockerfile y se inyectan con `--build-arg` en el CI.

```dockerfile
# ── Etapa 1: build ────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.ts tsconfig*.json ./
COPY src/ ./src/
COPY public/ ./public/

RUN npm run build

# ── Etapa 2: runtime con nginx ────────────────────────────────
FROM nginx:alpine AS runtime

# Configuración personalizada de nginx (SPA routing + caché + gzip)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Archivos compilados por Vite
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

---

### `frontend/nginx.conf`

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Compresión gzip para assets de texto
    gzip on;
    gzip_types text/plain text/css application/json application/javascript
               text/xml application/xml image/svg+xml font/woff2;
    gzip_min_length 1024;

    # Assets con hash de contenido (Vite): caché agresiva de 1 año
    location ~* \.(js|css|woff2?|png|jpg|svg|ico)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # index.html: nunca cachear (siempre verificar si hay nueva versión)
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # SPA fallback: todas las rutas desconocidas → index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

### `frontend/.dockerignore`

```
node_modules/
dist/
.env
.env.*
*.log
.DS_Store
```

---

### `docker-compose.yml` (raíz — desarrollo local)

**Propósito:** levantar el stack completo localmente con hot reload en backend y HMR en frontend. PostgreSQL local para desarrollo de N2.

**Por qué volúmenes de solo `src/`:** montar `node_modules/` desde el host en el contenedor rompe las dependencias nativas (binarios compilados para el OS del host vs Alpine). Se monta solo el código fuente; las dependencias se instalan dentro del contenedor.

```yaml
services:

  backend:
    build:
      context: ./backend
      target: build          # usa la etapa de build, que tiene tsx y devDeps
    working_dir: /app
    command: npx tsx watch src/server.ts
    ports:
      - "3001:3001"
    volumes:
      - ./backend/src:/app/src:ro    # hot reload: cambios en src/ se reflejan al instante
    env_file:
      - ./backend/.env
    environment:
      PORT: "3001"
    depends_on:
      postgres:
        condition: service_healthy

  frontend:
    build:
      context: ./frontend
      target: build
    working_dir: /app
    command: npx vite --host 0.0.0.0
    ports:
      - "5173:5173"
    volumes:
      - ./frontend/src:/app/src:ro
    environment:
      VITE_API_URL: ""               # vacío: el proxy de vite.config.ts redirige /api al backend
      BACKEND_URL: "http://backend:3001"   # target interno del proxy (ver nota abajo)

  postgres:
    image: postgres:15-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: dryada
      POSTGRES_PASSWORD: dryada_dev
      POSTGRES_DB: cotizador
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dryada -d cotizador"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  postgres_data:
```

> **Nota sobre el proxy en docker-compose:** el proxy de `vite.config.ts` apunta a `http://localhost:3001`. Dentro del contenedor del frontend, `localhost` es el propio contenedor. Para resolver esto en docker-compose, actualizar `vite.config.ts` para leer el target del proxy desde una variable de entorno:
>
> ```typescript
> proxy: {
>   '/api': {
>     target: process.env.BACKEND_URL || 'http://localhost:3001',
>     changeOrigin: true,
>   },
> },
> ```
>
> `BACKEND_URL` se setea en docker-compose; en desarrollo sin Docker sigue usando `localhost:3001`.

---

## 4. Pipeline de CI/CD

### Archivo: `.github/workflows/deploy.yml`

**Trigger:** push a `main`.  
**Filosofía:** si cualquier job falla, el deploy no corre. El orden es: typecheck → deploy.

```yaml
name: CI/CD — Cotizador Dryada

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]     # solo CI, sin deploy en PRs

jobs:

  # ── Typecheck ─────────────────────────────────────────────────
  typecheck:
    name: TypeScript check
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: |
            backend/package-lock.json
            frontend/package-lock.json

      - name: Install backend deps
        run: npm ci
        working-directory: backend

      - name: Install frontend deps
        run: npm ci
        working-directory: frontend

      - name: Typecheck backend
        run: npx tsc --noEmit
        working-directory: backend

      - name: Typecheck frontend
        run: npx tsc --noEmit
        working-directory: frontend

  # ── Tests unitarios ───────────────────────────────────────────
  test:
    name: Unit tests
    runs-on: ubuntu-latest
    needs: typecheck

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json

      - name: Install backend deps
        run: npm ci
        working-directory: backend

      - name: Run tests
        run: npm test --if-present
        working-directory: backend

  # ── Deploy (solo en push a main, no en PRs) ──────────────────
  deploy:
    name: Deploy to Railway
    runs-on: ubuntu-latest
    needs: [typecheck, test]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v4

      - name: Install Railway CLI
        run: npm install -g @railway/cli

      - name: Deploy backend
        run: railway up --service backend --detach
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}

      - name: Deploy frontend
        run: |
          railway up --service frontend \
            --build-arg VITE_API_URL=${{ vars.RAILWAY_BACKEND_URL }} \
            --detach
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

**Secretos y variables de GitHub necesarios:**

| Nombre | Tipo | Descripción |
|---|---|---|
| `RAILWAY_TOKEN` | Secret | Token de Railway. Obtenerlo en Railway → Project Settings → Tokens. |
| `RAILWAY_BACKEND_URL` | Variable (no secret) | URL pública del backend en Railway. Se usa como `VITE_API_URL` al buildear el frontend. Ejemplo: `https://cotizador-dryada-backend.up.railway.app` |

**Estrategia N1 vs N2:**

| Fase | Comportamiento del pipeline |
|---|---|
| **N1** | Deploy directo. No hay migraciones. |
| **N2** | Agregar un step antes del deploy del backend: `railway run --service backend -- npx prisma migrate deploy`. Esto corre las migraciones en el contenedor de producción antes de activar el nuevo código. |

El step de migración en N2:

```yaml
      - name: Run database migrations (N2+)
        run: railway run --service backend -- npx prisma migrate deploy
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        # Solo agregar este step cuando se active N2
```

**Qué pasa si un job falla:**
- Si `typecheck` falla: `test` y `deploy` no corren.
- Si `test` falla: `deploy` no corre.
- Si `deploy` del backend falla: Railway mantiene la versión anterior activa (Railway hace rollback automático si el contenedor no pasa el healthcheck).

---

## 5. Variables de entorno completas

### Backend

| Variable | Descripción | N1 | N2 | Ejemplo |
|---|---|---|---|---|
| `PORT` | Puerto de Fastify. Railway lo inyecta automáticamente. | Automática | Automática | `3001` |
| `SMTP_HOST` | Host del servidor SMTP. | ✅ | ✅ | `smtp.gmail.com` |
| `SMTP_PORT` | Puerto SMTP. | ✅ | ✅ | `587` |
| `SMTP_USER` | Email del remitente (cuenta Gmail). | ✅ | ✅ | `cotizador@dryada.com` |
| `SMTP_PASS` | App Password de Gmail (16 chars). | ✅ | ✅ | `abcd efgh ijkl mnop` |
| `EMAIL_FROM` | Nombre y dirección del remitente. | ✅ | ✅ | `"Cotizador Dryada <cotizador@dryada.com>"` |
| `UPLOAD_MAX_MB` | Límite de tamaño de STL en MB. | ✅ | ✅ | `50` |
| `DATABASE_URL` | Connection string PostgreSQL. Railway lo genera al vincular el servicio. | ❌ | ✅ | `postgresql://postgres:xxx@postgres.railway.internal:5432/railway` |

### Frontend (build args — se hornean en el bundle)

| Variable | Descripción | N1 | N2 | Ejemplo |
|---|---|---|---|---|
| `VITE_API_URL` | URL base del backend. El frontend la usa para todas las llamadas a `/api`. | ✅ | ✅ | `https://cotizador-dryada-backend.up.railway.app` |

### GitHub Actions (Secrets y Variables del repositorio)

| Nombre | Tipo | Descripción |
|---|---|---|
| `RAILWAY_TOKEN` | Secret | Token de autenticación del Railway CLI. |
| `RAILWAY_BACKEND_URL` | Variable | URL pública del backend, usada al buildear el frontend. |

---

## 6. Checklist de deploy inicial (N1)

Pasos en orden. Cada uno debe completarse antes del siguiente.

### Paso 1 — Crear el proyecto en Railway

1. Crear cuenta en [railway.app](https://railway.app) (plan Hobby: $5/mes).
2. Crear nuevo proyecto: **New Project → Empty Project**.
3. Nombrar el proyecto: `cotizador-dryada`.

### Paso 2 — Crear el servicio backend

1. En el proyecto: **New Service → GitHub Repo**.
2. Conectar el repositorio `LuchoCassani/cotizador-dryada`.
3. Configurar el servicio:
   - **Root Directory**: `backend`
   - **Build Command**: *(vacío, Railway detecta el Dockerfile)*
   - **Start Command**: *(vacío, lo lee del Dockerfile)*
4. En **Settings → Networking**: generar un dominio público.
5. Copiar la URL generada (la necesitás en el Paso 4).

### Paso 3 — Crear el servicio frontend

1. En el proyecto: **New Service → GitHub Repo** (mismo repositorio).
2. Configurar el servicio:
   - **Root Directory**: `frontend`
3. En **Settings → Networking**: generar un dominio público.

### Paso 4 — Configurar variables de entorno

**En el servicio backend** (Railway → backend → Variables):

```
SMTP_HOST       = smtp.gmail.com
SMTP_PORT       = 587
SMTP_USER       = <email real>
SMTP_PASS       = <app password real>
EMAIL_FROM      = "Cotizador Dryada <cotizador@dryada.com>"
UPLOAD_MAX_MB   = 50
```

**En el servicio frontend** (Railway → frontend → Variables):

```
VITE_API_URL    = <URL del backend copiada en el Paso 2>
```

### Paso 5 — Configurar GitHub Actions

1. En el repositorio GitHub: **Settings → Secrets and variables → Actions**.
2. Crear Secret: `RAILWAY_TOKEN`
   - Obtenerlo en Railway → Project Settings → Tokens → New Token.
3. Crear Variable (no secret): `RAILWAY_BACKEND_URL`
   - Valor: la URL pública del backend de Railway.
4. Hacer un push a `main` para disparar el primer deploy.

### Paso 6 — Verificar el deploy

1. En Railway, verificar que ambos servicios muestran **Active** (no **Failed**).
2. Abrir la URL del frontend en el browser.
3. Hacer una request manual a `https://<RAILWAY_BACKEND_DOMAIN>/api/materials`.
   - Respuesta esperada: array de materiales del `prices.json`.
4. Subir un STL de prueba desde la UI.

### Paso 7 — Rollback si algo sale mal

Railway mantiene el historial de deploys por servicio:

1. Railway → servicio afectado → **Deployments**.
2. Seleccionar el deploy anterior (el que estaba funcionando).
3. Click en **Rollback** → el servicio vuelve a esa versión en ~30 segundos.

El rollback **no revierte variables de entorno** — si el problema fue una variable mal configurada, hay que corregirla manualmente.

---

## 7. Decisiones de diseño y trade-offs

### Por qué Railway sobre VPS propio o AWS

Un VPS propio (DigitalOcean, Hetzner) es más barato por hora, pero tiene costo operativo oculto: configurar nginx, SSL, systemd, backups, monitoreo, y actualizaciones de seguridad. Para una herramienta interna con un equipo pequeño, ese overhead no se justifica.

AWS es potente pero sobre-engineered para este caso. ECS, ECR, RDS, ALB, y Route 53 para una herramienta interna es costoso en tiempo de configuración y en dinero (la capa gratuita de RDS dura 12 meses).

Railway ofrece el equilibrio correcto: deploy desde GitHub en minutos, SSL automático, PostgreSQL nativo, y variables de entorno en el dashboard. El costo en el plan Hobby es ~$5–15/mes dependiendo del uso, predecible y menor que cualquier alternativa equivalente en tiempo de setup.

**Riesgo**: Railway es una plataforma joven. Si Railway desaparece o cambia su modelo de negocio, la migración es directa porque todo está en Docker: los mismos `Dockerfile` funcionan en Fly.io, Render, o un VPS.

### Por qué nginx para el frontend

`vite preview` es un servidor de desarrollo post-build. No está diseñado para producción: no tiene control de caché, no comprime con gzip, y no tiene soporte para configuración de headers de seguridad. Para una SPA en producción, nginx es el estándar de facto.

La configuración de nginx en este proyecto hace tres cosas críticas:
1. **SPA fallback** (`try_files $uri /index.html`): sin esto, recargar la página en cualquier ruta que no sea `/` devuelve 404.
2. **Caché agresiva para assets**: Vite genera nombres de archivo con hash de contenido (`main.abc123.js`). Estos archivos pueden cachearse 1 año en el browser sin riesgo de servir versiones viejas.
3. **Compresión gzip**: reduce el payload de los assets entre 60–80%.

### Por qué multi-stage build

Sin multi-stage, la imagen del backend incluiría TypeScript, tsx, y todos los `devDependencies`. Esto significa:

- Imagen más grande (~350MB vs ~120MB): más tiempo de push/pull en CI y más almacenamiento en Railway.
- Surface de ataque mayor: dependencias de desarrollo (linters, compiladores) no deberían estar en producción.

El multi-stage garantiza que la imagen de runtime solo contiene lo mínimo necesario para ejecutar la aplicación.

### Riesgos operativos

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Railway supera el límite del plan Hobby | Baja (uso interno bajo) | Medio | Monitorear el uso en el dashboard. Si se supera, upgradar a Pro ($20/mes). |
| El free tier de Railway cambia | Media | Alto | Todo está en Docker. Migración a Fly.io o Render en < 1 día. |
| `RAILWAY_TOKEN` comprometido | Baja | Alto | Rotar el token desde Railway dashboard. El token tiene scope de proyecto, no de cuenta. |
| Deploy fallido sin rollback automático | Baja | Alto | Railway hace rollback automático si el healthcheck falla. Configurar healthcheck en Fastify (ver más abajo). |
| Pérdida de uploads en `/tmp` por restart | Media | Bajo | Comportamiento documentado y esperado. El usuario recibe un error claro. |

**Healthcheck recomendado para el backend** (agregar en `server.ts`):

```typescript
app.get('/health', async () => ({ status: 'ok' }));
```

Railway puede usar este endpoint para validar que el deploy fue exitoso antes de redirigir el tráfico.

---

## Próximos pasos

Tareas concretas a agregar en `tasks.json` como nueva fase `F5 — Infraestructura`:

| ID | Tarea | Dependencias |
|---|---|---|
| F5-T1 | Crear `backend/Dockerfile` multi-stage | F1 completa |
| F5-T2 | Crear `frontend/Dockerfile` + `frontend/nginx.conf` | F3-T1 |
| F5-T3 | Crear `docker-compose.yml` raíz con hot reload | F5-T1, F5-T2 |
| F5-T4 | Crear `.dockerignore` en backend y frontend | F5-T1, F5-T2 |
| F5-T5 | Actualizar `vite.config.ts` para leer `BACKEND_URL` de env | F5-T3 |
| F5-T6 | Crear `.github/workflows/deploy.yml` | F5-T1, F5-T2 |
| F5-T7 | Crear proyecto en Railway y configurar servicios N1 | F5-T1, F5-T2 |
| F5-T8 | Configurar secretos en GitHub (`RAILWAY_TOKEN`, `RAILWAY_BACKEND_URL`) | F5-T7 |
| F5-T9 | Verificar primer deploy exitoso (checklist sección 6) | F5-T7, F5-T8 |
| F5-T10 | Agregar endpoint `/health` en el backend | F1 completa |

---

*Fin del documento Infra/Deploy SDD v1.0 — Cotizador Dryada*
