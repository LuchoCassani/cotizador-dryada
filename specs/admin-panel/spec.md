# Spec — Panel de Administración

**Feature**: `admin-panel`
**Fecha**: 2026-06-19
**Estado**: Draft — pendiente revisión

---

## 1. Objetivo y contexto

Los materiales, máquinas y parámetros de cotización están en SQLite pero solo son editables directamente en la base de datos. Cualquier ajuste de precio o nuevo material requiere intervención técnica.

Esta feature agrega un panel web para que la administración de Dryada pueda gestionar esos datos sin tocar la base de datos: editar precios de cartuchos, agregar una máquina nueva, ajustar la tasa EUR/USD o el coeficiente de ganancia.

**El backend ya está preparado.** `SqliteMaterialsRepository`, `SqliteMachinesRepository` y `SqliteGlobalParamsRepository` tienen `create`, `update` y `delete` implementados. Lo que falta son las rutas HTTP de admin y la pantalla en el frontend.

---

## 2. Alcance

### Dentro del scope

- **Materiales**: crear, editar nombre/precio/densidad, activar/desactivar. No hay borrado físico — solo desactivar.
- **Máquinas**: crear, editar nombre/dimensiones/costo/amortización, activar/desactivar. No hay borrado físico.
- **Parámetros globales**: editar los 8 parámetros (tasas de cambio, mano de obra, ganancia, etc.). Es una fila singleton — solo edición, sin crear ni borrar.

### Restricciones de seguridad (no negociables)

- **Ningún token o credencial se pasa en query string.** El `API_TOKEN`, el `X-Admin-Token` y la contraseña de login viajan exclusivamente en headers HTTP (`Authorization`, `X-Admin-Token`, body JSON). Query params son visibles en logs de servidor, historial del browser y URLs compartidas.
- El body del login (`{ password }`) va en JSON via POST, nunca en GET con query string.

### Fuera del scope

- Historial de cambios / auditoría.
- Gestión de cotizaciones pasadas.
- Autenticación de usuarios (empleados).
- Subida masiva de materiales vía CSV.

---

## 3. Acceso al panel y autenticación

El panel es una sección de la misma SPA, accesible desde un botón "Admin" en el Topbar. Al hacer click, si el usuario no tiene sesión activa, se muestra la pantalla de login. Una vez autenticado, el panel se muestra. Un botón "Cerrar sesión" invalida la sesión y regresa al inicio. Un botón "Volver" regresa al flujo de cotización sin cerrar sesión.

### Modelo de autenticación

El cotizador es de acceso público (cualquiera puede cotizar). Para proteger el panel de admin se usa un sistema de sesiones separado del `API_TOKEN` de infraestructura:

**1. Variable de entorno `ADMIN_PASSWORD`**
Se agrega a `backend.env` en el VM. La elige y la gestiona Dryada. Es independiente del `API_TOKEN`.

**2. Endpoint de login**
`POST /api/admin/login` recibe `{ password: string }`. El backend compara con `ADMIN_PASSWORD` usando comparación de tiempo constante (evita timing attacks). Si es correcto, genera un token de sesión aleatorio (`crypto.randomBytes(32).toString('hex')`), lo almacena en memoria con timestamp de expiración, y lo devuelve al frontend. Si es incorrecto, responde 401.

**3. Token de sesión**
- Duración: 8 horas desde el login
- Almacenamiento en backend: Map en memoria `{ token → expiresAt }`. Se invalida solo al expirar o al reiniciar el servidor (en ese caso el admin debe volver a loguearse)
- Almacenamiento en frontend: `sessionStorage` (se borra al cerrar el tab o el browser)

**4. Autorización de rutas de admin**
Todas las rutas `/api/admin/*` (excepto `/api/admin/login`) verifican el header `X-Admin-Token`. Si el token no existe, expiró o es inválido → 401. Las rutas siguen requiriendo también el `Bearer API_TOKEN` que nginx inyecta (doble capa).

**5. Variable de entorno en backend.env**
```
ADMIN_PASSWORD=<contraseña elegida por Dryada>
```
Si `ADMIN_PASSWORD` no está seteada al iniciar el backend, el servidor loggea un warning y el endpoint `/api/admin/login` responde 503 (admin deshabilitado).

