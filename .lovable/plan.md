## Objetivo

Corregir la lógica conceptual de **Agenda**, **Jornada** y **Estado del Trabajo** antes de tocar UI. Una agenda futura es solo una visita prevista; la jornada es el resultado real (solo Realizada / No realizada); el estado del trabajo se deriva automáticamente.

## Modelo conceptual final

- **Agenda** (`servicio_jornadas` actual usada como "agenda"): visita planificada con una fecha. No tiene estado de resultado propio; mientras la fecha no llega, simplemente está pendiente de ejecutarse.
- **Jornada** (resultado de una agenda): solo dos resultados posibles → `Realizada` o `No realizada`.
- **Trabajo** (`trabajos.estado_general`): siempre derivado, nunca manual.

## Cambios en base de datos

### 1. Enum de resultado de jornada
Actualmente `estado_servicio` se usa para marcar agendas/jornadas con `Pendiente` / `Completado` / `Cancelada`. Reinterpretarlo así:
- `Pendiente` = agenda aún sin resultado cargado (independiente de si la fecha pasó o no).
- `Completado` → renombrar conceptualmente a **Realizada** (mantener valor enum por compatibilidad, mapearlo en UI).
- `Cancelada` → renombrar conceptualmente a **No realizada**.

No se introducen estados nuevos (incompleta, en curso, pausa, bloqueado quedan fuera, como ya estaba).

### 2. Reescribir `recalcular_estado_trabajo(p_trabajo_id)`

Nueva lógica (sobre `servicio_jornadas` del `legacy_servicio_id` del trabajo):

```text
hoy            := CURRENT_DATE
realizadas     := count(estado = 'Completado')              -- jornadas Realizadas
no_realizadas  := count(estado = 'Cancelada')               -- jornadas No realizadas
agenda_futura  := count(estado = 'Pendiente' AND fecha >= hoy)
agenda_vencida := count(estado = 'Pendiente' AND fecha <  hoy)  -- pendiente de cierre

SI realizadas = 0 Y agenda_futura = 0 Y agenda_vencida = 0  → 'pendiente'
SI realizadas = 0 Y agenda_futura > 0                       → 'programado'
SI realizadas = 0 Y agenda_vencida > 0                      → 'programado'   -- pendiente de cierre, no completado
SI realizadas > 0 Y (agenda_futura > 0 OR agenda_vencida > 0) → 'iniciado'
SI realizadas > 0 Y agenda_futura = 0 Y agenda_vencida = 0  → 'completado'
```

Notas clave:
- Una agenda pasada sin jornada cargada **nunca** mueve a `completado` ni a `iniciado`. Cuenta como pendiente de cierre y mantiene el trabajo en `programado` (o `iniciado` si ya había realizadas previas).
- Jornadas `No realizada` (Cancelada) **no cuentan como avance**: si solo hay no_realizadas y no hay agenda futura ni vencida pendiente, el trabajo vuelve a `pendiente`. Si hay no_realizadas + agenda futura → `programado`.
- Resultado idéntico al set de ejemplos del usuario.

### 3. Triggers
Los triggers existentes (`trg_recalc_trabajo_from_servicio_jornada`, `trg_recalc_trabajo_on_link`) ya disparan recálculo en INSERT/UPDATE/DELETE de `servicio_jornadas` y en cambios de `legacy_servicio_id`. Se mantienen.

**Agregar**: job/recalculo diario opcional (fuera de alcance ahora). El recálculo se hace en cada mutación, suficiente para la operativa.

### 4. Backfill
Recalcular `estado_general` de **todos** los trabajos existentes con la nueva fórmula una vez aplicada la función.

## Cambios en frontend (terminología, sin rediseño)

Solo renombres de etiquetas y opciones — sin tocar layouts. Se hace en este mismo paso para que la UI no contradiga la lógica nueva.

- `src/lib/constants.ts` → `ESTADOS` actual `["Pendiente","Completado","Cancelada"]` se conserva como valores DB, pero se agregan labels:
  - `Pendiente` → "Pendiente"
  - `Completado` → "Realizada"
  - `Cancelada` → "No realizada"
- `src/components/StatusBadges.tsx` (`EstadoBadge`) → usar los nuevos labels.
- `src/lib/trabajos.ts` (`ESTADOS_JORNADA`, `estadoJornadaLabel`) → solo dos resultados `Realizada` / `No realizada` (mapeados a `completada` / `incompleta` legacy si aplica en `jornadas` aparte, o ignorado si esa tabla quedó muerta).
- Diálogo `CargarJornadaDialog.tsx` y `ServicioDetalleDialog.tsx` → botones "Marcar como Realizada" / "Marcar como No realizada" (en vez de Completada / Cancelada).
- Kanban `Trabajos.tsx`, `Calendario.tsx`, `Planificador.tsx` → contar `futurosActivos` con la nueva semántica (`fecha >= hoy` y `estado='Pendiente'`); las vencidas sin cierre se muestran como "pendiente de cierre" en lugar de futuras.

No se tocan: layouts, filtros, columnas, diseño visual.

## Fuera de alcance

- Rediseño de modales o vistas.
- Renombrar enums en DB (`Completado`/`Cancelada` siguen siendo los valores físicos; cambia solo la lectura).
- Nuevos estados de trabajo: se mantienen `pendiente`, `programado`, `iniciado`, `completado`.

## Detalles técnicos

Archivos a modificar:
- **Migración SQL**: `recalcular_estado_trabajo` (reemplazar función) + UPDATE de backfill iterando `trabajos`.
- `src/lib/constants.ts`, `src/lib/trabajos.ts`
- `src/components/StatusBadges.tsx`
- `src/components/ServicioDetalleDialog.tsx`
- `src/components/trabajos/CargarJornadaDialog.tsx`
- `src/pages/Trabajos.tsx`, `src/pages/Calendario.tsx`, `src/pages/Planificador.tsx` (solo cálculo de "futurosActivos" + labels)

Aprobación: la migración SQL se ejecuta primero, luego los renombres de UI.