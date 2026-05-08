# Checklist de implementación — Cotizador Dryada Nivel 1

Marcar cada ítem con `[x]` al completarlo. No marcar hasta que el criterio esté realmente cumplido.

---

## Fase 1 — Backend Core

### Scaffolding
- [x] Proyecto Node.js + TypeScript inicializado
- [x] Fastify instalado y corriendo en puerto 3001
- [x] `tsconfig.json` con `"strict": true`
- [x] Estructura de carpetas creada (`routes/`, `services/`, `repositories/`, `data/`)
- [x] `.env` en `.gitignore`

### Parser STL
- [x] Detección binario vs ASCII funcionando (primeros bytes del buffer)
- [x] Parser binario: extrae triángulos correctamente
- [x] Parser ASCII: extrae triángulos correctamente
- [ ] Test: cubo 10×10×10mm binario → volumen = 1.000 cm³ (±0.1%)
- [ ] Test: cubo 10×10×10mm ASCII → mismo resultado

### Cálculo de volumen y área superficial
- [x] `analizarStl()` calcula volumen con tetraedros signados
- [x] `analizarStl()` calcula área superficial con producto vectorial
- [x] `analizarStl()` calcula bounding box
- [x] Ambas métricas calculadas en una sola iteración sobre triángulos
- [ ] Test: cubo 1cm³ → areaCm2 = 6.0 (±0.1%)

### Validaciones de archivo
- [x] Volumen negativo o cero → error "geometría inválida"
- [x] Bounding box > 500mm → advertencia "probable pulgadas"
- [x] Advertencias incluidas en la respuesta sin bloquear el flujo

### Detección de complejidad
- [x] `evaluarComplejidad(areaCm2, volumenCm3)` implementada
- [x] IC > 20 → `'compleja'`
- [x] IC > 12 → `'moderada'`
- [x] IC ≤ 12 → `'simple'`
- [ ] Test con esfera → `'simple'`
- [ ] Test con celosía o pieza de pared delgada → `'compleja'`

### Repositorios
- [x] Interface `IPricesRepository` definida
- [x] Interface `IQuoteRepository` definida
- [x] `JsonPricesRepository` implementada y funciona con `prices.json`
- [x] `InMemoryQuoteRepository` implementada (Map en memoria)
- [ ] `prices.json` completo con materiales reales de Dryada (validado por el equipo) ← pendiente confirmación

### QuoteService
- [x] Constructor recibe `IPricesRepository` e `IQuoteRepository` (no implementaciones concretas)
- [x] `calcularCotizacion()` usa fórmula: `infill_weight + wall_weight`
- [x] `calcularCotizacion()` retorna desglose: volumen, área, gramosInfill, gramosParedes, gramosTotal, costoMaterial, costoInicio, precioFinal
- [x] Campo `complejidad` incluido en el resultado y guardado en `QuoteRecord`
- [ ] Test con valores conocidos: resultado calculado manualmente coincide

### Bootstrap
- [x] `app.ts` instancia repositorios concretos e inyecta en `QuoteService`
- [x] Ningún servicio importa una implementación concreta de repositorio

---

## Fase 2 — Backend HTTP

### Ruta POST /api/upload
- [x] Valida extensión `.stl` (rechaza otros formatos con 400)
- [x] Valida tamaño máximo 50MB (rechaza con 413)
- [x] Llama a `analizarStl()` y retorna análisis completo
- [x] Retorna `{ uploadId, volumenCm3, areaCm2, boundingBox, complejidad, advertencias }`
- [x] Archivo guardado en `/tmp/<uuid>.stl`
- [ ] Test: curl con STL válido → 200 con análisis correcto

### Ruta GET /api/materials
- [x] Retorna lista desde `IPricesRepository.getMateriales()`
- [x] Cada material incluye: id, nombre, precioGramo, densidad
- [ ] Test: respuesta coincide con `prices.json`

### Ruta POST /api/quote
- [x] Valida que `uploadId` existe en cache en memoria
- [x] Valida que `materialId` existe en el repositorio
- [x] Valida `cantidad >= 1`
- [x] Calcula cotización y guarda en `IQuoteRepository`
- [x] Retorna desglose completo con número de cotización único (UUID)
- [ ] Test: flujo completo upload → quote retorna cotización correcta