---

## 4. Rutas HTTP de admin

Todas bajo prefijo `/api/admin/`. Requieren el `Bearer API_TOKEN` que nginx inyecta automáticamente. Las rutas marcadas con `🔒 sesión` además requieren el header `X-Admin-Token` con un token de sesión válido.

### Autenticación de admin

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/api/admin/login` | Bearer únicamente | Valida `ADMIN_PASSWORD`, devuelve token de sesión |

**Request:**
```json
{ "password": "..." }
```
**Response 200:**
```json
{ "token": "<hex 64 chars>", "expiresAt": "2026-06-19T22:00:00Z" }
```
**Response 401:** `{ "error": "Contraseña incorrecta", "code": "ADMIN_UNAUTHORIZED" }`
**Response 503:** `{ "error": "Panel de admin no configurado", "code": "ADMIN_DISABLED" }`

### Materiales 🔒 sesión

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/admin/materials` | Lista todos (activos e inactivos) |
| `POST` | `/api/admin/materials` | Crea un material nuevo |
| `PUT` | `/api/admin/materials/:id` | Edita campos del material |
| `DELETE` | `/api/admin/materials/:id` | Desactiva (soft delete: `activo = false`) |

### Máquinas 🔒 sesión

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/admin/machines` | Lista todas (activas e inactivas) |
| `POST` | `/api/admin/machines` | Crea una máquina nueva |
| `PUT` | `/api/admin/machines/:id` | Edita campos de la máquina |
| `DELETE` | `/api/admin/machines/:id` | Desactiva (soft delete: `activa = false`) |

### Parámetros globales 🔒 sesión

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/admin/params` | Devuelve los parámetros actuales |
| `PUT` | `/api/admin/params` | Actualiza uno o más parámetros |

---

## 5. Contratos de API

### POST `/api/admin/materials`

**Request body:**
```json
{
  "nombre": "PLA Blanco",
  "precioPorCartucho750gEUR": 24.90,
  "densidadGCm3": 1.24,
  "activo": true
}
```

**Response 201:**
```json
{
  "id": "uuid",
  "nombre": "PLA Blanco",
  "precioPorCartucho750gEUR": 24.90,
  "densidadGCm3": 1.24,
  "activo": true,
  "creadaAt": "2026-06-19T...",
  "actualizadaAt": "2026-06-19T..."
}
```

**Validaciones**: `nombre` no vacío, `precioPorCartucho750gEUR > 0`, `densidadGCm3 > 0`.

### PUT `/api/admin/materials/:id`

Todos los campos son opcionales (patch semántico). Devuelve el material actualizado o 404.

### DELETE `/api/admin/materials/:id`

Devuelve 204. Si el id no existe, 404.

### POST `/api/admin/machines`

**Request body:**
```json
{
  "nombre": "Bambu Lab X1C",
  "capacidadXmm": 256,
  "capacidadYmm": 256,
  "capacidadZmm": 256,
  "costoUsd": 1200,
  "mesesAmortizacion": 36,
  "activa": true
}
```

**Validaciones**: `nombre` no vacío, dimensiones y costo `> 0`, `mesesAmortizacion >= 1`.

### PUT `/api/admin/params`

Patch semántico — solo se actualizan los campos enviados:
```json
{
  "tasaEurUsd": 1.08,
  "coeficienteGanancia": 2.5
}
```

**Validaciones**: todos los valores numéricos `> 0`. `desperdicioPct` entre 0 y 100.

---

## 6. UI del panel

### Estructura general

El panel tiene tres secciones en tabs: **Materiales**, **Máquinas**, **Parámetros**. El tab activo es "Materiales" al entrar.

```
[Materiales]  [Máquinas]  [Parámetros]
──────────────────────────────────────
[tabla de items con botones editar/desactivar]
[botón "+ Agregar"]
```

### Tab Materiales

Tabla con columnas: Nombre · Precio cartucho (EUR) · Densidad (g/cm³) · Estado · Acciones.

- **Estado**: badge "Activo" (verde) o "Inactivo" (gris).
- **Acciones**: botón "Editar" abre un modal inline. Botón "Desactivar"/"Activar" cambia el estado con confirmación.
- **Botón "+ Agregar material"**: abre el mismo modal en modo creación.

