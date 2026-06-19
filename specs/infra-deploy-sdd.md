# Software Design Description — Infraestructura y Deploy
## Cotizador Dryada

**Versión:** 2.0
**Fecha:** 2026-06-19
**Estado:** Vigente

> v1.0 describía un deploy sobre Railway (migrado en junio 2026 por agotamiento de créditos).
> Esta versión refleja la infraestructura actual sobre Oracle Cloud Always Free.

---

## 1. Resumen ejecutivo

La infraestructura del Cotizador Dryada corre sobre **Oracle Cloud Always Free** (VM.Standard.E2.1.Micro), **Docker Compose** como runtime de producción, **GHCR** (GitHub Container Registry) como registro de imágenes, y **GitHub Actions** como pipeline de CI/CD.

El modelo de deploy es pull-based: GitHub Actions buildea las imágenes, las publica en GHCR, y luego accede al VM por SSH para ejecutar `docker compose pull && docker compose up -d`. El VM nunca necesita acceso al código fuente — solo descarga imágenes ya construidas.

La containerización con Docker garantiza paridad entre entornos: el mismo `Dockerfile` que corre localmente es el que se deploya. Agregar un `push` a `main` es todo lo que necesita un desarrollador para deployar.

---

## 2. Infraestructura

### VM Oracle Cloud

| Atributo | Valor |
|---|---|
| Shape | VM.Standard.E2.1.Micro |
| CPU | 1 OCPU AMD x86_64 |
| RAM | 1 GB |
| Disco | 46.6 GB boot volume |
| OS | Ubuntu 22.04 LTS |
| IP pública | `161.153.198.86` |
| Región | Chile (Latin America) |
| Costo | Always Free — sin expiración |
| Usuario SSH | `ubuntu` |

**Firewall:** dos capas independientes que deben estar abiertas para tráfico entrante:
1. **iptables** en la VM — reglas para puertos 80 y 443.
2. **Oracle Security List** del VCN — ingress rules para puertos 80 y 22 desde `0.0.0.0/0`.

### Archivos en el VM

```
/opt/cotizador/
├── docker-compose.prod.yml   ← compose con imágenes SHA-pineadas (generado en CI)
├── backend.env               ← variables de entorno del backend (no en git)
├── frontend.env              ← variables de entorno del frontend (no en git)
└── data/
    ├── cotizador.db          ← SQLite (persistido entre deploys)
    └── uploads/              ← STLs subidos (persistidos entre deploys)
```

---

## 3. Arquitectura de servicios

### Topología

```
Internet
    │
    ▼
[Oracle VM :80]
    │
    ▼
[nginx (frontend container)]
    │   sirve: index.html + assets estáticos
    │   proxea: /api/* → http://backend:3001/api/*
    │
    ▼
[backend container :3001]
    │
    ├── SQLite en /app/data/cotizador.db (bind mount → /opt/cotizador/data)
    └── PrusaSlicer CLI en /usr/local/bin/prusa-slicer (incluido en imagen base)
```

Los dos contenedores comparten la red Docker interna `interna` (bridge). El backend no expone puertos al host — solo el frontend expone el 80. La comunicación frontend→backend usa el hostname `backend` de la red interna.

### Imágenes

| Imagen | Registro | Tag deploy |
|---|---|---|
| `dryada-prusaslicer-base` | `ghcr.io/luchocassani/` | `:2.8.1` / `:latest` |
| `cotizador-dryada-backend` | `ghcr.io/luchocassani/` | `:{git-sha}` |
| `cotizador-dryada-frontend` | `ghcr.io/luchocassani/` | `:{git-sha}` |

En producción, el compose usa tags SHA (`:{git-sha}`) generados en CI para garantizar que cada deploy apunta a una imagen inmutable. El tag `:latest` es conveniente pero mutable — no se usa para deployar.

---

## 4. Estructura de archivos Docker

### `docker/Dockerfile.prusaslicer`

Imagen base publicada en GHCR. Se buildea manualmente vía `workflow_dispatch` solo cuando cambia la versión de PrusaSlicer. No se rebuildeea en cada deploy.

