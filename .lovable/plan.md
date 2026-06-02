## Cambios a `src/pages/Dashboard.tsx`

### 1. Quitar "Drill de análisis"
- Eliminar la `Card` "Drill de análisis" en Vista general (líneas 806-814) con sus 4 `DrillButton`.
- En la pestaña Trabajos (líneas 1113-1117), quitar el bloque de 3 `DrillButton` ("Ver trabajos abiertos", "Ver trabajos pausados", "Ver planificación") dentro del Card de Lectura operativa. Esas acciones ya están disponibles desde los chips de estado y el menú de navegación.
- Reajustar grid de la sección superior de Vista general: el Card "Flujo operativo" pasa a ocupar todo el ancho (`xl:grid-cols-1` o quitar el wrapper de 2 columnas).
- Si `DrillButton` queda sin usos, eliminar también su definición (línea 1425).

### 2. Rediseñar "Estado de trabajos"
Reemplazar `EstadoCompacto` por una presentación tipo **barra apilada con leyenda**, más clara y menos "cuadriculada":

```text
Estado de trabajos                          Total: 95
█████████████░░░░░░░░░░░░░░░░░░░░░░░  (barra horizontal con 3 segmentos)
 Culminados 76 (80%)   Abiertos 17 (18%)   Pausados 2 (2%)

Pipeline: Pendiente 5 · Programado 8 · Iniciado 4
```

Detalles:
- Card con título "Estado de trabajos" y a la derecha "Total {n}".
- Una barra horizontal de `h-3 rounded-full overflow-hidden bg-muted` con tres segmentos coloreados con tokens semánticos: `bg-primary` (culminados), `bg-accent` o `bg-blue-500/70` (abiertos), `bg-amber-500/70` (pausados). Sin colores hardcoded fuera de los tokens; preferir clases del design system existentes.
- Debajo, una leyenda en fila con punto de color + label + valor + %. Cada item es `button` clickeable que llama `onSelect(estado)` (igual contrato actual).
- Línea inferior pequeña (texto `text-[11px] text-muted-foreground`) tipo "Pipeline:" con los sub-estados Pendiente/Programado/Iniciado como botones inline.
- Estado vacío: si `total === 0`, mostrar mensaje "Sin trabajos en el periodo seleccionado".
- Mantener `props` y firma de `EstadoCompacto` para no tocar los 2 call-sites (líneas 820 y 1032).

### 3. Sin cambios fuera de esto
- No tocar lógica de datos, memos ni filtros.
- Mantener identidad visual: cards blancas, oliva, tokens existentes.
