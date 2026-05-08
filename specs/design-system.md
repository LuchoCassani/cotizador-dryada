# Design System — Cotizador Dryada

**Versión 1.0 · Mayo 2026**

Este documento es la fuente de verdad visual del Cotizador Web. Todo cambio de UI debe alinearse con estas especificaciones. En caso de conflicto entre este documento y cualquier otro, este prevalece para decisiones visuales.

---

## Identidad

Los colores vienen del logotipo de Dryada: el gradiente violeta-magenta de "DRY" y el magenta-naranja de "ADA". La barra "/" del logo se usa como recurso gráfico en la interfaz (separadores, barra de progreso, acento en header).

---

## Colores

### Primario — Violeta
| Token Tailwind | Hex | Uso |
|---|---|---|
| `dryada-violet-tint` | #F0E8FA | Fondos, tints, drop zone activa |
| `dryada-violet-light` | #C89AE8 | Bordes suaves |
| — | #9D55D2 | Hover / estados |
| **`dryada-violet`** | **#7C3FBE** | Botones primarios, acentos, valores de peso, headers activos, indicadores de progreso |
| — | #3A1760 | Texto oscuro sobre fondos violeta |

### Acento — Naranja / Magenta
| Token Tailwind | Hex | Uso |
|---|---|---|
| `dryada-orange-tint` | #FCEEF6 | Fondos, badge compleja |
| — | #F0A0C8 | Bordes suaves |
| `dryada-magenta` | #D63884 | Transición en gradiente |
| **`dryada-orange`** | **#E8602A** | Precios y valores monetarios, botón PDF, botón email, precio final, barra acento decorativa |
| — | #7A2A0A | Texto oscuro sobre fondos naranja |

**Regla**: el naranja se usa exclusivamente para precios, totales y el botón de PDF. Nunca como color de acción genérica.

### Neutros cálidos
Tono ligeramente warm/beige. No usar grises fríos puros.

| Token Tailwind | Hex | Uso |
|---|---|---|
| `dryada-gray-50` | #F7F6F4 | Fondo de la app |
| `dryada-gray-100` | #E2E0DC | Bordes, divisores, superficies de tarjetas |
| `dryada-gray-400` | #9E9C97 | Texto terciario, labels, captions |
| `dryada-gray-700` | #4A4845 | Texto secundario, body |
| `dryada-gray-900` | #1E1C1A | Texto primario |

### Semánticos
Solo para estados del sistema. No usar como colores de marca.

| Estado | Bg | Texto |
|---|---|---|
| Éxito | #D1FAE5 | #065F46 |
| Advertencia | #FEF3C7 | #92400E |
| Error | #FEE2E2 | #991B1B |

---

## Tipografía

- **Principal**: Inter (Google Fonts)
- **Fallback**: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
- **Monoespaciada**: JetBrains Mono o Courier New — solo para valores técnicos (gramos, cm³, dimensiones)

| Rol | Tamaño | Peso | Color |
|---|---|---|---|
| Display (logo) | 28–32px | 700 | violeta |
| H1 — Título página | 24px | 500 | gris 900 |
| H2 — Sección | 18px | 500 | gris 700 |
| H3 — Subsección | 16px | 500 | gris 700 |
| Body | 15px | 400 | gris 700 |
| Caption / Label | 12px | 400 | gris 400 |
| Valor monetario | 22–28px | 500 | naranja #E8602A |
| Valor técnico | 15px | 400 | violeta (mono) |

**Reglas:**
- Sentence case siempre. Nunca MAYÚSCULAS ni Title Case en textos de interfaz.
- El precio final siempre en naranja `#E8602A`, sin excepción.
- Solo pesos 400 y 500 en texto de interfaz. Nunca 600 ni 700.
- Números (gramos, cm³, USD) en fuente monoespaciada para alineación visual.

---

## Espaciado y layout

| Token | Valor |
|---|---|
| xs | 4px |
| sm | 8px |
| md | 12px |
| lg | 16px |
| xl | 24px |
| 2xl | 32px |
| 3xl | 48px |

| Elemento | Valor |
|---|---|
| Border radius sm | 6px |
| Border radius md | 8px |
| Border radius lg | 12px |
| Border radius pill | 9999px |
| Ancho máx. app | 1280px |
| Ancho contenido | 768px |
| Sidebar | Sin sidebar en N1 |