**Stages:**
- `extractor` (`node:20-bookworm-slim`): descarga el AppImage de PrusaSlicer 2.8.1 y lo extrae con `unsquashfs -o 193728` (el offset es específico de esta versión — documentado en ADR-007).
- `base` (`node:20-bookworm-slim`): copia `/opt/prusaslicer`, instala libs de sistema en runtime, crea symlink `/usr/local/bin/prusa-slicer`, setea `LD_LIBRARY_PATH`.

### `backend/Dockerfile`

```dockerfile
# ── Etapa 1: build ────────────────────────────────────────────
FROM node:20-bookworm-slim AS build
# Compila TypeScript y better-sqlite3 (módulo nativo con node-gyp)

# ── Etapa 2: runtime ──────────────────────────────────────────
FROM ghcr.io/luchocassani/dryada-prusaslicer-base:latest AS runtime
# Hereda Node 20 + PrusaSlicer 2.8.1 + libs de sistema
# Solo copia dist/ y node_modules/ del stage build
```

El runtime usa la imagen base en lugar de `node:20-bookworm-slim` directamente, eliminando la descarga y extracción del AppImage de cada build (~5 minutos → segundos).

### `frontend/Dockerfile`

Multi-stage: build con Vite (`node:20-alpine`) → runtime con nginx (`nginx:alpine`).

El frontend no embebe la URL del backend en el bundle. En su lugar, nginx proxea `/api/` al backend en runtime, y el `API_TOKEN` se inyecta en la config de nginx vía `envsubst` al arrancar el contenedor (ver `frontend/docker-entrypoint.sh`).

### `docker-compose.prod.yml`

```yaml
services:
  backend:
    image: ghcr.io/luchocassani/cotizador-dryada-backend:latest
    volumes:
      - /opt/cotizador/data:/app/data
    env_file: backend.env
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3001/health', ...)"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 15s
    networks: [interna]

  frontend:
    image: ghcr.io/luchocassani/cotizador-dryada-frontend:latest
    ports: ["80:80"]
    env_file: frontend.env
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped
    networks: [interna]
```

CI genera una variante con los tags SHA reemplazando `:latest` antes de copiar al VM.

---

## 5. Variables de entorno

### Backend (`/opt/cotizador/backend.env`)

| Variable | Descripción | Ejemplo |
|---|---|---|
| `PORT` | Puerto de Fastify | `3001` |
| `DB_PATH` | Ruta al archivo SQLite | `/app/data/cotizador.db` |
| `UPLOADS_DIR` | Directorio de STLs subidos | `/app/data/uploads` |
| `PRUSASLICER_BIN` | Ruta al binario | `/usr/local/bin/prusa-slicer` |
| `PRUSA_LAYER_HEIGHT` | Altura de capa por defecto | `0.2` |
| `API_TOKEN` | Token Bearer de autenticación interna | `<hex 64 chars>` |
| `FRONTEND_URL` | URL del frontend (para CORS) | `http://161.153.198.86` |
| `UPLOAD_MAX_MB` | Límite de STL en MB | `500` |

### Frontend (`/opt/cotizador/frontend.env`)

| Variable | Descripción | Ejemplo |
|---|---|---|
| `BACKEND_URL` | URL interna del backend (red Docker) | `http://backend:3001` |
| `PORT` | Puerto en el que escucha nginx | `80` |
| `API_TOKEN` | Token Bearer (mismo que backend) | `<hex 64 chars>` |

### GitHub Secrets (repositorio)

| Secret | Descripción |
|---|---|
| `ORACLE_SSH_KEY` | Clave privada SSH para acceder al VM |
| `ORACLE_HOST` | IP del VM (`161.153.198.86`) |
| `ORACLE_USER` | Usuario SSH (`ubuntu`) |
| `ORACLE_KNOWN_HOSTS` | Fingerprint del host (anti-MITM, generado con `ssh-keyscan`) |
| `API_TOKEN` | Token de autenticación backend↔frontend |

---

## 6. Pipeline de CI/CD

### `.github/workflows/deploy.yml`

**Trigger:** push a `main`.
**Jobs:** `typecheck` → `test` → `deploy` (el deploy solo corre en push, no en PRs).

