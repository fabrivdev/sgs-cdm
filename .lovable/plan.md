Todos los cambios viven en `src/pages/Dashboard.tsx`. No se toca lógica de filtros ni cálculos existentes — sólo presentación y dos nuevos derivados muy livianos.

## 1. Rediseño de la fila de KPI cards superiores

Reemplazar las 5 `SummaryCard` actuales por una versión enriquecida acorde a la imagen. Misma grilla (`md:grid-cols-2 xl:grid-cols-5`), misma altura. La card actual se mantiene como base, pero se introduce una variante que permite renderizar contenido extra (mini-barras, segundo renglón, badge de variación).

Cards a renderizar (en orden):

1. **Facturación del período** — valor `money(total)`, tono `bad` cuando `variacion < -20` (igual que hoy). Debajo:
   - Línea pequeña con `variacion%` en rojo/verde vs período anterior (ej. `-39% vs período anterior`).
   - Segunda línea: `{facturas} facturas · {clientes} clientes`.
2. **Clientes atendidos** — valor = `clientesAtendidosSemana`. Detalle:
   - `facturas/clientes` redondeado a 1 decimal → `"3,3 facturas por cliente"`.
   - Texto secundario: `"Top 5 concentran {pctTop5}%"` usando el cálculo ya disponible (`pctTop5`, ya existe en línea 2108).
3. **Ticket promedio** (nueva métrica): `total / facturas`. Tono `bad` si bajó >10% vs período anterior (usar `previousWeekRow` ya disponible). Detalle: `"-12% vs período anterior"` + `"Promedio por factura"`.
4. **Tipo de facturación** — muestra el % dominante (ej. `Cliente 82%`) como valor, debajo línea `"Garantía 12% · Interno 6%"` y una mini stacked bar horizontal (3 segmentos: Cliente / Garantía / Interno) usando los rubros ya calculados en `currentWeekRow`/`factFiltered`. Reusar colores semánticos (`bg-primary`, `bg-blue-500`, `bg-amber-500`).
5. **Flujo operativo** — valor = `trabajosActivos.length + trabajosCulminados` (total gestionados en el período). Subtítulo `"trabajos gestionados"`. Detalle inferior: `"{culminados} Culminados · {abiertos} Abiertos · {pausados} Pausados"` (usar `flujo` ya calculado).

Reemplaza la card actual "Sucursales con movimiento" y "Servicios / Repuestos" — esa información ya está representada abajo (en Facturación por sucursal y en MixRubros respectivamente), evitamos duplicarla. La info de sucursales pasa al bloque del punto 3.

Se agrega una pequeña variante a `SummaryCard` (o un nuevo `SummaryCardRich`) que acepta `children` para inyectar la stacked bar o el segundo bloque sin romper a las cards más simples.

## 2. Selector de rango en el gráfico de evolución

En el `Card` "Evolución de facturación" agregar un dropdown a la derecha del título (al lado del ícono) tipo `Select` shadcn con opciones:

- `6 meses`
- `12 meses` (default)
- `24 meses`
- `Todo`

Estado local `rangoEvolucion` en el componente `Dashboard` (no afecta filtros globales). Antes de pasar `rows` a `WeeklyBars`, se hace `weeklyRows.slice(-N)` según la selección. `PanelTitle` se ajusta para aceptar un slot `actions` a la derecha (o se reemplaza por un header inline en ese Card concreto).

## 3. Mini-cards debajo de "Facturación por sucursal"

Dentro del mismo `Card` de "Facturación por sucursal", debajo del listado `SucursalBars`, agregar una grilla `grid-cols-2 gap-2` con dos mini-cards (borde sutil, mismo estilo visual que el mock):

- **Sucursales con movimiento**: `{n}/{total}` + texto `"sucursales con movimiento"`. Usa `sucursalesConMovimiento` y `SUCURSALES.length` (ya existentes).
- **Top concentración**: `"Top {k}"` (k = 2 por defecto) + `"concentran {pct}% del total"`. Calcular ordenando `factBySucursal` desc y sumando los primeros 2; dividir por `currentWeekRow?.total`.

Cada mini-card lleva un ícono a la izquierda (`Building2`, `BarChart3`) en un cuadrito `bg-primary/10 text-primary` igual al resto del dashboard.

## Detalles técnicos

- Colores: usar tokens existentes (`text-destructive`, `text-emerald-600` para la variación; `bg-primary`, `bg-blue-500`, `bg-amber-500` para la stacked bar de tipo facturación — ya hay precedentes en `EstadoBars`).
- Tipografía/tamaños: mantener `text-2xl font-bold tabular-nums` del valor para no romper el ritmo. La stacked bar es `h-2 rounded-full overflow-hidden`.
- `ticketPromedio` y su variación se calculan dentro de un `useMemo` chico en el componente principal, junto a los KPIs existentes.
- Para "Tipo de facturación" usar `factFiltered` agrupado por `tipo_facturacion` (Cliente / Garantía / Interno). Ya existe la fuente: campo `tipo_facturacion` en la query de línea 321.
- Sin cambios de schema, ni de hooks de datos, ni de filtros.

## Fuera de alcance

- No se mueven pestañas (Vista general / Facturación / Trabajos) ni se cambia su contenido interno.
- No se modifica el comportamiento de filtros (técnico / estado / marca) — eso ya fue corregido en iteraciones previas.
- No se introduce dependencia nueva.
