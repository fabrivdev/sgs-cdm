## Resumen
Eliminar el botón duplicado "Continuar otro día" del bloque de jornada pendiente en el detalle de servicio, ya que realiza exactamente la misma acción que "Nueva jornada" en el historial. Dejar una sola vía para programar una nueva fecha.

## Cambios

### 1. ServicioDetalleDialog.tsx
- **Eliminar** el botón "Continuar otro día" (líneas ~499-508) del bloque de jornada pendiente.
- Dejar solo "Cargar resultado" en esa sección.
- Mantener "Nueva jornada" en el header del Historial como única forma de agregar una nueva fecha.

## Nota sobre selectores de cuadrilla
El componente `TecnicosPicker` ya tiene implementado el comportamiento de mostrar la lista solo al hacer foco en el buscador. Este comportamiento aplica automáticamente en todos los lugares donde se usa (CargarJornadaDialog, ProgramarIntervencionDialog y ServicioDetalleDialog).