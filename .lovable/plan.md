## Mejorar flujo de cierre de jornadas y compactar selector de cuadrilla

### Problema 1 — Después de cerrar una jornada, no salta a la próxima pendiente

En `ServicioDetalleDialog.tsx` el `useEffect` que elige la jornada activa (líneas 214–228) preserva la jornada actual si sigue existiendo en la lista. Tras cerrar una jornada con `CargarJornadaDialog`, la jornada recargada existe pero ya no está pendiente, por lo que el drawer se queda mostrándola en lugar de pasar automáticamente a la siguiente pendiente.

**Fix:** en el `onSaved` del `CargarJornadaDialog` (línea 736), después de recargar jornadas:
1. Buscar la siguiente jornada `Pendiente` en la lista recién cargada (ordenada por fecha asc).
2. Si existe, `setActiveJornadaId(siguiente.id)`.
3. Si no quedan pendientes, dejar `activeJornadaId` en la última cargada (comportamiento actual) y mostrar un toast tipo "Todas las jornadas cerradas".

Implementación: convertir `loadJornadas` para que devuelva la lista nueva, o bien releer el state después con un `setTimeout` no es necesario — basta con hacer un fetch local dentro del callback y setear el id antes de llamar a `loadJornadas` (o pasar un parámetro `preferPending` al efecto). La opción más limpia: hacer que `loadJornadas` retorne el array y, en el callback, calcular la próxima pendiente y setear `activeJornadaId`.

También aplicar la misma lógica cuando se elimina una jornada (línea 349).

### Problema 2 — Selector de cuadrilla ocupa mucho espacio

Hoy `TecnicosPicker` siempre muestra la lista (`max-h-48/56`) debajo del buscador. Cambiar para que:

- Por defecto se muestre solo el buscador + chips compactos con los técnicos ya seleccionados (principal + auxiliares), con un botón "x" para quitarlos.
- La lista completa aparece únicamente cuando:
  - el input de búsqueda está enfocado, **o**
  - el usuario escribió texto (query no vacío).
- Al hacer blur del input y query vacío → colapsar la lista de nuevo.
- Si no hay nadie seleccionado, mostrar un placeholder pequeño tipo "Sin cuadrilla asignada · usá el buscador para agregar".

Detalle técnico: usar estado local `focused` + `query` para condicionar el render del bloque `divide-y`. Para que el click sobre una fila no dispare blur antes del click, usar `onMouseDown={(e)=>e.preventDefault()}` en el contenedor de la lista, o manejar con un pequeño timeout. Mejor: envolver buscador + lista en un wrapper con `onFocus`/`onBlur` capturando el `relatedTarget` (patrón estándar de comboboxes).

Como `TecnicosPicker` se usa en todos los lugares (Programar, CargarJornada, Detalle), este cambio es global y resuelve también el pedido de "optimizar espacios" en todos los formularios.

### Archivos a modificar

- `src/components/trabajos/TecnicosPicker.tsx` — colapsar lista, mostrar chips de seleccionados, abrir lista al enfocar buscador.
- `src/components/ServicioDetalleDialog.tsx` — saltar a la siguiente jornada pendiente tras `CargarJornadaDialog.onSaved` y tras `deleteJornada`.

Sin cambios de schema, backend ni en `CargarJornadaDialog`.
