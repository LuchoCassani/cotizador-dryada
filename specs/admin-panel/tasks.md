# Tasks: Panel de Administración

**Feature**: admin-panel
**Plan**: specs/admin-panel/plan.md
**Generated**: 2026-06-19

---

## TASK-001: Crear AdminSessionService

**Status**: completed
**Requirements**: CA-001, C-3
**Complexity**: S
**Depends on**: none
**Files**: `backend/src/services/admin-session.service.ts`

### Description
Crear el servicio que gestiona el Map de sesiones en memoria. Exportar la clase `AdminSessionService` con tres métodos: `createSession(): string` (genera token con `crypto.randomBytes(32).toString('hex')`, lo guarda en el Map con `expiresAt = Date.now() + 8 * 60 * 60 * 1000`, devuelve el token); `isValid(token: string): boolean` (verifica que el token exista en el Map y que `expiresAt > Date.now()`, elimina el token del Map si está expirado — limpieza lazy); `revoke(token: string): void` (elimina el token del Map). Exportar también una instancia singleton `adminSessionService`.

### Validation
El archivo existe y exporta `AdminSessionService` y `adminSessionService`. `createSession()` devuelve un string de 64 chars hexadecimales. `isValid()` devuelve `false` para tokens desconocidos. El token creado con `createSession()` devuelve `true` en `isValid()` inmediatamente después.

---

## TASK-002: Agregar tipos de admin al frontend

**Status**: completed
**Requirements**: CA-002, CA-003, CA-006, CA-007
**Complexity**: S
**Depends on**: none
**Files**: `frontend/src/types/index.ts`

### Description
Agregar al archivo de tipos existente las siguientes interfaces: `MaterialAdmin` (todos los campos de `Material` más `creadaAt` y `actualizadaAt` — la versión completa que devuelve el panel admin, a diferencia de `Material` que es la versión pública del cotizador); `MaquinaAdmin` (todos los campos de `Maquina` incluyendo `costoUsd`, `mesesAmortizacion`, `activa`, `creadaAt`); `ParametrosGlobales` con los 8 campos del singleton; `AdminSession` con `token: string` y `expiresAt: string`.

### Validation
El archivo compila sin errores (`npx tsc --noEmit` en `frontend/`). Las cuatro interfaces están exportadas y tienen todos los campos definidos con los tipos correctos.

---

## TASK-003: Crear admin.route.ts con endpoint de login

**Status**: pending
**Requirements**: CA-001, C-1, C-3
**Complexity**: M
**Depends on**: TASK-001
**Files**: `backend/src/routes/admin.route.ts`

### Description
Crear `admin.route.ts` como `FastifyPluginAsync`. Registrar `POST /api/admin/login` con rate limit específico de 5 req/IP/min usando la config por-ruta de `@fastify/rate-limit` (`config: { rateLimit: { max: 5, timeWindow: '1 minute' } }`). El handler valida que `ADMIN_PASSWORD` esté configurada (si no, responde 503 con `{ error: 'Panel de admin no configurado', code: 'ADMIN_DISABLED' }`). Compara la contraseña recibida con `ADMIN_PASSWORD` usando `crypto.timingSafeEqual` (convertir ambas a `Buffer.from(str)`). Si coincide: llama `adminSessionService.createSession()`, responde 200 con `{ token, expiresAt }`. Si no coincide: responde 401 con `{ error: 'Contraseña incorrecta', code: 'ADMIN_UNAUTHORIZED' }`. Agregar un `preHandler` a nivel de plugin (no al login) que verifica `X-Admin-Token` para todas las rutas futuras: si el header no existe o `adminSessionService.isValid(token)` devuelve `false`, responde 401. El login queda excluido de este preHandler.

### Validation
El archivo existe y exporta `adminRoute`. `POST /api/admin/login` con contraseña correcta devuelve 200 con `{ token, expiresAt }`. Con contraseña incorrecta devuelve 401. Sin `ADMIN_PASSWORD` en env devuelve 503. Una request a cualquier ruta protegida sin `X-Admin-Token` devuelve 401.

---

## TASK-004: Agregar rutas CRUD de materiales a admin.route.ts

**Status**: pending
**Requirements**: CA-002, CA-003, CA-004, CA-005, C-4
**Complexity**: M
**Depends on**: TASK-003
**Files**: `backend/src/routes/admin.route.ts`, `backend/src/app.ts`

