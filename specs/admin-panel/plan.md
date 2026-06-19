# Plan: Panel de Administración

## Architecture

El panel de admin se construye sobre tres capas:

### Backend

**1. `AdminSessionService`** — servicio nuevo que encapsula el Map de sesiones en memoria. Métodos: `createSession(): string` (genera token hex-64, lo guarda con expiresAt = now + 8h, devuelve el token), `isValid(token: string): boolean` (verifica existencia y que no expiró), `revoke(token: string): void`. La limpieza de tokens expirados se hace lazy en `isValid`.

**2. `admin.route.ts`** — archivo de rutas nuevo que registra todos los endpoints `/api/admin/*`. Usa un hook `preHandler` local para verificar `X-Admin-Token` en todas las rutas excepto `POST /api/admin/login`. El login tiene rate limit propio de 5 req/IP/min usando la config por-ruta de `@fastify/rate-limit` (ya instalado). La comparación de `ADMIN_PASSWORD` usa `crypto.timingSafeEqual`.

**3. `app.ts` (modificación)** — dos cambios: (a) exportar `materialsRepo` y `paramsRepo` que hoy son privados, para que `admin.route.ts` los use; (b) validar `ADMIN_PASSWORD` en el startup (si no está seteada, loggear warning).

### Frontend

**Navegación**: `App.tsx` agrega un estado `mode: 'cotizacion' | 'admin'`. El flujo de cotización (`step`, `uploadResult`, etc.) no se toca — queda suspendido mientras `mode === 'admin'` y se retoma al volver.

**Pantallas nuevas**:
- `AdminLogin.tsx` — formulario de contraseña. Llama a `POST /api/admin/login`, guarda token en `sessionStorage('admin_token')`.
- `PanelAdmin.tsx` — contenedor de tabs (Materiales / Máquinas / Parámetros). Lee el token de `sessionStorage`. Si recibe 401 en cualquier request, limpia el token y renderiza `AdminLogin`.

**Componentes de admin**:
- `TabMateriales.tsx` — tabla + botón agregar + acciones editar/activar-desactivar.
- `TabMaquinas.tsx` — ídem para máquinas.
- `TabParametros.tsx` — formulario singleton.
- `MaterialModal.tsx` — modal compartido para crear y editar material.
- `MaquinaModal.tsx` — modal compartido para crear y editar máquina.

**Flujo de datos**:
```
sessionStorage('admin_token')
        ↓
api.ts (funciones admin con X-Admin-Token header)
        ↓
/api/admin/* → admin.route.ts
        ↓
AdminSessionService.isValid()
        ↓
SqliteMaterialsRepository / SqliteMachinesRepository / SqliteGlobalParamsRepository
        ↓
SQLite
```

---

## Dependencies

**Nuevas**: ninguna. Todo lo necesario ya está presente.

**Reutilizadas**:
- `crypto` (Node built-in) — `randomBytes` para tokens, `timingSafeEqual` para comparar contraseña
- `@fastify/rate-limit` (ya instalado) — rate limit por-ruta en `/api/admin/login`
- `SqliteMaterialsRepository`, `SqliteMachinesRepository`, `SqliteGlobalParamsRepository` — repos ya implementados con CRUD completo
- `@tabler/icons-react` (ya instalado) — iconografía del panel
- `tailwindcss` v4 (ya instalado) — estilos

**Variable de entorno nueva**:
- `ADMIN_PASSWORD` — agregar a `backend.env` en el VM y documentar en `specs/infra-deploy-sdd.md`

---

## Files Affected

### Backend
| Archivo | Acción | Descripción |
|---|---|---|
| `backend/src/services/admin-session.service.ts` | `[create]` | Gestión de sesiones en Map con expiración |
| `backend/src/routes/admin.route.ts` | `[create]` | Todos los endpoints `/api/admin/*` |
| `backend/src/app.ts` | `[modify]` | Exportar `materialsRepo` y `paramsRepo`; validar `ADMIN_PASSWORD` al startup |
| `backend/src/server.ts` | `[modify]` | Registrar `adminRoute` en Fastify |

### Frontend
| Archivo | Acción | Descripción |
|---|---|---|
| `frontend/src/components/screens/AdminLogin.tsx` | `[create]` | Pantalla de login admin |
| `frontend/src/components/screens/PanelAdmin.tsx` | `[create]` | Panel principal con tabs |
| `frontend/src/components/admin/TabMateriales.tsx` | `[create]` | Tab de gestión de materiales |
| `frontend/src/components/admin/TabMaquinas.tsx` | `[create]` | Tab de gestión de máquinas |
| `frontend/src/components/admin/TabParametros.tsx` | `[create]` | Tab de parámetros globales |
| `frontend/src/components/admin/MaterialModal.tsx` | `[create]` | Modal crear/editar material |
| `frontend/src/components/admin/MaquinaModal.tsx` | `[create]` | Modal crear/editar máquina |
| `frontend/src/App.tsx` | `[modify]` | Agregar `mode` state, renderizar panel admin |
| `frontend/src/components/layout/Topbar.tsx` | `[modify]` | Botón "Admin" |
| `frontend/src/services/api.ts` | `[modify]` | Funciones admin con `X-Admin-Token` header |
| `frontend/src/types/index.ts` | `[modify]` | Tipos `MaterialAdmin`, `Maquina` completo, `ParametrosGlobales`, `AdminSession` |

### Tests
| Archivo | Acción | Descripción |
|---|---|---|
| `backend/src/routes/admin.route.test.ts` | `[create]` | Tests de integración para todas las rutas admin |
| `backend/src/services/admin-session.service.test.ts` | `[create]` | Tests unitarios del servicio de sesiones |

### Infraestructura
| Archivo | Acción | Descripción |
|---|---|---|
| `specs/infra-deploy-sdd.md` | `[modify]` | Agregar `ADMIN_PASSWORD` a la tabla de variables de entorno |

---

## Risks and Trade-offs

**Sesiones en memoria se pierden en restart** — El trade-off está documentado en el spec y es aceptable para un tool interno. El admin vuelve a loguearse, operación de 5 segundos.

**Unicidad de nombres requiere query extra** — Antes de cada `create` o `update`, se consulta si existe otro registro con el mismo nombre (case-insensitive). Con volúmenes pequeños (< 50 materiales, < 20 máquinas) el impacto es irrelevante.

**Exportar `materialsRepo` y `paramsRepo` de `app.ts`** — Los repos son singletons instanciados en `app.ts`. Exportarlos para `admin.route.ts` mantiene el principio DI del constitution (única instanciación en `app.ts`). La alternativa de instanciar repos en `admin.route.ts` violaría la constitution.

**El botón "Admin" es visible para todos los usuarios del cotizador** — El cotizador ya es de acceso público. El botón es visible pero el panel requiere contraseña. Riesgo de ataques de fuerza bruta mitigado por el rate limit de 5/IP/min del login.

**Limpieza lazy de sesiones expiradas** — Los tokens expirados se eliminan del Map cuando `isValid()` los encuentra, no hay un job periódico. Con una sesión activa de admin a la vez, el Map nunca crece más de 1-2 entradas. No hay riesgo de memory leak.

---

## Decision

Ver `docs/adr/008-admin-panel-session-auth.md`
