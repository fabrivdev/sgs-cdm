
# Rediseño UI/UX módulo Trabajos

## 1. Nuevo componente base: `ResponsiveDrawer`

Crear `src/components/ui/responsive-drawer.tsx` que envuelva:
- Desktop (`md+`): `Sheet` de shadcn con `side="right"`, ancho `w-full sm:max-w-xl lg:max-w-2xl`.
- Mobile: el mismo `Sheet` con `side="bottom"` y altura `h-[92vh] rounded-t-2xl`.
- Estructura interna fija: `Header` sticky · `Body` scrolleable · `Footer` sticky con acciones.
- Botón de cerrar siempre visible.
- Permite seguir viendo el Kanban detrás (overlay translúcido, no bloqueante visual).

Este componente reemplaza a `Dialog` en todos los flujos de Trabajos.

## 2. Reemplazo del detalle del trabajo

Reescribir `TrabajoDetalleDialog.tsx` → `TrabajoDetalleDrawer.tsx`. Sin tabs. Vista única scrolleable con estas secciones en orden:

### 2.1 Header fijo
- Código `TR-000048` en mono.
- Cliente · Marca · Sucursal (chips).
- Badges: Prioridad + Estado del trabajo.
- Línea de microcopy según estado:
  - pendiente: "Aún no tiene fechas programadas."
  - programado: "Tiene fechas previstas, todavía sin jornadas."
  - iniciado: "El trabajo está activo y puede recibir nuevas jornadas."
  - completado: "Todas las fechas tienen jornada y no quedan pendientes."

### 2.2 Tarjeta destacada "Próxima acción"
Lógica derivada en cliente desde `programaciones` + `jornadas`:

```text
pendientes  = programaciones cuya fecha no tiene jornada asociada
futuras     = pendientes con fecha >= hoy
vencidas    = pendientes con fecha <  hoy
```

Estados de la tarjeta:
- Sin programaciones → "Programá la primera fecha" · CTA *Programar fecha*.
- `futuras > 0` → "Próxima visita: {fecha} con {técnico}" · CTA *Cargar jornada de esa fecha* (si ya pasó) o *Reprogramar*.
- `vencidas > 0` → "Hay {n} fecha(s) sin jornada cargada" · CTA *Cargar jornada*.
- `pendientes == 0 && jornadas > 0` → caso TR-000048: "No hay fechas pendientes para continuar. Las {n} fechas ya tienen jornada. Si el trabajo debe seguir otro día, programá una nueva fecha." · CTA principal *Programar nueva fecha*, secundaria *Ver jornadas*.
- estado `completado` → "Trabajo cerrado" · CTA *Reabrir* (si corresponde).

### 2.3 Resumen operativo
Reemplaza al tab "Resumen". Grid 2 columnas en desktop:
- Problema reportado, Tipo, Estado actual.
- Fechas programadas, Fechas pendientes, Jornadas cargadas, Horas acumuladas, Última actividad.
- Párrafo interpretativo derivado de la misma lógica de "Próxima acción".

### 2.4 Fechas y jornadas (unificadas)
Una sola lista cronológica descendente. Cada item es un `card` que combina programación + jornada (si existe), evitando duplicados:

- Fecha grande + día de semana.
- Técnico principal + auxiliares.
- Badge de estado de fila:
  - `Fecha pendiente` (futura sin jornada)
  - `Pendiente de cargar jornada` (vencida sin jornada)
  - `Jornada incompleta`
  - `Jornada completada`
  - `Fecha reprogramada`
  - `Fecha cancelada`
- Acciones según estado:
  - Pendiente: *Cargar jornada* · *Reprogramar* · *Cancelar fecha*.
  - Con jornada: *Ver detalle* · *Editar jornada*.
- Si la jornada tiene observaciones / horas, mostrarlas inline.

Botón al pie de la sección: *+ Programar nueva fecha*.

### 2.5 Historial humanizado
Helper nuevo `src/lib/historial.ts` con `formatEvento(evento)` que mapea `tipo_evento` + `payload` a texto natural:

| tipo_evento | Texto |
|---|---|
| `trabajo_creado` | "Se creó el trabajo." |
| `cambio_estado` | "El trabajo cambió de {de} a {a}." |
| `programacion_creada` | "Se programó una nueva fecha para {fecha} con {tecnico}." |
| `programacion_actualizada` | "Se modificó la programación del {fecha}." |
| `programacion_eliminada` | "Se eliminó la programación del {fecha}." |
| `jornada_creada` | "Se cargó una jornada del {fecha} ({estado})." |
| `jornada_actualizada` | "Se actualizó una jornada: pasó de {de} a {a}." |
| `jornada_eliminada` | "Se eliminó una jornada del {fecha}." |