### Description
Agregar las 4 rutas de materiales al plugin `adminRoute`. `GET /api/admin/materials`: llama `materialsRepo.getAll()` (devuelve activos e inactivos), responde 200 con el array. `POST /api/admin/materials`: valida campos requeridos (nombre no vacío, precio > 0, densidad > 0), verifica unicidad del nombre con `getAll()` + búsqueda case-insensitive (si existe, 409 con `{ error: 'Ya existe un material con ese nombre', code: 'DUPLICATE_NAME' }`), llama `materialsRepo.create()`, responde 201. `PUT /api/admin/materials/:id`: patch semántico, verifica unicidad del nombre nuevo si cambia, llama `materialsRepo.update()`, responde 200 o 404. `DELETE /api/admin/materials/:id`: llama `materialsRepo.update(id, { activo: false })` (soft delete), responde 204 o 404. En `app.ts`: exportar `materialsRepo` (hoy es `const` privado).

### Validation
`GET /api/admin/materials` con token válido devuelve array con todos los materiales. `POST` con nombre duplicado devuelve 409. `POST` con datos válidos devuelve 201 y el material creado. `DELETE` cambia `activo` a `false` y el material sigue en la DB. `PUT` con nombre ya existente (de otro material) devuelve 409.

---

## TASK-005: Agregar rutas CRUD de máquinas a admin.route.ts

**Status**: pending
**Requirements**: CA-006, C-4
**Complexity**: M
**Depends on**: TASK-003
**Files**: `backend/src/routes/admin.route.ts`, `backend/src/app.ts`

### Description
Agregar las 4 rutas de máquinas al plugin `adminRoute` con el mismo patrón que materiales. `GET /api/admin/machines`: devuelve todas (activas e inactivas) con todos los campos incluyendo `costoUsd` y `mesesAmortizacion`. `POST /api/admin/machines`: valida nombre no vacío, dimensiones > 0, costo > 0, mesesAmortizacion >= 1; verifica unicidad de nombre (409 si duplicado); llama `machinesRepo.create()`; responde 201. `PUT /api/admin/machines/:id`: patch semántico con validaciones y unicidad; 200 o 404. `DELETE /api/admin/machines/:id`: soft delete (`activa = false`); 204 o 404. En `app.ts`: `machinesRepo` ya está exportado, no necesita cambios.

### Validation
`GET /api/admin/machines` devuelve máquinas con todos sus campos (incluyendo costo y amortización). `POST` con nombre duplicado devuelve 409. `DELETE` desactiva sin borrar. Los campos opcionales de `PUT` son realmente opcionales (enviar solo `nombre` no borra otros campos).

---

## TASK-006: Agregar rutas de parámetros globales a admin.route.ts

**Status**: pending
**Requirements**: CA-007
**Complexity**: S
**Depends on**: TASK-003
**Files**: `backend/src/routes/admin.route.ts`, `backend/src/app.ts`

### Description
Agregar las 2 rutas de parámetros globales al plugin `adminRoute`. `GET /api/admin/params`: llama `paramsRepo.get()`, responde 200 con el objeto `ParametrosGlobales`. `PUT /api/admin/params`: valida que todos los valores numéricos enviados sean `> 0` y que `desperdicioPct` esté entre 0 y 100 si se envía; llama `paramsRepo.update(data)` con patch semántico; responde 200 con los parámetros actualizados. En `app.ts`: exportar `paramsRepo` (hoy es `const` privado).

### Validation
`GET /api/admin/params` devuelve los 8 parámetros del singleton. `PUT` con solo `{ tasaEurUsd: 1.10 }` actualiza ese campo sin tocar los demás. `PUT` con `desperdicioPct: 150` devuelve 400.

---

## TASK-007: Registrar adminRoute en app.ts y server.ts

**Status**: pending
**Requirements**: CA-001
**Complexity**: S
**Depends on**: TASK-004, TASK-005, TASK-006
**Files**: `backend/src/app.ts`, `backend/src/server.ts`

### Description
En `app.ts`: agregar validación de `ADMIN_PASSWORD` en el bloque de startup (si no está seteada, `console.warn('[startup] ADMIN_PASSWORD no configurada — panel de admin deshabilitado')`). Exportar `materialsRepo` y `paramsRepo`. En `server.ts`: importar y registrar `adminRoute` con `fastify.register(adminRoute)`.

