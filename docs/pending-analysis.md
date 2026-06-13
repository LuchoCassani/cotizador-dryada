# Puntos pendientes de análisis

Temas que surgieron en conversación y requieren más investigación o consulta antes de convertirse en specs.

---

## PrusaSlicer CLI — integración para cálculo exacto de filamento

**Contexto:** Actualmente el cotizador usa una fórmula geométrica aproximada para estimar gramos de filamento. PrusaSlicer tiene un modo CLI que devuelve el peso exacto (los mismos gramos que aparecerían en la pantalla de la impresora antes de imprimir), tiempo estimado de impresión, y sugerencia de orientación óptima (`--auto-orient`).

**Por qué importa:**
- Mejora la precisión del cotizador considerablemente (Nivel 2 del roadmap)
- `--auto-orient` resuelve el problema de piezas subóptimamente orientadas en el STL
- Con máquinas como entidades en SQLite (SPEC-A), cada máquina podría tener su propio perfil `.ini` de PrusaSlicer → cotización exacta por máquina

**Preguntas a resolver antes de crear una spec:**
1. ¿Denise tiene perfiles `.ini` configurados en su PrusaSlicer para cada una de las 4 máquinas? (Si sí: implementación sencilla. Si no: hay trabajo de configuración previo al código.)
2. ¿Qué sistema operativo corre el servidor compartido donde vive el backend? (Determina cómo instalar PrusaSlicer: Windows installer, macOS .dmg, Linux AppImage.)
3. ¿PrusaSlicer ya está instalado en esa máquina?
4. ¿El servidor tiene suficiente CPU para slicing en background? (STL grandes pueden tardar 10–30 segundos.)

**Decisión de diseño anticipada:** si PrusaSlicer no está disponible (no instalado), el backend debería hacer fallback automático a la fórmula geométrica actual de Nivel 1 sin romper el flujo.

**Estado:** no analizado en profundidad. Retomar cuando Denise confirme las preguntas de arriba.