### Ruta POST /api/quote/:id/email
- [x] Valida que el ID de cotización existe
- [x] Valida dirección de email del destinatario
- [x] Recibe `pdfBase64` y lo adjunta al email
- [x] Usa `EmailService` (no Nodemailer directamente en la ruta)
- [x] Retorna 200 en envío exitoso, error descriptivo si falla

### EmailService
- [x] Configura Nodemailer con `smtp.gmail.com:587` + STARTTLS
- [x] Lee credenciales de `process.env.SMTP_USER` y `process.env.SMTP_PASS`
- [x] En desarrollo sin credenciales → fallback a transporte local (puerto 25)
- [x] Asunto del email claro: "Cotización Dryada #[número]"
- [x] PDF adjunto con nombre descriptivo

### Validación y errores
- [x] Rutas POST tienen JSON Schema para body
- [x] Error handler global retorna `{ error: string, code: string }`
- [x] Sin stack traces expuestos en respuestas de error
- [ ] Test: campo faltante en POST /api/quote → 400 con mensaje claro

---

## Fase 3 — Frontend

### Scaffolding
- [x] Vite + React 18 + TypeScript inicializado
- [x] Tailwind CSS v4 configurado con plugin `@tailwindcss/vite`
- [x] Tokens del design system definidos en `index.css` (`@theme`)
- [x] Fuentes Inter + JetBrains Mono cargando desde Google Fonts
- [x] `@tabler/icons-react` instalado
- [x] Proxy `/api` → `http://localhost:3001` en `vite.config.ts`
- [x] Estructura de carpetas creada (`components/`, `services/`, `types/`, `hooks/`)
- [x] `types/index.ts` con tipos alineados a la API del backend
- [x] `services/api.ts` con fetch wrapper tipado para las 4 rutas

### ModelViewer
- [x] react-three-fiber + @react-three/drei instalados
- [x] `STLLoader` carga el modelo desde `URL.createObjectURL(file)`
- [x] `OrbitControls` permite rotar el modelo
- [x] Placeholder visible cuando no hay modelo cargado
- [x] Centra la geometría automáticamente con `computeBoundingBox`
- [ ] Probado con un STL real de Dryada

### FileUploader (PasoSubirSTL)
- [x] Drag & drop funciona (onDrop, onDragOver, onDragLeave)
- [x] Validación client-side de extensión `.stl`
- [x] Validación client-side de tamaño < 50MB
- [x] POST a `/api/upload` con indicador de carga (spinner)
- [x] Muestra dimensiones del modelo (bounding box en mm)
- [x] Muestra advertencia si hay probable error de unidades
- [x] Muestra badge de complejidad (simple / moderada / compleja)
- [x] Pasa `uploadId` y `file` al siguiente paso
- [ ] Probado con un STL real de Dryada

### QuoteForm (PasoCotizar)
- [x] GET `/api/materials` puebla el selector de material
- [x] Selector muestra nombre y precio/g de cada material
- [x] Input de cantidad con validación (mínimo 1, número entero)
- [x] Textarea de observaciones (opcional, máx 500 chars)
- [x] Botón "Calcular cotización" deshabilitado si faltan campos
- [x] Estado loading durante el POST

### QuoteResult (PasoResultado)
- [x] Muestra desglose: volumen, área, gramos infill, gramos paredes, gramos total
- [x] Muestra: costo material, costo inicio, precio unitario, precio final
- [x] Precio final en naranja `#E8602A` · 26px
- [x] Número de cotización formato `DRY-YYYY-XXXX`
- [x] Si `complejidad === 'compleja'`: banner de advertencia prominente **antes** de los botones de acción
- [x] Si `complejidad === 'moderada'`: badge visible
- [x] Botón "Descargar PDF" (callback pendiente de F3-T6)
- [x] Botón "Enviar por email" abre modal

### PDF
- [ ] Template incluye: logo Dryada, número de cotización, fecha
- [ ] Template incluye: nombre del empleado, nombre del archivo STL
- [ ] Template incluye: material, cantidad, desglose de precios
- [ ] Template incluye: observaciones (si las hay)
- [ ] Si complejidad es `compleja` o `moderada`: nota de margen de error en el PDF
- [ ] PDF validado y aprobado por el equipo de ventas