### Validation
El backend arranca sin errores con y sin `ADMIN_PASSWORD` seteada. `POST /api/admin/login` responde (200 o 503) desde el servidor corriendo. El TypeScript compila sin errores (`npx tsc --noEmit` en `backend/`).

---

## TASK-008: Tests unitarios de AdminSessionService

**Status**: pending
**Requirements**: CA-001, C-3
**Complexity**: S
**Depends on**: TASK-001
**Files**: `backend/src/services/admin-session.service.test.ts`

### Description
Escribir tests con vitest para `AdminSessionService`. Casos a cubrir: `createSession()` devuelve string de 64 chars; `isValid()` devuelve `true` para token recién creado; `isValid()` devuelve `false` para token inexistente; `isValid()` devuelve `false` y elimina el token cuando está expirado (manipular el expiresAt directamente en el Map para simular expiración sin esperar 8h); `revoke()` invalida un token válido (isValid devuelve false después).

### Validation
`npm test` en `backend/` pasa todos los casos descritos. Sin falsos positivos ni falsos negativos.

---

## TASK-009: Tests de integración de rutas admin

**Status**: pending
**Requirements**: CA-001, CA-002, CA-003, CA-004, CA-005, CA-006, CA-007, CA-008, C-1, C-3, C-4
**Complexity**: M
**Depends on**: TASK-007, TASK-008
**Files**: `backend/src/routes/admin.route.test.ts`

### Description
Tests de integración usando SQLite en memoria (mismo patrón que los tests existentes del proyecto). Cubrir: login con contraseña correcta devuelve token; login con contraseña incorrecta devuelve 401; request a ruta protegida sin token devuelve 401; request con token expirado devuelve 401; CRUD completo de materiales (create, read all, update, soft delete); unicidad de nombres en create y update (409); CRUD completo de máquinas; GET y PUT de parámetros globales; validación de campos (precio 0 devuelve 400, desperdicioPct 150 devuelve 400).

### Validation
`npm test` en `backend/` pasa todos los casos. Cobertura de `admin.route.ts` ≥ 80%.

---

## TASK-010: Agregar funciones admin a api.ts del frontend

**Status**: pending
**Requirements**: CA-001, CA-002, CA-003, CA-004, CA-005, CA-006, CA-007, C-3
**Complexity**: M
**Depends on**: TASK-002
**Files**: `frontend/src/services/api.ts`

### Description
Agregar al `api.ts` existente: una función `adminHeaders()` que lee `sessionStorage.getItem('admin_token')` y devuelve `{ 'X-Admin-Token': token }` (o `{}` si no hay token); una función `handleAdminResponse<T>()` que, si recibe 401, limpia `sessionStorage.getItem('admin_token')` y lanza un error con `code: 'SESSION_EXPIRED'` (para que los componentes puedan redirigir al login). Luego las funciones: `adminLogin(password)` → POST `/api/admin/login`; `adminGetMaterials()`, `adminCreateMaterial(data)`, `adminUpdateMaterial(id, data)`, `adminDeleteMaterial(id)`; `adminGetMachines()`, `adminCreateMachine(data)`, `adminUpdateMachine(id, data)`, `adminDeleteMachine(id)`; `adminGetParams()`, `adminUpdateParams(data)`. Todas usan `adminHeaders()` y `handleAdminResponse`.

### Validation
El archivo compila sin errores TypeScript. Las funciones están exportadas. `adminLogin` no incluye el token en los headers (lo llama antes de tener sesión). Todas las demás incluyen `X-Admin-Token`.

---

## TASK-011: Crear pantalla AdminLogin

**Status**: pending
**Requirements**: CA-001, C-3
**Complexity**: S
**Depends on**: TASK-010
**Files**: `frontend/src/components/screens/AdminLogin.tsx`

### Description
Componente `AdminLogin` con props `onLogin: () => void`. Renderiza un formulario centrado con: campo `password` (type="password"), botón "Ingresar", mensaje de error inline si el login falla. Al submit: llama `adminLogin(password)`, si responde correctamente guarda el token en `sessionStorage('admin_token')` y llama `onLogin()`, si falla muestra "Contraseña incorrecta". Estado de loading durante el request (deshabilitar botón). Usar tokens de diseño del design system (violeta para el botón primario).

### Validation
El componente existe y renderiza sin errores. Con contraseña correcta (mockeada) llama `onLogin`. Con error 401 muestra el mensaje de error. El botón se deshabilita durante el fetch.

