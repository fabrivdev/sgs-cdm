# Filtros compactos, panel lateral y planificador más denso

## 1. Filtros en una sola fila, siempre

- La barra de filtros deja de envolverse en varias líneas: vuelve a una sola fila que no crece en alto.
- Los campos que no entran quedan detrás del botón "Filtros", que pasa a ser la vía única para lo secundario.
- Controles y etiquetas más compactos: altura de control 32px, texto de control 12px, etiquetas 10px, menos separación entre etiqueta y campo.

## 2. "Más filtros" abre un panel lateral

- El botón "Filtros" deja de abrir un popup y abre un panel lateral (drawer) desde la derecha.
- El panel muestra los filtros secundarios en columna, con "Limpiar" y "Aplicar" fijos abajo.
- En móvil se mantiene el mismo panel lateral, en lugar del bloque desplegable actual.

## 3. Encabezado de página más ajustado

- Se reduce el aire del título: menor altura mínima, título a 18px y menos espacio entre el encabezado y la barra de filtros.

## 4. Planificador: sin columna visual de Tipo

- La columna "Marca / Tipo" pasa a mostrar solo la marca (encabezado "Marca"), quitando el badge Taller/Visita.
- El dato de tipo se sigue guardando y sigue saliendo en la exportación a Excel; solo se quita de la tabla.
- Con eso las filas bajan de alto (la celda deja de tener dos líneas apiladas); se ajusta el padding vertical de fila acorde.

## Detalles técnicos

- `src/components/filters/FiltersBar.tsx`: fila desktop con `flex-nowrap` + `overflow-hidden`; sustituir `Popover` por `Sheet` (`side="right"`) para `expanded`, reutilizándolo también en la rama móvil; alturas a `h-8` y textos por tokens.
- `src/lib/ui-classes.ts`: `controlHeight` → `h-8`, `controlText` → `text-[12px]`, `cardLabel` a 10px, `pageTitle` a 18px.
- `src/components/layout/AppPrimitives.tsx`: `PageHeader` con `min-h-8`, `gap-1`; `PageShell` con `space-y-3`.
- `src/pages/Planificador.tsx`: encabezado de columna a "Marca", eliminar `Badge` de tipo y `TipoIcon` de la tabla desktop (se mantiene en `exportExcel` y en el detalle); filas a `py-1.5`.

Sin cambios de datos ni de lógica de negocio.