### Modal de envío por email
- [x] Campo de email del destinatario con validación de formato
- [x] POST a `/api/quote/:id/email` con pdfBase64
- [x] Muestra confirmación de envío exitoso
- [x] Muestra error descriptivo si el envío falla
- [ ] Email llega al destinatario con el PDF correcto (bloqueado por F3-T6)

### Pantalla de inicio
- [x] Campo para nombre del empleado con validación (no vacío)
- [x] Nombre persiste en el estado de la app durante toda la sesión
- [x] Nombre se incluye en `empleadoId` al crear la cotización

### Manejo de errores en UI
- [x] STL inválido → mensaje en español sin jerga técnica
- [x] Error de red → mensaje genérico con descripción del problema
- [x] Error de email → mensaje descriptivo
- [x] Sin stack traces ni códigos HTTP visibles al empleado
- [x] Indicadores de carga en todas las operaciones async (upload, cotización, envío)

---

## Fase 4 — Validación antes de lanzar

### Calibración
- [ ] 10 piezas físicas pesadas en la impresora
- [ ] 10 cotizaciones generadas para las mismas piezas
- [ ] Tabla de errores porcentuales documentada
- [ ] Error promedio < 15%
- [ ] Si error sistemático > 15%: constantes ajustadas y re-testeadas

### Casos borde
- [ ] STL en pulgadas → advertencia correcta
- [ ] STL ASCII → procesa correctamente
- [ ] STL con malla abierta → error claro "geometría inválida"
- [ ] STL > 50MB → error 413 con mensaje amigable
- [ ] STL con geometría muy delgada (celosía) → detectado como `'compleja'`
- [ ] Archivo que no es STL con extensión .stl → error descriptivo

### Validación del PDF
- [ ] Aprobación del equipo de ventas sobre el template
- [ ] Logo visible y correcto
- [ ] Todos los campos presentes

### Test end-to-end con usuario real
- [ ] Empleado de ventas completa el flujo sin intervención técnica
- [ ] El empleado entiende las advertencias de complejidad
- [ ] El PDF generado es correcto
- [ ] El email llega correctamente

### Gmail en producción
- [ ] App Password generado para la cuenta de producción
- [ ] Prueba de envío desde servidor de producción
- [ ] Email llega a bandeja principal (no spam)
- [ ] Latencia de entrega < 30 segundos

---

## Áreas de atención — revisar antes del deploy

### AA-1 · uploadCache volátil ✅ resuelto
- [x] TTL de 30 minutos implementado en `upload.route.ts`
- [x] Limpieza activa de `/tmp` y del Map al expirar
- [x] Mensaje de error explícito al usuario cuando el upload expiró

### AA-2 · Limpieza de /tmp ✅ resuelto
- [x] `programarLimpieza(uploadId)` con `setTimeout` de 30 min
- [x] No depende de reinicios del servidor

### AA-3 · prices.json sin confirmar 🔴 bloqueante para deploy
- [ ] Reunión con equipo de ventas/producción para definir precios reales
- [ ] `backend/src/data/prices.json` actualizado con valores reales en USD
- [ ] Aprobación explícita del equipo documentada (email o firma)
- [ ] Tarea F1-T9 marcada como `completed` en tasks.json

### AA-4 · PDF en frontend — nota para N3 📋 documentado
- [ ] Al planificar N3: evaluar mover generación de PDF al backend
- [ ] Considerar PDFKit o Puppeteer en el servidor para soportar historial y automatizaciones

### AA-5 · Sin auth ni rate limiting 🔶 antes de exponer a internet
- [ ] Agregar `@fastify/rate-limit` al servidor
- [ ] Agregar autenticación básica (token Bearer estático) antes de exponer fuera de la red interna
- [ ] No bloqueante para lanzamiento interno en red privada

---

## Criterio de lanzamiento

El sistema puede abrirse al equipo de ventas cuando:

- [x] Todas las tareas de F1 y F2 están marcadas (menos F1-T9 precios)
- [ ] F3 completa: falta F3-T6 (PDF) y F3-T7 (email con PDF)
- [ ] Error de calibración promedio < 15% (F4-T1)
- [ ] Test end-to-end con usuario real sin errores bloqueantes (F4-T4)
- [ ] PDF aprobado por ventas (F4-T3)
- [ ] Gmail funcionando en producción (F4-T5)
- [ ] **prices.json validado por el equipo (AA-3)** ← bloqueante