---

## TASK-012: Crear MaterialModal

**Status**: pending
**Requirements**: CA-003, CA-004, CA-008
**Complexity**: M
**Depends on**: TASK-010
**Files**: `frontend/src/components/admin/MaterialModal.tsx`

### Description
Componente `MaterialModal` con props: `material?: MaterialAdmin` (si está presente, modo edición; si no, modo creación), `onSave: (data) => Promise<void>`, `onClose: () => void`. Campos del formulario: `nombre` (text, requerido), `precioPorCartucho750gEUR` (number, > 0, 2 decimales), `densidadGCm3` (number, > 0, 3 decimales), `activo` (toggle). Validación client-side antes de llamar `onSave`: campos requeridos y valores > 0. Si la validación falla, mostrar mensaje inline en el campo afectado sin hacer request. Si `onSave` lanza error 409 (nombre duplicado), mostrar "Ya existe un material con ese nombre" bajo el campo nombre. Botones: "Guardar" (llama onSave) y "Cancelar" (llama onClose). Modal con overlay oscuro.

### Validation
El modal renderiza en modo creación (campos vacíos) y edición (campos prellenados). Intentar guardar con precio 0 muestra error inline sin request. Intentar guardar con nombre duplicado (simulando 409) muestra el mensaje correcto. El formulario compila sin errores TypeScript.

---

## TASK-013: Crear MaquinaModal

**Status**: pending
**Requirements**: CA-006, CA-008
**Complexity**: M
**Depends on**: TASK-010
**Files**: `frontend/src/components/admin/MaquinaModal.tsx`

### Description
Componente `MaquinaModal` con el mismo patrón que `MaterialModal`. Props: `maquina?: MaquinaAdmin`, `onSave`, `onClose`. Campos: `nombre` (text, requerido), `capacidadXmm` / `capacidadYmm` / `capacidadZmm` (number, > 0, etiquetados "Capacidad X/Y/Z (mm)"), `costoUsd` (number, > 0), `mesesAmortizacion` (number, entero >= 1), `activa` (toggle). Misma lógica de validación client-side, manejo de 409, botones y overlay.

### Validation
El modal renderiza en modo creación y edición. Campos de dimensiones aceptan solo números positivos. Validación de `mesesAmortizacion >= 1` funciona client-side. Compila sin errores TypeScript.

---

## TASK-014: Crear TabMateriales

**Status**: pending
**Requirements**: CA-002, CA-003, CA-004, CA-005, C-2
**Complexity**: M
**Depends on**: TASK-012
**Files**: `frontend/src/components/admin/TabMateriales.tsx`

### Description
Componente `TabMateriales` con prop `onSessionExpired: () => void`. Al montar, llama `adminGetMaterials()` y guarda la lista en estado local. Renderiza una tabla con columnas: Nombre · Precio (EUR) · Densidad (g/cm³) · Estado · Acciones. Badge "Activo" (verde) o "Inactivo" (gris). Acciones por fila: botón "Editar" abre `MaterialModal` en modo edición; botón "Desactivar"/"Activar" con confirmación antes de llamar `adminDeleteMaterial` o `adminUpdateMaterial(id, { activo: true })`. Al desactivar: si es el último material activo (verificar en la lista local), mostrar un warning prominente en el diálogo de confirmación: "Atención: este es el único material activo. El cotizador quedará sin materiales disponibles." Botón "+ Agregar material" abre `MaterialModal` en modo creación. Si cualquier llamada API devuelve error con `code: 'SESSION_EXPIRED'`, llama `onSessionExpired()`.

### Validation
La tabla carga materiales al montar. El toggle activo/inactivo actualiza el badge localmente tras la respuesta del servidor. El warning de último material aparece cuando corresponde. Un material nuevo creado aparece en la tabla sin recargar la página.

---

## TASK-015: Crear TabMaquinas

**Status**: pending
**Requirements**: CA-006, C-2
**Complexity**: M
**Depends on**: TASK-013
**Files**: `frontend/src/components/admin/TabMaquinas.tsx`

### Description
Componente `TabMaquinas` con el mismo patrón que `TabMateriales`. Prop `onSessionExpired`. Tabla con columnas: Nombre · Capacidad (X×Y×Z mm) · Costo (USD) · Amortización · Estado · Acciones. La capacidad se muestra como "256×256×256 mm". Mismo patrón de warning al desactivar la última máquina activa. Usa `MaquinaModal`.

