## Objetivo

Unificar la experiencia drawer en todo el sistema y eliminar redundancias en el detalle del trabajo.

## 1. Migrar `ServicioDetalleDialog` al patrón drawer

Hoy `Planificador.tsx`, `Calendario.tsx` e `Historial.tsx` siguen abriendo `ServicioDetalleDialog`, que es el modal centrado viejo. La forma más limpia y de menor riesgo es:

- Reescribir `src/components/ServicioDetalleDialog.tsx` por dentro para usar `ResponsiveDrawer` (header sticky, body scrolleable, footer con acciones) — mismo nombre, misma API (`open`, `onOpenChange`, `servicioId`, callbacks), para no tocar los 3 lugares que lo consumen.
- Reorganizar su contenido siguiendo el mismo lenguaje visual que `TrabajoDetalleDrawer`:
  - Header: código `TR-XXXX` (mono) + cliente + chips de sucursal/marca + badges de prioridad y estado, microcopy del estado.
  - Cuerpo: tarjeta "Próxima acción" reutilizando la lógica derivada (`trabajo-derivado.ts`), bloque "Resumen operativo", lista única "Fechas y jornadas", "Historial" humanizado.
  - Footer: acción primaria contextual + Cancelar/Cerrar.
- Mantener el flujo legacy de `servicios` + `servicio_jornadas` ya implementado en el archivo actual; sólo cambia la presentación.

Resultado: al clickear desde Planificador, Calendario o Historial se abre el mismo drawer lateral/bottom-sheet que en Kanban.

## 2. Quitar duplicación de "Programar nueva fecha"

En `TrabajoDetalleDrawer.tsx` el CTA aparece hoy en tres lugares simultáneamente:

1. CTA principal dentro de `ProximaAccionCard` (cuando corresponde).
2. Botón ghost al lado del título de la sección "Fechas y jornadas".
3. Botón primario del footer cuando el estado lo amerita.

Cambios:

- Conservar el CTA del footer como acción primaria persistente y siempre visible.
- Conservar el CTA contextual de `ProximaAccionCard` sólo cuando el estado del trabajo realmente lo pide (sin pendientes, completado reabrible, etc.). En el resto de los casos esa tarjeta muestra otra acción (Cargar jornada, Reprogramar) y no repite "Programar".
- Eliminar el botón ghost del header de "Fechas y jornadas". En su lugar dejar un único `+ Programar nueva fecha` al pie de la lista, y sólo si el footer no ya lo está mostrando como primaria (para evitar dos botones iguales pegados en mobile).

Regla: en cualquier momento el usuario ve como máximo dos puntos de entrada distintos a "Programar nueva fecha" — la acción contextual (cuando aplica) y la del footer.

## 3. Migrar "Nueva máquina" del Parque al patrón drawer

`src/components/parque/NuevaMaquinaDialog.tsx` sigue siendo un `Dialog` centrado.

- Reescribirlo internamente con `ResponsiveDrawer` (size `lg`), manteniendo nombre, props y consumidores (`ParqueTab.tsx`).
- Reordenar los campos en secciones cortas: Identificación (Cliente, Marca, Subgrupo), Datos de la máquina (Serie, Año, Modelo/Tipo), Ubicación (Sucursal, Localidad), Comercial (Vendedor, Notas).
- Footer sticky con `Cancelar` + `Crear máquina`.

## 4. Revisión rápida de otros popups del módulo

Para asegurar consistencia visual sin cambiar lógica:

- Verificar `ServicioFormDialog.tsx` (alta/edición de servicio legacy si todavía se usa) y migrar a `ResponsiveDrawer` si aparece en flujos activos.
- Confirmar que `NuevoTrabajoDialog`, `ProgramarIntervencionDialog`, `CargarJornadaDialog` ya están sobre `ResponsiveDrawer` (lo están, según el trabajo anterior) y que se apilan correctamente sobre el nuevo `ServicioDetalleDialog` drawer-izado.

## Detalles técnicos

Archivos editados:

- `src/components/ServicioDetalleDialog.tsx` — reemplazar `Dialog` por `ResponsiveDrawer` y rehacer estructura interna (header / cuerpo en secciones / footer). Reusar helpers ya creados: `unificarFechas`, `calcularProximaAccion`, `humanizarEvento`.
- `src/components/trabajos/TrabajoDetalleDrawer.tsx` — quitar botón ghost de la cabecera de "Fechas y jornadas", mover/condicionar el `+ Programar nueva fecha` al pie de la lista y ajustar la lógica de `ProximaAccionCard` para no duplicar el CTA del footer.
- `src/components/parque/NuevaMaquinaDialog.tsx` — migrar a `ResponsiveDrawer`, reorganizar campos en secciones, footer sticky.
- (Si aplica) `src/components/ServicioFormDialog.tsx` — mismo patrón drawer.

Sin cambios de backend, ni de triggers, ni de RLS, ni de tipos. Los nombres de componentes y sus props se mantienen para no tocar a los consumidores (Planificador, Calendario, Historial, Parque).
