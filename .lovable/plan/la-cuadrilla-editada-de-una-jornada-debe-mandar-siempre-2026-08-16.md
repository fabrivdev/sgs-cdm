# La cuadrilla editada de una jornada debe mandar siempre

## Qué pasa hoy

Cuando editás una jornada y sacás a un técnico, el cambio sí se guarda en la jornada, pero el planificador y el dashboard vuelven a "heredar" la cuadrilla vieja del servicio padre.

El motivo: ambos lugares usan la regla "si la jornada no tiene auxiliares, uso los del servicio". Si dejás la lista de auxiliares vacía (o sacás al único auxiliar), esa lista vacía se interpreta como "sin datos" en vez de "sin auxiliares", y se rellena con la cuadrilla original del servicio. Por eso el técnico excluido sigue apareciendo al filtrar por su nombre.

Lo mismo pasa con el responsable: si la jornada no tiene principal cargado, se toma el del servicio.

## Regla nueva

Si la jornada tiene responsable propio cargado, esa jornada define su cuadrilla completa: responsable + los auxiliares que tenga (aunque sean cero). No se hereda nada del servicio.

Solo las jornadas antiguas que nunca fueron editadas (sin responsable propio) siguen heredando la cuadrilla del servicio, para no perder el histórico.

## Dónde se aplica

- Planificador: expansión de jornadas (filtro por técnico, columna responsable, export a Excel, cards móviles).
- Dashboard de trabajos: carga técnica, productividad por técnico, horas y filtros por técnico.

Ambos usan la misma lógica duplicada; se unifica en un solo helper compartido para que no se vuelvan a desincronizar.

## Detalle técnico

Nuevo helper en `src/lib/` (p. ej. `resolverCuadrillaJornada`) que recibe la jornada y el servicio padre y devuelve `{ principalId, auxiliares }`:

- si `jornada.tecnico_responsable_id` no es null → `{ principal: jornada.tecnico_responsable_id, auxiliares: jornada.auxiliares ?? [] }`
- si es null → fallback actual al servicio.

Se reemplazan los puntos que hoy hacen el merge manual: `src/pages/Planificador.tsx` (líneas ~258-259) y `jornadaCrewIds` en `src/pages/Dashboard.tsx` (~1140). Sin cambios de esquema ni migración. Se agrega un test unitario del helper con los tres casos: jornada editada con auxiliares, jornada editada sin auxiliares, jornada legado sin responsable.
