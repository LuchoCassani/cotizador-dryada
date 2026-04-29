# CLAUDE.md — Cotizador Dryada

Instrucciones para Claude Code al trabajar en este proyecto.

---

## Contexto del proyecto

Herramienta web interna para cotizar piezas de impresión 3D FDM. Los empleados de ventas suben un archivo STL y obtienen un precio estimado, un PDF descargable y la opción de enviarlo por email.

El desarrollo se divide en 3 niveles de complejidad:
- **Nivel 1 (MVP)**: cálculo geométrico desde el STL, JSON local como fuente de precios
- **Nivel 2**: reemplazar cálculo geométrico por PrusaSlicer CLI en backend
- **Nivel 3**: parámetros editables, panel de admin, historial completo

Actualmente estamos en **Nivel 1**.

---

## Documentación de referencia

Leer estos archivos antes de implementar cualquier feature:

- `specs/cotizador-dryada-sdd.md` — Arquitectura, fórmulas, decisiones de diseño
- `rules.md` — Restricciones de diseño que se deben respetar
- `tasks.json` — Tareas del proyecto con estado y criterios de done
- `checklist.md` — Checklist de validación por fase

---

## Stack tecnológico

**Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + react-three-fiber + @react-pdf/renderer  
**Backend**: Node.js 20 + Fastify 4 + TypeScript + Nodemailer  
**Persistencia N1**: JSON local en memoria (sin base de datos)  
**Email**: Gmail SMTP con App Password  
**Moneda**: USD en todos los precios, cotizaciones y valores monetarios

---

## Reglas de implementación

### Lo que nunca se debe hacer

- Calcular precios o gramos en el frontend (ver R10 en rules.md)
- Instanciar repositorios concretos fuera de `app.ts` (ver R3)
- Usar `factor_paredes` como constante global en la fórmula (ver R4)
- Hardcodear credenciales de email (ver R13)
- Exponer stack traces o mensajes técnicos al usuario (ver R8, R12)
- Omitir la detección de complejidad de pieza (ver R6)

### Fórmula de cálculo (Nivel 1)

```typescript
const infillWeight = volumenCm3 * FILL_RATIO * material.densidad;
const wallWeight   = areaCm2 * (N_PERIMETROS * ANCHO_LINEA_CM) * material.densidad;
const gramos       = infillWeight + wallWeight;
```

Constantes fijas en N1:
- `FILL_RATIO = 0.10`
- `N_PERIMETROS = 2`
- `ANCHO_LINEA_CM = 0.04`

### Detección de complejidad

```typescript
const ic = areaCm2 / Math.pow(volumenCm3, 2/3);
// ic > 20 → 'compleja' (advertencia prominente en UI)
// ic > 12 → 'moderada' (advertencia sutil)
// ic <= 12 → 'simple' (sin advertencia)
```

---

## Patrón de inyección de dependencias

```typescript
// app.ts — único lugar donde se resuelven implementaciones
const pricesRepo = new JsonPricesRepository();
const quoteRepo  = new InMemoryQuoteRepository();
export const quoteService = new QuoteService(pricesRepo, quoteRepo);
```

En Nivel 2: cambiar `JsonPricesRepository` por `DatabasePricesRepository`. Solo en `app.ts`.

---

## Estructura de archivos del backend

```
backend/src/
├── app.ts                    ← DI bootstrap
├── server.ts                 ← Fastify listen
├── routes/                   ← handlers HTTP (sin lógica de negocio)
├── services/
│   ├── quote.service.ts      ← fórmula + orquestación
│   ├── email.service.ts      ← Nodemailer
│   └── stl-processor.ts     ← parse + volumen + área + complejidad
├── repositories/
│   ├── prices.repository.ts  ← interface IPricesRepository
│   ├── quote.repository.ts   ← interface IQuoteRepository
│   └── *.ts                  ← implementaciones concretas
└── data/
    └── prices.json
```

---

## Variables de entorno

```env
PORT=3001
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=cotizador@dryada.com
SMTP_PASS=<app-password-16-chars>
EMAIL_FROM="Cotizador Dryada <cotizador@dryada.com>"
UPLOAD_MAX_MB=50
```

---

## Convenciones de nombre

- Dominio en español: `cotizacion`, `material`, `empleado`, `precioFinal`
- Infraestructura en inglés: `QuoteService`, `PricesRepository`, `EmailService`
- Interfaces con prefijo I: `IPricesRepository`, `IQuoteRepository`
- Implementaciones describen su mecanismo: `JsonPricesRepository`, `InMemoryQuoteRepository`

---

## Antes de marcar una tarea como done

Verificar el criterio de done en `tasks.json` para esa tarea específica. Si el criterio incluye un test manual (ej: "pesar 10 piezas físicas"), no marcarlo como done hasta completarlo.
