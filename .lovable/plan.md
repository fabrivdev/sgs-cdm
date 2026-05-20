## Objetivo

Simplificar el módulo de Trabajos eliminando lógica duplicada. El "trabajo madre" pasa a ser solo un caso pendiente (sin responsable, sin fecha objetivo, sin auxiliares). Toda la programación operativa vive en el Planificador/Calendario.

## Cambios funcionales

### 1. Nuevo Trabajo (modal simplificado)
Campos: **Cliente, Máquina (opcional), Sucursal, Marca, Tipo, Descripción/Problema, Prioridad**.
Eliminar del formulario: responsable principal, fecha objetivo / fecha compromiso, próxima acción.
Estado inicial siempre `pendiente`.

### 2. Kanban de Trabajos (vista macro)
- Solo lectura del estado general + filtros.
- Quitar botón "Programar intervención" del detalle del trabajo (o mantenerlo redirigiendo al Planificador).
- El detalle muestra: datos del caso, agendas (solo info), jornadas (solo info), historial.
- Quitar tab/acciones que dupliquen lo del planificador.
- Quitar campos de responsable/fecha objetivo del header del trabajo.

### 3. Planificador / Calendario = único punto de programación
- "Programar intervención" se ejecuta desde acá, vinculado a un trabajo existente (selector de trabajo) o creando un trabajo nuevo en línea.
- Al programar: se crea una `agenda` (renombre conceptual de `programaciones`) con `fecha` + `tecnico_principal_id` + `auxiliares`. Sin estado propio.

### 4. Reglas automáticas de estado del trabajo (trigger en DB)
- Sin agendas futuras y sin jornadas → `pendiente`.
- Con ≥1 agenda futura y sin jornadas iniciadas/incompletas → `programado`.
- Con ≥1 jornada `completada` y aún quedan agendas futuras o jornadas pendientes → `iniciado`.
- Con jornada `incompleta` activa → `en_pausa`.
- Sin agendas futuras y todas las jornadas vinculadas marcadas como `completada` + flag manual de cierre → `completado`.
- Eliminar última agenda + sin jornadas → vuelve a `pendiente`.

### 5. Agendas (programaciones) sin estado propio
- Quitar el enum `estado_programacion` del uso operativo (dejarlo en DB por compatibilidad, ignorado).
- Una agenda con jornada vinculada se considera "usada" — el planificador la oculta de "pendientes del día".
- Sin reprogramaciones encadenadas. Para mover una fecha: se borra la agenda y se crea una nueva.

### 6. Jornadas
- Una jornada se vincula opcionalmente a una agenda (`programacion_id`).
- Solo dos estados útiles: `completada` (jornada del día cerrada, aunque el caso continúe) e `incompleta` (técnico no pudo cerrar su día).
- Sin auxiliares en el trabajo madre: los técnicos que trabajaron se derivan únicamente de `jornadas.tecnico_id`.

## Implementación técnica

### Migración SQL
1. Trigger `recalcular_estado_trabajo()` que se dispara en INSERT/UPDATE/DELETE de `programaciones` y `jornadas`, recalcula `trabajos.estado_general` según las reglas.
2. Quitar `NOT NULL` / dejar opcionales `responsable_principal_id`, `fecha_compromiso`, `proxima_accion` en `trabajos` (ya son opcionales, solo dejar de usarlos desde la UI).
3. Dejar de escribir `auxiliares` en el trabajo madre.

### Frontend
- `NuevoTrabajoDialog.tsx`: eliminar campos responsable, fecha objetivo y observación interna.
- `TrabajoDetalleDialog.tsx`: simplificar a vista informativa. Quitar acciones de cambio manual de estado (lo hace el trigger). Mostrar agendas y jornadas en modo lectura. Quitar botón "Programar intervención" desde acá.
- `Planificador.tsx`: agregar botón "Programar intervención" que abre `ProgramarIntervencionDialog` con selector de trabajo pendiente (o crear nuevo trabajo inline).
- `Calendario.tsx`: igual, acción primaria "Programar intervención".
- `ProgramarIntervencionDialog.tsx`: agregar selector de trabajo; quitar lógica de `reemplaza_a`, motivo reprogramación, horas estimadas y acción programada (queda mínimo: fecha + técnico + auxiliares + observación opcional). Quitar sync legacy duplicado.
- `CargarJornadaDialog.tsx`: dejar solo estados `completada` / `incompleta`. Vincular siempre a una agenda si hay una abierta del día.
- `Trabajos.tsx` (Kanban): quitar acciones operativas, dejar como vista macro con filtros.

### Sin cambios de auth/roles ni de estructura mayor de tablas.

## Fuera de alcance
- Migración de datos viejos: los trabajos existentes ya creados con responsable/fecha objetivo se respetan, pero la UI ya no los expone como editables.
- Dashboard: no se toca en esta iteración.
