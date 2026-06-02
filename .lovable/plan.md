## Causa raíz
La matriz del Dashboard cuenta solo técnicos guardados directamente en `servicio_jornadas`. Planificador, en cambio, hereda la cuadrilla del servicio padre cuando la jornada no la define. Por eso Rubén aparece con muchas jornadas en Planificador pero casi vacío en la matriz: a esas jornadas les falta el `tecnico_responsable_id`/`auxiliares` propios y el Dashboard no aplica el fallback.

Confirmado en datos: en mayo, la consulta actual encuentra 1 jornada para Rubén; el resto vienen vía herencia del servicio.

## Cambios en `src/pages/Dashboard.tsx`

1. Helper `jornadaCrewIds(jornada)` que devuelve la cuadrilla efectiva:
   - principal = `jornada.tecnico_responsable_id` o, si es null, `servicio.tecnico_responsable_id`.
   - auxiliares = `jornada.auxiliares` si tiene items, si no `servicio.auxiliares`.
2. Aplicar ese helper en:
   - `activeTechnicianIds` (incluir también referencias desde `servicios`).
   - `productividadMatriz` (matriz Técnico × Semana/Mes).
   - `cargaTecnicos` (top de carga próxima).
   - `trabajosBase.tecnicoIds` (filtros por técnico en pestaña Trabajos).
   - `tecnicosConActividad` (KPI).
3. Mantener: Pendiente + Completado dentro del período; horas solo de Completado; Cancelada excluida.

## Fuera de alcance
Sin cambios en base de datos, Planificador, ni textos de UI extra.