### Validation
La tabla carga máquinas. La columna capacidad muestra el formato "X×Y×Z mm". El warning de última máquina activa aparece cuando corresponde. Compila sin errores TypeScript.

---

## TASK-016: Crear TabParametros

**Status**: pending
**Requirements**: CA-007, CA-008
**Complexity**: M
**Depends on**: TASK-010
**Files**: `frontend/src/components/admin/TabParametros.tsx`

### Description
Componente `TabParametros` con prop `onSessionExpired`. Al montar, llama `adminGetParams()` y precarga el formulario. Campos agrupados en tres secciones: "Tasas de cambio" (tasaEurUsd, tasaArsUsd), "Mano de obra" (tarifaManoObraUsdHora, horasPorPieza), "Costos y ganancia" (desperdicioPct, costosAdicionalesUsd, coeficienteGanancia, piezasPorDiaEstimadas). Todos los campos son numéricos con validación client-side (> 0; desperdicioPct entre 0 y 100). Botón "Guardar cambios" al pie que llama `adminUpdateParams()` con solo los campos modificados. Muestra la fecha de última actualización (`actualizadaAt`) en formato legible. Toast de éxito tras guardar.

### Validation
El formulario precarga con los valores actuales. Intentar guardar con un campo en cero muestra error inline. Tras guardar exitosamente aparece un feedback de confirmación. Compila sin errores TypeScript.

---

## TASK-017: Crear PanelAdmin

**Status**: pending
**Requirements**: CA-002, CA-006, CA-007, CA-009, C-3
**Complexity**: M
**Depends on**: TASK-014, TASK-015, TASK-016
**Files**: `frontend/src/components/screens/PanelAdmin.tsx`

### Description
Componente `PanelAdmin` con props `onBack: () => void` (volver al cotizador) y `onSessionExpired: () => void`. Renderiza la barra de tabs (Materiales / Máquinas / Parámetros) y el tab activo según estado local. Tab por defecto: Materiales. Botón "Volver" en el encabezado llama `onBack()` sin cerrar sesión. Botón "Cerrar sesión" llama `sessionStorage.removeItem('admin_token')` y luego `onSessionExpired()`. Pasa `onSessionExpired` como prop a cada tab. Cuando cualquier tab llama `onSessionExpired`, este componente también la propaga hacia arriba.

### Validation
El componente renderiza los tres tabs y cambia entre ellos. "Volver" no limpia el sessionStorage. "Cerrar sesión" sí lo limpia. El prop `onSessionExpired` se pasa correctamente a los tabs hijos. Compila sin errores TypeScript.

---

## TASK-018: Integrar panel admin en App.tsx y Topbar

**Status**: pending
**Requirements**: CA-001, CA-009
**Complexity**: M
**Depends on**: TASK-011, TASK-017
**Files**: `frontend/src/App.tsx`, `frontend/src/components/layout/Topbar.tsx`

### Description
En `App.tsx`: agregar estado `mode: 'cotizacion' | 'admin'` (default: `'cotizacion'`) y `adminAuthenticated: boolean` (default: verificar si `sessionStorage.getItem('admin_token')` existe). Cuando `mode === 'admin'`: renderizar `AdminLogin` si `!adminAuthenticated`, o `PanelAdmin` si `adminAuthenticated`. Pasar `onLogin={() => setAdminAuthenticated(true)}` a `AdminLogin`; pasar `onBack={() => setMode('cotizacion')}` y `onSessionExpired={() => { setAdminAuthenticated(false) }}` a `PanelAdmin`. El estado del cotizador (`step`, `uploadResult`, `quoteResult`, etc.) NO se toca al entrar/salir del modo admin. En `Topbar.tsx`: agregar un botón "Admin" (icono de llave o engranaje de `@tabler/icons-react`) que llame a un prop `onAdminClick`. Pasar `onAdminClick={() => setMode('admin')}` desde `App.tsx`.

### Validation
Hacer click en "Admin" → aparece el login (o el panel si ya hay sesión). Volver al cotizador desde el panel → el flujo retoma desde el paso donde estaba. La sesión persiste entre entradas al panel dentro del mismo tab. Cerrar sesión desde el panel → vuelve al login al entrar de nuevo. El TypeScript del frontend compila sin errores.
