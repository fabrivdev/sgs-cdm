# Ajuste de densidad en cards y estandarización de labels de filtros

## Objetivo
Reducir ligeramente el tamaño de las cards de KPIs/paneles y unificar los encabezados de filtros con los encabezados de listas/tablas, eliminando mayúsculas sostenidas y ajustando el espacio label-input.

## Cambios

### 1. Tokens de tipografía (`src/lib/ui-classes.ts`)
- Nuevo `filterLabel`: `text-[11px] leading-4 font-medium tracking-[0.02em] text-muted-foreground` (sin uppercase).
- `cardLabel`: `text-[10px] leading-3.5 font-medium tracking-[0.02em] text-muted-foreground` (sin uppercase).
- `kpiValue`: reduce a `text-[20px] font-semibold leading-6 tabular-nums tracking-[-0.02em]`.
- `tableHeadText` se mantiene como referencia en 11px.

### 2. Primitivas de cards (`src/components/layout/AppPrimitives.tsx`)
- `KpiStrip`: `min-h-[72px]` → `min-h-[64px]`.
- `KpiItem`: label con `cardLabel` (10px), value con `kpiValue` reducido, detail a `text-[10px]`, padding `px-3 py-2.5`.
- `Panel`: padding `p-4` → `p-3.5`.
- `SectionHeader`: título `text-[14px]` → `text-[13px]`.

### 3. Labels de filtros (`src/components/filters/FiltersBar.tsx`, `FilterMultiSelect.tsx`, `DashboardPanels.tsx`)
- Reemplazar estilos uppercase por `filterLabel` (11px, sin uppercase).
- Aumentar separación entre label y control de `gap-0.5` a `gap-2` para igualar el padding vertical del contenedor (`py-2`).
- Ajustar altura del bloque de label a `h-4` para el nuevo tamaño de 11px.

### 4. Verificación visual
- Revisar en Dashboard, Trabajos, Planificador y Repuestos que los labels queden en "Solo primera letra" y alineados con el tamaño de los encabezados de tabla.
- No se modificarán diálogos modales, sidebar ni calendario mensual en esta tanda.

## Alcance
Solo estilos visuales en las primitivas de cards y filtros; sin cambios de lógica ni datos.