```
typecheck (26s)
    │
    ▼
test (12s)
    │
    ▼
deploy (≈2m 54s)
  1. docker login a GHCR
  2. build + push backend (con GHA layer cache)
  3. build + push frontend (con GHA layer cache)
  4. sed: reemplaza :latest por :{sha} en compose
  5. SSH setup (clave + known_hosts)
  6. scp compose al VM
  7. SSH: docker compose pull && up -d && image prune
```

**Cache de capas Docker:** `type=gha` con scopes separados por servicio. En pushs donde solo cambia el código (sin cambios en `package.json`), la capa de `npm ci` y compilación nativa de `better-sqlite3` se restaura del cache — reduce el build de backend de ~90s a ~20s.

### `.github/workflows/build-prusaslicer-base.yml`

**Trigger:** `workflow_dispatch` manual.
**Cuándo usarlo:** solo al actualizar la versión de PrusaSlicer. El workflow recibe un input `version` (semver), valida el formato, y publica en GHCR con tags `:{version}` y `:latest`.

---

## 7. Rollback

No hay rollback automático (Oracle Cloud no es una PaaS). Para volver a una versión anterior:

```bash
ssh -i ~/.ssh/deploy_key ubuntu@161.153.198.86
# Ver imágenes disponibles en el VM
docker images ghcr.io/luchocassani/cotizador-dryada-backend

# Editar el compose para apuntar al SHA anterior
nano /opt/cotizador/docker-compose.prod.yml

# Aplicar
docker compose -f /opt/cotizador/docker-compose.prod.yml up -d
```

Las imágenes de deploys anteriores quedan en el VM hasta que `docker image prune -f` las elimine (el prune corre automáticamente al final de cada deploy, pero solo elimina imágenes sin contenedor activo).

---

## 8. Decisiones de diseño

### Por qué Oracle Cloud Always Free vs Railway

Railway se agotó en los primeros días de desarrollo activo ($5 de crédito incluido). Oracle Cloud Always Free ofrece VM.Standard.E2.1.Micro sin límite de tiempo ni de uso, genuinamente gratis. El trade-off es mayor complejidad operativa (gestión de SSH, firewall, updates de OS), pero aceptable para una herramienta interna.

### Por qué imagen base para PrusaSlicer

La extracción del AppImage de PrusaSlicer tarda ~5 minutos en CI. Con una imagen base publicada en GHCR, ese tiempo se paga una sola vez (al publicar la imagen base), y cada deploy del backend lo salta completamente. Documentado en ADR-007.

### Por qué nginx proxea al backend (no llamadas directas desde el browser)

El API_TOKEN no puede estar en el bundle del frontend (sería visible en el código fuente). nginx inyecta el token en el header `Authorization` de cada request a `/api/` en el servidor, invisible para el browser. Además, desde el exterior solo el puerto 80 está expuesto — el backend nunca tiene un puerto público.

### Por qué SQLite y no PostgreSQL

Para el volumen de uso interno de Dryada (pocas cotizaciones por día, un solo usuario a la vez), SQLite es suficiente. Elimina la necesidad de un servicio de base de datos separado, su backup es un `cp` de un archivo, y su operación es cero configuración. Si el volumen crece, la migración está documentada en el CLAUDE.md.

---

## 9. Checklist de setup inicial (para nuevo VM)

En caso de necesitar recrear el VM desde cero:

1. Crear VM `VM.Standard.E2.1.Micro` en Oracle Cloud con VCN que tenga internet gateway.
2. Abrir puertos 22 y 80 en la Oracle Security List del VCN.
3. SSH al VM, ejecutar `sudo apt update && sudo apt install -y docker.io docker-compose-v2`.
4. `sudo mkdir -p /opt/cotizador/data && sudo chown ubuntu:ubuntu /opt/cotizador`.
5. Crear `/opt/cotizador/backend.env` y `/opt/cotizador/frontend.env` con los valores de la sección 5.
6. Abrir puertos en iptables: `sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT`.
7. Actualizar el secret `ORACLE_HOST` en GitHub con la nueva IP.
8. Regenerar `ORACLE_KNOWN_HOSTS` con `ssh-keyscan <nueva-ip>` y actualizar el secret.
9. Hacer un push a `main` para disparar el primer deploy.

---

*Fin del documento Infra/Deploy SDD v2.0 — Cotizador Dryada*