Todos los espaciados son múltiplos de 4px.

---

## Componentes

### Botones

| Variante | Tokens |
|---|---|
| **Primary** | bg `#7C3FBE` · text white · radius 8px · h 40px |
| **Secondary** | bg transparent · border 1.5px `#7C3FBE` · text `#7C3FBE` |
| **Accent (PDF)** | bg `#E8602A` · text white · radius 8px · h 40px |
| **Ghost** | bg transparent · sin border · text gris 700 |
| **Disabled** | opacity 40% · cursor not-allowed |
| **Loading** | spinner inline izquierda · texto "Calculando..." |

### Inputs y formularios

| Elemento | Tokens |
|---|---|
| Input texto | border 0.5px `#E2E0DC` · radius 8px · h 40px · padding 8px/12px |
| Input focus | border 1.5px `#7C3FBE` · ring `0 0 0 3px` violeta 10% |
| Input error | border 1.5px `#991B1B` · mensaje de error debajo |
| Select | mismo estilo que input · ícono chevron a la derecha |
| Textarea | mismo estilo · min-height 80px · resize vertical |
| Label | 12px · 500 · gris 700 · margin-bottom 4px |
| Helper text | 12px · 400 · gris 400 · margin-top 4px |
| Error message | 12px · 400 · rojo semántico `#991B1B` · margin-top 4px |

### Tarjetas de resultado (QuoteResult)

| Elemento | Tokens |
|---|---|
| Métrica estándar | bg `#F7F6F4` · sin border · radius 8px · padding 16px |
| Label | 12px · gris 400 · margin-bottom 4px |
| Valor | 22px · 500 · color según tipo (ver abajo) |
| Subtext | 11px · gris 400 · margin-top 4px |
| Tarjeta destacada | border 2px `#7C3FBE` · bg white |

Colores de valor según tipo:
- Peso (gramos) → violeta `#7C3FBE`
- Precio final → naranja `#E8602A` · 28px
- Volumen / área → gris 700

### Badges de complejidad

| Estado | Bg | Uso |
|---|---|---|
| Simple | `#F0E8FA` (violeta tint) | Sin advertencia adicional |
| Moderada | `#FFF3E0` (amber tint) | Advertencia sutil |
| Compleja | `#FCEEF6` (naranja tint) | Banner prominente y bloqueante |

**Regla crítica**: cuando `complejidad === 'compleja'`, el banner de advertencia debe ser visible antes de que el empleado pueda hacer click en "Descargar PDF" o "Enviar por email". No se puede ocultar ni minimizar.

### Barra de progreso (3 pasos)

- Track: bg `#E2E0DC` · h 4px · radius 2px
- Fill activo: gradiente `linear: #7C3FBE → #D63884 → #E8602A`
- Paso completado: ícono check violeta · label gris 700
- Paso activo: dot violeta sólido · label gris 900 · bold
- Paso pendiente: dot gris 100 · label gris 400

### Alertas

| Tipo | Bg |
|---|---|
| Info | #EFF6FF |
| Éxito | #F0FDF4 |
| Advertencia | #FFFBEB |
| Error | #FEF2F2 |
| Compleja (UI) | #FCEEF6 |

---

## Iconografía

**Librería**: Tabler Icons (outline). Instalar: `@tabler/icons-react`.

- 20px en interfaz general
- 16px en badges y botones chicos
- 24px en estados vacíos / ilustraciones

| Contexto | Ícono |
|---|---|
| Subir STL | `IconUpload` / `IconFile3d` |
| Visualizador 3D | `IconBox` / `IconRotate3d` |
| Material | `IconFlask` / `IconDroplet` |
| Cantidad | `IconStack2` |
| Precio / cotización | `IconCurrencyDollar` |
| Descargar PDF | `IconFileDownload` |
| Enviar email | `IconSend` |
| Advertencia | `IconAlertTriangle` |
| Éxito | `IconCircleCheck` |
| Error | `IconCircleX` |
| Empleado | `IconUser` |

---

## Recurso gráfico: la diagonal "/"

