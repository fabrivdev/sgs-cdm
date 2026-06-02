## Ajustes Dashboard ejecutivo

Cambios puntuales sobre `src/pages/Dashboard.tsx` (más un componente nuevo para multi-select). Sin tocar identidad visual ni lógica de datos.

### 1. Símbolo de moneda: `USD` → `$`

- Cambiar `money()` (línea 143-149): `style: "decimal"` con prefijo `"$ "`, o reemplazar el output `USD` por `$`. Resultado: `$ 12.345`.
- Limpiar el `.replace("USD", "")` en `WeeklyBars` (línea 1215): pasar a usar `money()` directo, que ahora trae `$`.
- Revisar todas las celdas/Kpi que muestran números sin símbolo (variaciones %, conteos no, pero montos sí). Agregar `$` en:
  - `SummaryCard` "Facturacion del periodo" (ya usa money).
  - Tabla de Facturación por semana, columna total (línea ~865) si está sin símbolo.
  - `SucursalBars`, `MixRubros`, `ClientesCompacto`, `EvolucionKpis` — verificar y forzar `money()` en todos los montos.
- Etiqueta del chart: `Facturacion semanal (USD)` (línea 1230) → `Facturacion ($)`.

### 2. Asimetría de cards

Causa: la fila de 5 `SummaryCard` (`xl:grid-cols-5`) más las grids `xl:grid-cols-[1.2fr_1fr]` y `xl:grid-cols-2` siguientes generan alturas dispares en 1080px.

- Forzar altura mínima uniforme en `SummaryCard`: `min-h-[112px]` y `h-full`.
- En cada `<section className="grid ... xl:grid-cols-2">` agregar `auto-rows-fr` para que las dos columnas igualen altura.
- En "Evolución / Sucursal / Mix": cambiar grid a `xl:grid-cols-2` (50/50) con `auto-rows-fr`, y en la columna derecha apilar Sucursal + Mix con `grid-rows-2` para que coincidan con la altura de Evolución.
- Cards internas: `h-full flex flex-col` en cada `Card` que vive dentro de un grid para que estiren.

### 3. Filtros con multi-selección

`FilterSelect` actual es single. Crear `FilterMultiSelect` reutilizable (popover + checkboxes, ya existe patrón en `TecnicosPicker`) en `src/components/filters/FilterMultiSelect.tsx`. Trigger compacto h-9 con texto "Todas" / "N seleccionadas" / nombre único.

- Cambiar estados en Dashboard:
  - `fSucursal: string` → `fSucursales: string[]`
  - `fRubro: string` → `fRubros: string[]`
  - `fEstadoTrabajo: string` → `fEstadosTrabajo: string[]`
  - `fTecnico: string` → `fTecnicos: string[]`
- Adaptar los filtros derivados (`factFiltered`, `trabajosScope`, etc.) para usar `arr.length === 0 || arr.includes(valor)`.
- Adaptar los `onSelect` de cards (ej. `setFSucursal(sucursal)` → `setFSucursales([sucursal])`) para que un click siga aplicando "solo esa".
- Contador `filtrosActivos` ajustar a arrays no vacíos.

### 4. Filtro de fecha y periodos

Objetivos: claridad de qué semana / mes / año se muestra, default 12 meses, y modo "Año" totaliza el año completo (un único valor por año, no 12 barras mensuales).

- **Default**: `periodMode` arranca en `"mes"` con ventana de 12 (no 8). Cambiar `Array.from({ length: periodMode === "mes" ? 8 : 12 }, ...)` → siempre 12 para `mes`.
- **Modo Año**: en `weeklyRows`, cuando `periodMode === "anio"` generar 5 años (actual y 4 previos), cada item con `start = startOfYear(year)`, `end = endOfYear(year)`, `label = "yyyy"`. Total = suma del año completo. Esto reemplaza las 12 barras mensuales actuales por 5 barras anuales reales.
- **Label del periodo base**: cuando `periodMode === "semana"` mostrar `"Semana base"`; en `"mes"` mostrar `"Mes base"`; en `"anio"` mostrar `"Año base"`. Ajustar el input para que en mes/año la fecha se normalice al inicio del mes/año (visualmente sigue siendo un date input, pero el helper text aclara el rango actual: `"Mostrando dd/MM/yyyy - dd/MM/yyyy"` debajo del input o en el meta del `FiltersBar`).
- **PeriodSelector**: mantener 3 botones pero renombrar a `Semana · Mes · Año` (ya están). Añadir tooltip con cantidad de periodos comparados (8 / 12 / 5).
- **`subMonths(monthStart, 11)`** ya cubre los 12 meses para queryStart; añadir `subYears(weekStart, 4)` al cálculo de `queryStart` cuando es modo año, para asegurar datos suficientes.

### Fuera de alcance

- Identidad visual (oliva, tokens, tipografía).
- Lógica de datos / queries Supabase.
- Pestaña Facturación interior y pestaña Trabajos (solo se tocan donde aparecen los filtros y montos).

### Archivos modificados

- `src/pages/Dashboard.tsx` (cambios 1–4)
- `src/components/filters/FilterMultiSelect.tsx` (nuevo, para punto 3)
