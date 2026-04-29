# Reglas del proyecto — Cotizador Dryada

Estas reglas aplican a todo el código del proyecto. Son restricciones de diseño, no sugerencias.

---

## Arquitectura

**R1 — La lógica de negocio no conoce implementaciones de datos.**
`QuoteService` y cualquier otro service solo hablan con interfaces (`IPricesRepository`, `IQuoteRepository`). Nunca importan `JsonPricesRepository`, `InMemoryQuoteRepository` ni nada concreto. Las implementaciones se inyectan en `app.ts`.

**R2 — El procesamiento del STL ocurre en el backend.**
El frontend usa `STLLoader` únicamente para visualización 3D. El cálculo de volumen, área superficial, detección de complejidad y validaciones se hacen en `stl-processor.ts` del backend. Si hay lógica de cálculo en el frontend, está mal.

**R3 — Un solo punto de inyección de dependencias.**
`src/app.ts` es el único lugar donde se instancian repositorios y se conectan con los servicios. No crear instancias de repositorios en rutas ni en otros servicios.

---

## Cálculo de cotización

**R4 — Usar la fórmula con área superficial, no el factor constante.**
La fórmula correcta es:
```
gramos = (volumen_cm3 × fill_ratio × densidad) + (area_cm2 × wall_thickness_cm × densidad)
```
Nunca usar `gramos = volumen × densidad × (factor_relleno + factor_paredes)` con `factor_paredes` constante global.

**R5 — Los parámetros de impresión son constantes en Nivel 1.**
`fill_ratio`, `n_perimetros`, `ancho_linea_cm` y `layer_height_cm` son constantes definidas en `quote.service.ts`. No son configurables por el empleado en N1. No crear campos de formulario para ellos.

**R6 — La detección de complejidad siempre se incluye en la cotización.**
`evaluarComplejidad()` se llama siempre, el campo `complejidad` se guarda en `QuoteRecord`, y el frontend muestra la advertencia correspondiente. No se puede omitir aunque parezca innecesaria.

---

## API y HTTP

**R7 — Schemas de validación en todas las rutas.**
Fastify valida request y response con JSON Schema. No hay rutas sin schema. Los campos inesperados son rechazados (`additionalProperties: false`).

**R8 — Errores en formato consistente.**
Todos los errores retornan `{ error: string, code: string }`. Nunca exponer stack traces ni mensajes de error internos al cliente.

**R9 — El endpoint de upload limpia los archivos temporales.**
Los STL subidos se guardan en `/tmp` con UUID. Si el flujo se abandona (no se genera cotización), los archivos se limpian en el siguiente arranque del servidor. No acumular archivos indefinidamente.

---

## Frontend

**R10 — El frontend no calcula precios.**
Toda la lógica de cotización vive en el backend. El frontend solo muestra los resultados que retorna `/api/quote`. Si hay cálculos de precio en el frontend, están mal.

**R11 — Advertencias de complejidad antes de enviar.**
Si `complejidad === 'compleja'`, el banner de advertencia debe ser visible en `QuoteResult` antes de que el empleado pueda hacer click en "Descargar PDF" o "Enviar por email". No ocultarlo ni hacerlo opcional.

**R12 — Mensajes de error en lenguaje del empleado.**
Ningún mensaje de error técnico (nombres de campos, códigos HTTP, stack traces) llega a la pantalla del empleado. Todos los estados de error tienen un mensaje en español claro y sin jerga técnica.

---

## Email

**R13 — Credenciales de email solo en variables de entorno.**
`SMTP_USER` y `SMTP_PASS` vienen exclusivamente de `.env`. No hay valores hardcodeados en el código. El archivo `.env` no se versiona (está en `.gitignore`).

**R14 — El PDF se genera en el frontend, no en el backend.**
El backend solo recibe el PDF como base64 y lo adjunta al email. La generación del PDF (template, estilos, logo) es responsabilidad del frontend con `@react-pdf/renderer`.

---

## Extensibilidad

**R15 — No optimizar para N2/N3 desde N1, pero no cerrar la puerta.**
No agregar abstracciones que solo servirían en niveles futuros. Pero cualquier cambio que rompa los contratos de interfaces (`IPricesRepository`, `IQuoteRepository`) requiere justificación explícita.

**R16 — El campo `complejidad` en `QuoteRecord` no se elimina aunque parezca redundante.**
Es un dato de calibración para el Nivel 2: permite correlacionar el índice de compacidad con el error real del slicer.

---

## Progreso y trazabilidad

**R17 — Después de cada commit, actualizar el estado del proyecto.**
Inmediatamente después de hacer un commit, actualizar:
- `checklist.md`: marcar con `[x]` todos los ítems completados por ese commit
- `tasks.json`: cambiar `"estado"` a `"completed"` en las tareas finalizadas y actualizar `"metricas"`
- `specs/cotizador-dryada-sdd.md`: si el commit introdujo una decisión de diseño que difiera de lo documentado, reflejarla

Esto garantiza que al retomar el trabajo en una nueva sesión, el estado del proyecto sea legible de inmediato sin necesidad de revisar el historial de git.

---

## Código general

- TypeScript estricto: `"strict": true` en tsconfig. Sin `any`.
- Sin comentarios que expliquen el qué. Solo comentar el por qué cuando no es obvio.
- Todos los precios y valores monetarios están en USD. Sin conversiones ni múltiples monedas.
- Nombres en español para el dominio (cotización, material, empleado). Nombres en inglés para infraestructura (service, repository, handler).
- Tests unitarios obligatorios para `stl-processor.ts` y `quote.service.ts`. El resto puede ir sin tests en N1.