**Modal de material**: campos `nombre` (text), `precio cartucho EUR` (number, 2 decimales), `densidad g/cm³` (number, 3 decimales), toggle `activo`. Botones: Guardar / Cancelar.

### Tab Máquinas

Tabla: Nombre · Capacidad (X×Y×Z mm) · Costo (USD) · Amortización (meses) · Estado · Acciones.

Mismo patrón de modal y acciones que materiales.

### Tab Parámetros

Formulario con todos los campos del singleton `parametros_globales`. No hay tabla — es una sola fila. Los campos se muestran agrupados:

**Tasas de cambio**
- Tasa EUR → USD
- Tasa ARS → USD

**Mano de obra**
- Tarifa mano de obra (USD/hora)
- Horas por pieza

**Costos y ganancia**
- Desperdicio (%)
- Costos adicionales (USD)
- Coeficiente de ganancia
- Piezas por día estimadas

Botón "Guardar cambios" al pie. Muestra la fecha de última actualización.

### Comportamiento de errores

- Si el servidor devuelve 4xx/5xx: toast de error con el mensaje del backend.
- Si la validación del formulario falla client-side: highlight del campo con mensaje inline.
- Si la sesión de admin no está autenticada: redirige al diálogo de contraseña.

---

## 7. Criterios de aceptación

### CA-001 — Login de admin
**Given** el usuario hace click en "Admin" en el Topbar y no tiene sesión activa  
**When** ingresa la `ADMIN_PASSWORD` correcta en el formulario de login  
**Then** el panel de administración se muestra  
**And** el token de sesión se guarda en `sessionStorage`

**Given** el usuario ingresa una contraseña incorrecta  
**Then** el formulario muestra el error "Contraseña incorrecta" y permanece abierto

**Given** el usuario cierra el tab del browser  
**When** lo vuelve a abrir  
**Then** debe volver a autenticarse (sessionStorage fue borrado)

### CA-002 — Listar materiales con inactivos
**Given** el usuario está en el tab Materiales del panel  
**When** la pantalla carga  
**Then** se listan todos los materiales (activos e inactivos)  
**And** los inactivos tienen badge gris "Inactivo"

### CA-003 — Crear material
**Given** el usuario hace click en "+ Agregar material"  
**When** completa el formulario con datos válidos y guarda  
**Then** el material aparece en la tabla  
**And** el formulario se cierra

### CA-004 — Editar material
**Given** el usuario hace click en "Editar" de un material  
**When** modifica el precio y guarda  
**Then** la tabla refleja el nuevo precio  
**And** la próxima cotización que use ese material calcula con el precio actualizado

### CA-005 — Desactivar material
**Given** el usuario hace click en "Desactivar" de un material activo  
**When** confirma la acción  
**Then** el material aparece con badge "Inactivo"  
**And** no aparece en el selector de materiales del flujo de cotización

### CA-006 — CRUD de máquinas
**Given/When/Then** análogo a CA-003/CA-004/CA-005 para máquinas

### CA-007 — Editar parámetros globales
**Given** el usuario está en el tab Parámetros  
**When** modifica la tasa EUR/USD y hace click en "Guardar cambios"  
**Then** la tasa se persiste en la base de datos  
**And** la próxima cotización usa la nueva tasa

### CA-008 — Validación de formularios
**Given** el usuario intenta guardar un material con precio vacío o cero  
**Then** el campo se marca en error con el mensaje "El precio debe ser mayor a 0"  
**And** no se hace ningún request al backend

### CA-009 — Aislamiento del panel del flujo de cotización
**Given** el usuario abre el panel admin  
**Then** el flujo de cotización queda en pausa (el estado no se pierde)  
**When** el usuario hace click en "Volver"  
**Then** el flujo se retoma desde donde estaba

---

## 8. Decisiones de diseño

### Soft delete, no hard delete

Borrar un material o máquina que ya fue usado en cotizaciones históricas haría inconsistente el registro. El delete solo desactiva (`activo = false`), lo que lo excluye del selector de cotización pero preserva el historial.