Elemento identitario del logo. Usos en la UI:
- Separador de secciones: línea `height: 2px` con gradiente `#7C3FBE → #D63884 → #E8602A`
- Fill de la barra de progreso activa
- Acento decorativo en el header junto al logotipo

**Nunca** usar el gradiente en texto de interfaz general, solo en estos elementos designados.

---

## Flujo de pantallas

SPA con 3 pasos lineales. Sin navegación lateral ni menú en N1.

### Pantalla de inicio — Identidad del empleado
- Layout centrado vertical y horizontal en viewport
- Logo Dryada + subtítulo "Cotizador"
- Campo nombre del empleado (requerido)
- CTA: botón primary "Comenzar cotización"

### Paso 1 — Subir STL
- Drop zone: borde dashed `#E2E0DC` · radius 12px
- Drop activo: borde violeta sólido 1.5px · bg violeta tint
- Loading: spinner + "Analizando modelo..."
- Visor 3D: 50% del ancho · OrbitControls activo
- Info geométrica: volumen, área, dimensiones bounding box
- Badge complejidad: visible inmediatamente tras el análisis

### Paso 2 — Configurar cotización
- Select de material: nombre + precio/g de cada opción
- Input cantidad: numérico · mín 1 · máx 9999
- Textarea observaciones: opcional · máx 500 caracteres
- CTA: botón primary "Calcular cotización" (estado loading durante POST)

### Paso 3 — Resultado
- Tarjetas métricas: peso total · costo material · precio unitario · total
- Precio final: 28px · naranja · destacado
- Desglose: tabla expandible (infill, paredes, inicio de impresión)
- Badge complejidad: siempre visible si aplica
- Botón PDF: Accent naranja · descarga directa desde el browser
- Botón email: Secondary violeta · abre modal
- Modal email: campo destinatario · validación de formato · botón enviar
- Número de cotización: formato `DRY-YYYY-NNNN` · visible en header del resultado

---

## PDF (`@react-pdf/renderer`)

| Sección | Contenido |
|---|---|
| Header | Logo Dryada · número de cotización · fecha |
| Empleado | Nombre del vendedor que generó la cotización |
| Modelo | Nombre del archivo STL · dimensiones · complejidad |
| Material | Nombre · precio/g · densidad |
| Desglose | Gramos infill · gramos paredes · costo material · costo inicio |
| Resultado | Precio unitario · cantidad · precio final en USD |
| Observaciones | Texto libre ingresado por el empleado |
| Advertencia | Si compleja: nota de margen ±15% en rojo |
| Footer | Datos de contacto Dryada · leyenda de validez de cotización |

**Paleta PDF**: solo violeta `#7C3FBE` (headers, bordes) y naranja `#E8602A` (precio final, totales). Sin gradientes.

---

## Tailwind config (`tailwind.config.ts`)

```ts
colors: {
  'dryada-violet':       '#7C3FBE',
  'dryada-violet-light': '#C89AE8',
  'dryada-violet-tint':  '#F0E8FA',
  'dryada-orange':       '#E8602A',
  'dryada-magenta':      '#D63884',
  'dryada-orange-tint':  '#FCEEF6',
  'dryada-gray-50':      '#F7F6F4',
  'dryada-gray-100':     '#E2E0DC',
  'dryada-gray-400':     '#9E9C97',
  'dryada-gray-700':     '#4A4845',
  'dryada-gray-900':     '#1E1C1A',
}
```

---

## Do's and Don'ts

**Hacer:**
- Violeta para todas las acciones primarias e indicadores de peso
- Naranja exclusivamente para precios, totales y el botón de PDF
- Mostrar siempre el badge de complejidad si IC > 12
- Sentence case en todos los textos de interfaz
- Espaciado en múltiplos de 4px
- Validar el STL en cliente (extensión + tamaño) antes del POST
- Mensajes de error en español sin jerga técnica

**No hacer:**
- Calcular precios o gramos en el frontend
- Usar gradientes en texto de interfaz general
- Ocultar o minimizar la advertencia de pieza "compleja"
- Usar colores semafóricos (rojo/verde) como colores de marca
- Mostrar stack traces o mensajes técnicos al empleado
- Hardcodear valores de precio en el frontend
- Usar pesos de fuente 600 o 700 en texto de interfaz
