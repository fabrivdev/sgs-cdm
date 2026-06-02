## 1. Filtro de fecha en Trabajos (Kanban)

**Problema actual**: el filtro "Fecha" busca una jornada programada con esa fecha exacta. Si un trabajo no tiene jornada (pendiente puro) o tiene jornadas en otros días, queda fuera; en otros casos el resultado parece "global" porque coincide con muchas jornadas.

**Cambio**: en `src/pages/Trabajos.tsx` el filtro `fFecha` pasa a filtrar por **última actividad del trabajo en esa fecha** = `max(actualizado_en, creado_en, fechas de sus jornadas)`. Operativamente: el día seleccionado debe coincidir (en fecha local) con `actualizado_en` del trabajo, su `creado_en`, o la fecha de alguna de sus jornadas (programada o realizada).

- Se mantiene el resto del filtrado (sucursal, prioridad, estado, búsqueda).
- El filtro "Semana" se elimina del Kanban (ver punto 2). Queda solo "Fecha".

## 2. Mover análisis semanal por técnico al Dashboard

**En Trabajos** (`src/pages/Trabajos.tsx`):
- Quitar el `FilterSelect` de "Semana", el estado `fSemana`, `semanasDisponibles` y su lógica asociada.

**En Dashboard** (`src/pages/Dashboard.tsx` + `CargaTecnicaTabla`):

Reemplazar la tabla actual de "Carga técnica" por una **matriz Técnico × Semana** con toggle de métrica:

```text
                Sem 22  Sem 23  Sem 24  Sem 25  Sem 26  Total
Tecnico A          5      4       6       3       5      23
Tecnico B          3      6       4       5       4      22
...
```

- **Toggle métrica** arriba de la tabla: `Servicios` (jornadas completadas) | `Horas` (suma de `servicio_jornadas.horas_trabajadas`).
- **Columnas**: una por cada semana ISO contenida en el período activo (`periodStart`–`periodEnd`). Para `periodMode = "semana"` queda 1 columna y la tabla colapsa a la vista actual; para `"mes"` ~4-5 columnas; para `"anio"` se agrupan por mes en lugar de semana para que no explote (12 columnas máx).
- **Filas**: técnicos activos referenciados en jornadas del período (misma lógica de `activeTechnicianIds` ya implementada).
- **Total** por fila y fila final de "Total" por semana.
- Click en una celda → navega a Trabajos filtrado por esa fecha/semana y técnico (reutiliza `setSection("trabajos")` y, si es viable, propaga filtros vía estado existente).

**Fuente de datos**: `servicio_jornadas` ya cargadas (`jornadasByTrabajo`). Solo cuenta jornadas con `estado = "Completado"` para que mida productividad real; jornadas pendientes no inflan el conteo.

## 3. Detalles técnicos

- Nuevo helper en Dashboard: `productividadMatriz` (useMemo) que devuelve `{ semanas: string[], rows: Array<{ id, nombre, porSemana: Record<string, {jornadas:number, horas:number}>, totales:{...} }>, totalesPorSemana }`.
- Clave de semana: `YYYY-Www` (ISO) usando `getISOWeek` + `getISOWeekYear` de date-fns. Para modo "año" usar `YYYY-MM`.
- `CargaTecnicaTabla` se renombra/refactoriza a `CargaTecnicaMatriz` con prop `metrica: "servicios" | "horas"` (estado local) y `bucketMode: "semana" | "mes"`.
- Conservar el formato compacto (filas scrollables, expandir/colapsar) ya existente.

## 4. Archivos a tocar

- `src/pages/Trabajos.tsx` — nueva lógica de filtro fecha, quitar filtro semana.
- `src/pages/Dashboard.tsx` — nuevo `useMemo` matriz + reemplazar `CargaTecnicaTabla` por `CargaTecnicaMatriz` con toggle.

## 5. Fuera de alcance

- No se modifica el modelo de datos ni RLS.
- No se agregan nuevas pestañas en Trabajos.
- No se cambia el flujo de carga de horas por el técnico (se asume que seguirán cargando `horas_trabajadas` en `servicio_jornadas`).