### Autenticación de admin separada del API_TOKEN

El `API_TOKEN` es un secreto de infraestructura: nginx lo inyecta en todas las requests, nunca se expone al browser. Usarlo como contraseña de admin mezcla responsabilidades y lo expone a un vector de ataque diferente.

`ADMIN_PASSWORD` es una credencial gestionada por Dryada, independiente de infraestructura. Si se compromete, se cambia en `backend.env` sin afectar nada más del sistema.

### Tokens de sesión en memoria con expiración de 8 horas

Evita persistir sesiones en la DB (overhead innecesario para un solo admin). El trade-off es que un reinicio del servidor invalida todas las sesiones activas — el admin vuelve a loguearse, lo cual es aceptable para una herramienta interna con poco uso concurrente.

8 horas cubre una jornada laboral completa sin reautenticarse.

### sessionStorage en lugar de localStorage

`sessionStorage` se borra al cerrar el tab. `localStorage` persiste indefinidamente. Para un panel de admin, es preferible que la sesión no persista entre sesiones del browser.

### Mismo Bearer token (API_TOKEN) para todas las rutas de admin

Las rutas `/api/admin/*` requieren el `Bearer API_TOKEN` que nginx inyecta (primera capa) más el `X-Admin-Token` de sesión (segunda capa). La primera capa asegura que ningún request externo que bypasee nginx llegue al backend. La segunda capa asegura que solo quien se autenticó como admin puede operar.

### Panel dentro de la SPA existente, sin React Router

La app gestiona la navegación con estado (`step`). El panel admin se agrega como un estado adicional (`mode: 'cotizacion' | 'admin'`) en `App.tsx`. Evita agregar React Router como dependencia para un caso de uso simple.

---

## 9. Clarificaciones

### C-1: Rate limit en endpoint de login
**Type:** edge case
**Q:** ¿Cuántos intentos de login fallidos por IP permitimos antes de bloquear temporalmente?
**A:** 5 intentos / IP / min.
**Pattern tip:** Los endpoints de autenticación siempre necesitan rate limiting propio, más estricto que el global. El límite global protege contra carga, el específico protege contra fuerza bruta.

### C-4: Nombres duplicados de materiales y máquinas
**Type:** ambiguity
**Q:** ¿Se permiten dos materiales con el mismo nombre? ¿Y dos máquinas?
**A:** No se permiten duplicados en ninguno. El backend rechaza con 409 si ya existe un registro con ese nombre exacto (case-insensitive). Aplica tanto en create como en update (renombrar a un nombre ya existente también se rechaza).
**Pattern tip:** Cuando un campo es visible al usuario como etiqueta (ej: en un selector), definir unicidad evita ambigüedad operativa — aunque la DB pueda técnicamente aceptar duplicados.

### C-3: Sesión expirada durante edición
**Type:** edge case
**Q:** Si la sesión expira mientras el admin tiene el formulario abierto y hace click en Guardar, ¿qué hace la UI?
**A:** Mostrar toast "Tu sesión expiró. Volvé a iniciar sesión." y redirigir al formulario de login. Los cambios no guardados se pierden.
**Pattern tip:** Toda acción que require auth debe manejar el caso 401 explícitamente — no solo en login sino en cualquier request posterior.

### C-2: Desactivar el último material activo
**Type:** edge case
**Q:** ¿Qué pasa si el admin intenta desactivar el último material activo?
**A:** Permitirlo con advertencia. La UI muestra un warning prominente antes de confirmar: "El cotizador quedará sin materiales disponibles". El backend lo permite.
**Pattern tip:** Cuando una acción puede dejar el sistema en un estado degradado, definir explícitamente si se bloquea o se advierte — y en qué capa ocurre cada cosa.

---

## 10. No-goals explícitos

- No hay auditoría de quién cambió qué y cuándo.
- No hay roles (admin vs empleado de ventas) — toda la interfaz es accesible para cualquiera que tenga la contraseña.
- No hay validación server-side de que los precios "tienen sentido" (ej: precio EUR demasiado bajo). El sistema confía en el criterio del administrador.
- No hay confirmación de impacto antes de editar (ej: "este material está en 5 cotizaciones activas"). Las ediciones son inmediatas.
