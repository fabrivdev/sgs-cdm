## Problema

`cargaSucursal` (Dashboard, ~línea 617) se calcula sobre `trabajosBase` → `trabajosScope`, que solo filtra por sucursal/búsqueda. Nunca aplica el período (Semana/Mes/Año), por lo que muestra todos los trabajos históricos sin importar si se eligió "Semana de junio" o "Mayo".

## Cambio

En `src/pages/Dashboard.tsx`, dentro del `useMemo` de `cargaSucursal`, filtrar `trabajosBase` por **actividad dentro de `[periodStart, periodEnd]`** antes de contar. Un trabajo cuenta en el período si cumple cualquiera de:

- `creado_en` cae en el rango, o
- `actualizado_en` cae en el rango, o
- alguna jornada del trabajo (`jornadasByTrabajo`) tiene `fecha` en el rango.

Misma definición de "actividad" que ya usa el filtro Fecha del Kanban en Trabajos, para mantener consistencia.

Cálculo de cada fila por sucursal usando solo ese subconjunto:
- `cerrados` = `estado === "completado"`
- `pausados` = `estado === "pausado"`
- `abiertos` = `total − cerrados − pausados` (incluye pendiente/programado/iniciado)
- `pct` sobre el total del período (no global).

## Detalles técnicos

- Acceder a `trabajo.creado_en`, `trabajo.actualizado_en` desde el objeto `Trabajo` original (no está en `trabajosBase`); por eso se enriquece dentro del `useMemo`: lookup por `id` en `trabajos` o agregar esos campos al map de `trabajosBase`. Más simple: agregar `creadoEn` y `actualizadoEn` al objeto que arma `trabajosBase` (línea ~547) y reusarlos.
- Helper local `enPeriodo(trabajo)` que evalúa las tres condiciones con `inRange` (ya existente) usando `toLocalDate`/`parseISO` para timestamps.
- Dependencias del `useMemo`: `[trabajosBase, periodStart, periodEnd, jornadasByTrabajo]`.

## Fuera de alcance

- No se toca "Facturación por sucursal" (esa ya filtra por período vía `selectedFacts`).
- No se cambia la lógica de período ni los filtros superiores.
- No se modifica la matriz Técnico×Semana.
