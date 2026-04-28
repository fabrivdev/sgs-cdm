# Servicios continuables en varias fechas

Hoy cada servicio vive en una sola `fecha_programada`. Vamos a permitir que un mismo servicio aparezca en varias fechas (ej: empezó el lunes, sigue el martes) sin duplicar el trabajo, registrando las horas trabajadas por cada jornada.

## Qué cambia para el usuario

- En el **detalle del servicio**, nuevo botón **"Continuar en otra fecha"** que abre un mini calendario para elegir el próximo día. El servicio queda visible también en esa fecha en el Planificador y Calendario.
- Nueva sección **"Jornadas"** en el detalle: lista de fechas donde aparece el servicio, con horas trabajadas y estado por cada una. Se pueden agregar y quitar fechas.
- Las **horas trabajadas se cargan por jornada** (no más un único campo total). El detalle muestra el total acumulado.
- En el Planificador / Calendario, un servicio multi-fecha muestra un pequeño indicador (ícono de cadena 🔗 o badge "día 2 de 3") para que se vea que es continuación.

## Cambios técnicos

### Base de datos

Nueva tabla `servicio_jornadas` (una fila por (servicio, fecha)):

```
- id uuid PK
- servicio_id uuid (referencia lógica a servicios.id, ON DELETE CASCADE vía trigger)
- fecha date NOT NULL
- horas_trabajadas numeric NULL
- estado estado_servicio NOT NULL DEFAULT 'Pendiente'
- observaciones text NULL
- creado_en, actualizado_en timestamptz
- UNIQUE (servicio_id, fecha)
```

RLS heredando de `servicios`: SELECT/UPDATE si el usuario puede ver/editar el servicio padre (admin, cabecilla de la misma sucursal, responsable o auxiliar). DELETE/INSERT para admin y cabecilla.

**Migración de datos**: para cada servicio existente, crear una jornada inicial con su `fecha_programada`, `estado`, `horas_trabajadas` y `observaciones` actuales. La columna `fecha_programada` queda como "fecha inicial" (no se borra para no romper nada).

### Lectura en el Planificador / Calendario / Historial

Las consultas que hoy filtran por `servicios.fecha_programada` pasan a hacer un JOIN/`in` contra `servicio_jornadas`:

- Planificador: `select ... from servicio_jornadas join servicios ...` filtrando por rango de fechas en `servicio_jornadas.fecha`. Cada jornada se renderiza como un slot, con el mismo servicio detrás.
- Calendario: idem, una entrada por jornada.
- Métricas (% completados, etc.): se calculan sobre jornadas, no sobre servicios.

### UI

- **`ServicioDetalleDialog.tsx`**:
  - Nuevo bloque "Jornadas" arriba de Estado/Horas/Observaciones, listando las jornadas del servicio con sus campos editables inline.
  - Botón "+ Continuar en otra fecha" → abre Popover con `<Calendar>` (shadcn) y crea una nueva fila en `servicio_jornadas`.
  - Quitar los inputs sueltos de `estado` / `horas` / `observaciones` del servicio: ahora viven dentro de cada jornada. El `Servicio` mantiene `trabajo_descripcion`, cliente, técnicos, marca, tipo y sucursal (datos del trabajo, no de la jornada).

- **`ServicioFormDialog.tsx`** (crear nuevo): al guardar un servicio nuevo, también insertar la jornada inicial con `fecha = fecha_programada`.

- **Planificador / Calendario**: indicador visual cuando una jornada pertenece a un servicio con varias jornadas (badge "día N/M").

### Limpieza

- El campo `servicios.estado`, `servicios.horas_trabajadas` y `servicios.observaciones` quedan como "snapshot" del último estado por compatibilidad pero ya no se editan directamente. Opcionalmente, en una iteración futura se pueden eliminar.

## Riesgos y consideraciones

- **Historial / reportes existentes**: cualquier query que cuente "servicios completados" debe cambiar a "jornadas completadas" o decidir explícitamente qué cuenta. Voy a revisar `Historial.tsx`, `Dashboard.tsx` y `ParqueTab.tsx` para adaptar.
- **Permisos**: si un técnico es responsable solo de la jornada del día siguiente (no de la original), igual debe poder verla. La RLS por servicio padre cubre este caso.
- **Eliminar una jornada** ≠ eliminar el servicio. Si se borra la última jornada, se mantiene el servicio (queda "sin programar") o se borra el servicio entero — voy con la primera opción para evitar pérdidas accidentales.

## Archivos a tocar

- `supabase/migrations/...` (nueva tabla + RLS + backfill)
- `src/components/ServicioDetalleDialog.tsx` (sección Jornadas + botón continuar)
- `src/components/ServicioFormDialog.tsx` (crear jornada inicial al insertar)
- `src/pages/Planificador.tsx` (consulta y render por jornada)
- `src/pages/Calendario.tsx` (idem)
- `src/pages/Historial.tsx` (consulta basada en jornadas)
- `src/pages/Dashboard.tsx` (métricas basadas en jornadas)
- `src/components/parque/ParqueTab.tsx` (si usa fechas de servicios para "último servicio")
