# Rediseño funcional: Trabajos → Programaciones → Jornadas

Este es un cambio grande que toca base de datos, modelo de dominio, UI principal (modal, calendario, dashboard) y agrega una vista nueva (Kanban). Lo dividimos en fases para poder validar y desplegar sin romper lo que ya funciona.

## Modelo de datos propuesto

```text
trabajos (caso madre)
  ├── programaciones (1..N)   → alimentan el calendario
  └── jornadas       (1..N)   → registros reales de ejecución
trabajo_historial (auditoría de cambios)
```

### Tabla `trabajos`
Campos: `cliente_id`, `maquina_id` (parque), `marca`, `sucursal`, `tipo_trabajo` (visita/taller), `descripcion_problema`, `prioridad` (baja/media/alta/urgente), `estado_general` (enum kanban), `fecha_creacion`, `fecha_compromiso`, `responsable_principal_id`, `motivo_bloqueo`, `proxima_accion`, `creado_por`, `cerrado_por`, `cerrado_en`.

Enum `estado_trabajo`: `nuevo`, `pendiente_diagnostico`, `pendiente_programar`, `programado`, `en_ejecucion`, `bloqueado`, `terminado_pendiente_validar`, `cerrado`.

### Tabla `programaciones`
Campos: `trabajo_id`, `fecha_programada`, `tecnico_principal_id`, `auxiliares uuid[]`, `accion_programada`, `horas_estimadas`, `estado` (programada/cumplida/reprogramada/cancelada), `motivo_reprogramacion`, `observacion`, `reemplaza_a` (FK a otra programación), `creado_por`.

### Tabla `jornadas` (reemplaza `servicio_jornadas`)
Campos: `trabajo_id`, `programacion_id` (opcional), `tecnico_id`, `fecha_real`, `hora_inicio`, `hora_fin`, `horas_reales` (generada), `actividad_realizada`, `resultado`, `estado_jornada` (en_curso/completada/incompleta), `observaciones`, `evidencia_urls text[]`, `creado_por`.

### Tabla `trabajo_historial`
`trabajo_id`, `tipo_evento` (cambio_estado/cambio_tecnico/reprogramacion/jornada/observacion), `payload jsonb`, `usuario_id`, `creado_en`. Llenada por triggers.

### Migración desde `servicios`
- Cada `servicios` actual → 1 `trabajo` + 1 `programacion` inicial.
- Cada `servicio_jornadas` actual → 1 `jornada` ligada al trabajo.
- Conservamos `servicios` como vista compatible mientras migramos pantallas, o lo dejamos en deprecación hasta que las pantallas viejas se reemplacen.

## Reglas clave (forzadas en BD + UI)

- Editar un trabajo **nunca** pisa técnico de una programación/jornada previa.
- Reprogramar = nueva fila en `programaciones`, la anterior pasa a `reprogramada` con `motivo_reprogramacion`.
- Horas reales del trabajo = `SUM(jornadas.horas_reales)`, calculado en una vista, nunca en el trabajo.
- Cierre solo si `estado_general = terminado_pendiente_validar` y el usuario tiene rol admin/cabecilla.
- Trigger de historial en `trabajos`, `programaciones`, `jornadas`.

## Cambios de UI

1. **Modal "Nuevo trabajo"** (reemplaza "Nuevo servicio"). Captura el caso madre + opcionalmente una primera programación.
2. **Detalle del trabajo**: pestañas `Resumen`, `Programaciones`, `Jornadas`, `Historial`. Botones `Programar intervención` y `Cargar jornada`.
3. **Calendario**: pasa a leer de `programaciones` (no de `servicios`). Cada celda muestra programaciones activas; click abre el trabajo en la pestaña correspondiente.
4. **Kanban nuevo `/trabajos`** con las 8 columnas pedidas. Drag-and-drop entre columnas dispara cambio de `estado_general` + historial. Filtros por sucursal/responsable/prioridad/cliente.
5. **Planificador**: sigue funcionando pero sobre `programaciones` (mantiene el toggle día/semana que ya hicimos).
6. **Dashboard nuevo**: trabajos abiertos, cerrados, sin programación, bloqueados, % cumplimiento de programaciones (cumplidas/total), reprogramaciones del período, horas reales por técnico, trabajos vencidos (`fecha_compromiso < hoy` y no cerrados).

## Fases sugeridas

**Fase 1 – Base de datos y dominio**
- Crear enums, tablas `trabajos`, `programaciones`, `jornadas`, `trabajo_historial`.
- RLS replicando reglas actuales (admin global, cabecilla por sucursal, técnico si está asignado).
- Triggers de historial y de validación de cierre.
- Script de migración de `servicios` + `servicio_jornadas` a las nuevas tablas.

**Fase 2 – Kanban + Modal nuevo**
- Página `/trabajos` con Kanban.
- Modal "Nuevo trabajo" + detalle con pestañas.
- Acciones `Programar intervención` y `Cargar jornada`.

**Fase 3 – Migrar Calendario y Planificador**
- Apuntar lecturas a `programaciones`.
- Mantener compatibilidad con la UI actual.

**Fase 4 – Dashboard rediseñado**
- Nuevas métricas, gráficos de cumplimiento y horas por técnico.

**Fase 5 – Limpieza**
- Deprecar `servicios` y `servicio_jornadas` cuando todas las pantallas usen el modelo nuevo.

## Notas técnicas

- Roles existentes (`admin`, `cabecilla`, `tecnico`) y `get_user_sucursal` ya sirven para las RLS nuevas.
- El historial lo manejamos con un trigger `AFTER INSERT/UPDATE` que inserta en `trabajo_historial` el diff relevante (jsonb).
- Para el Kanban usamos `@dnd-kit/core` (ya común en proyectos similares; si no está, lo agregamos).
- Las jornadas se siguen pudiendo crear desde el detalle aunque no haya programación (por si un técnico arranca sin planificación previa); en ese caso `programacion_id` queda null y se sugiere crear una programación retroactiva.

## Preguntas antes de arrancar

1. **¿Migramos los datos actuales** (`servicios` + `servicio_jornadas`) al nuevo modelo, o arrancás de cero con el modelo nuevo y dejamos lo viejo solo lectura?
2. **Cierre validado**: ¿quién puede validar el cierre? ¿Solo `admin`, o también `cabecilla` de la sucursal del trabajo?
3. **Evidencia en jornadas** (fotos/archivos): ¿lo dejamos para una fase posterior o lo incluimos ya en Fase 1 con storage bucket?
4. **Arrancamos por Fase 1** (base de datos + migración) y revisamos antes de seguir, ¿de acuerdo?
