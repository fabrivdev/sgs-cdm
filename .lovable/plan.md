# Encabezados de filtros y alineación de KPIs

## Objetivo
1. Que todo filtro visible tenga su encabezado (label), sin excepciones.
2. Que en una fila de KPIs los encabezados (y los valores) queden alineados aunque algunos tengan descripción y otros no.

## Cambio 1 — Alineación de KPI cards (`src/components/layout/AppPrimitives.tsx`)
Hoy `KpiItem` usa `justify-center`: cuando un card no tiene `detail`, su contenido se centra y el label queda más abajo que el de los cards vecinos.

- `KpiItem` pasa a alinear desde arriba (`justify-start`) con estructura fija:
  - fila de label con altura fija (`h-4`),
  - valor con altura de línea fija,
  - zona de detalle siempre presente: si no hay `detail`, se renderiza un espaciador invisible con la misma altura (`h-4`) para que todos los cards midan igual.
- `KpiStrip` mantiene `min-h-[64px]`; con la zona de detalle reservada, todas las celdas quedan a la misma altura y con labels y valores en la misma línea base.

Mismo criterio para las mini-cards de KPI del dashboard (`MiniMetric` en `src/components/dashboard/DashboardPanels.tsx` y las mini-cards de estado en `DashboardCharts.tsx`): label arriba con altura fija, valor debajo, sin centrado vertical.

## Cambio 2 — Filtros sin encabezado
Auditoría de todos los usos de `FilterSelect` / `FilterMultiSelect` / `FilterDate` / `FilterCustom`. Casos detectados sin `label`:

- `src/pages/RepuestosSugerencias.tsx`: los dos `FilterSelect` (segmento y estado de datos) y el `FilterCustom` del checkbox "Solo con sugerencia" no tienen `label`.
  - Agregar `label="Segmento"`, `label="Estado de datos"` y `label="Sugerencia"`.
  - El checkbox interno usa `h-9`; se baja a `h-8` para igualar la altura del resto de los controles.
- Se revisan también Planificador, Trabajos, Calendario, Repuestos, Parque (Parque/Máquinas) y Compras/Solicitudes; se agrega label a cualquier otro campo que quede sin encabezado.
- En `FiltersBar`, el `Field` sin label ya reserva un `h-4` invisible (usado por el botón "Filtros"), así que la alineación de la fila se mantiene.

## Verificación
- Build y typecheck.
- Revisión visual de Dashboard (fila de KPIs con y sin descripción) y de Repuestos → Sugerencias con los nuevos encabezados.

## Alcance
Solo presentación: sin cambios de lógica, datos ni consultas.