Cada item: timestamp formato `es-PY` + texto humano + collapsible "Ver detalle técnico" con el JSON.

### 2.6 Footer fijo con acciones contextuales
Mapeo por estado del trabajo:

- `pendiente`: *Programar fecha* (primaria) · *Editar* · overflow: *Eliminar*.
- `programado`: *Cargar jornada* (si hay fecha vencida o de hoy) o *Reprogramar* (si todo futuro) · *Programar otra fecha* · overflow: *Editar / Cancelar trabajo*.
- `iniciado`:
  - si hay pendientes: *Cargar jornada* primaria, *Programar otra fecha* secundaria.
  - si no hay pendientes: *Programar nueva fecha* primaria, *Ver jornadas* secundaria.
  - overflow: *Pausar / Completar (solo si no quedan pendientes) / Editar*.
- `completado`: *Ver resumen* · *Reabrir*.

"Completar trabajo" nunca aparece si quedan fechas pendientes.

## 3. Formularios migrados al patrón drawer

Todos pasan a usar `ResponsiveDrawer` (header sticky · body scroll · footer con Cancelar + acción primaria):

- `NuevoTrabajoDialog` → `NuevoTrabajoDrawer` (sirve también para Editar).
- `ProgramarIntervencionDialog` → `ProgramarFechaDrawer` con subtítulo `TR-XXXX · Cliente`, campos: Fecha, Técnico principal (TecnicosPicker), Auxiliar, Acción prevista, Observaciones.
- `CargarJornadaDialog` → `CargarJornadaDrawer` con campos: Fecha, Técnico, Horas reales, Trabajo realizado, Observaciones, Estado (Incompleta / Completada). Tras guardar, dispara `recalcular_estado_trabajo` y refresca el detalle.
- Nuevos micro-drawers: *Reprogramar fecha*, *Cancelar fecha*, *Pausar trabajo*, *Completar trabajo* (con confirmación + validación de pendientes), *Eliminar trabajo*.

Cuando un sub-drawer se abre desde el detalle, se apila encima sin cerrar el de fondo (mobile: el bottom sheet superior cubre el otro).

## 4. Integración en el resto del módulo
- `Trabajos.tsx` (Kanban): al clickear card abrir el nuevo `TrabajoDetalleDrawer` en lugar del dialog.
- `Planificador.tsx` y `Calendario.tsx`: usar el mismo drawer al abrir un trabajo.
- Mantener búsqueda por `TR-XXXX`, estados y lógica de `recalcular_estado_trabajo` actuales — sin cambios de backend.

## 5. Diseño visual
- Tokens semánticos existentes (`bg-card`, `bg-muted`, `border`, `text-muted-foreground`).
- Badges con colores derivados del estado (reutilizar `StatusBadges`).
- Cards de fechas con borde izquierdo de color según estado para escaneo rápido.
- Sin tabs en el detalle; sí secciones colapsables para "Historial" y "Resumen operativo" en mobile.

## Detalles técnicos

Archivos nuevos:
- `src/components/ui/responsive-drawer.tsx`
- `src/components/trabajos/TrabajoDetalleDrawer.tsx`
- `src/components/trabajos/ProximaAccionCard.tsx`
- `src/components/trabajos/FechasJornadasList.tsx`
- `src/components/trabajos/HistorialList.tsx`
- `src/components/trabajos/drawers/ProgramarFechaDrawer.tsx`
- `src/components/trabajos/drawers/CargarJornadaDrawer.tsx`
- `src/components/trabajos/drawers/ReprogramarFechaDrawer.tsx`
- `src/lib/historial.ts` (formateo humano)
- `src/lib/trabajo-derivado.ts` (cálculo de pendientes/futuras/vencidas y "próxima acción")

Archivos editados:
- `Trabajos.tsx`, `Planificador.tsx`, `Calendario.tsx`: cambiar uso del dialog por drawer.
- `NuevoTrabajoDialog.tsx`, `ProgramarIntervencionDialog.tsx`, `CargarJornadaDialog.tsx`: portar contenido al nuevo wrapper o reemplazar.
- `ServicioDetalleDialog.tsx`: alinear estilo al nuevo patrón.

Sin migraciones de base de datos. La lógica de estados/triggers ya implementada se conserva.
