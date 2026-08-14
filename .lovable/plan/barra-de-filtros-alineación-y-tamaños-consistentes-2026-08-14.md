# Barra de filtros: alineación y tamaños consistentes

Las capturas muestran tres problemas distintos.

## 1. Etiquetas que se pisan y campos cortados

En la fila de filtros los campos se comprimen hasta chocar: "AGRUPAR POR" se monta sobre "SUCURSAL" y el botón queda cortado como "Filtr".

Qué se hace:
- Las etiquetas dejan de ajustarse en dos líneas: una sola línea, y si no entran se recortan con puntos suspensivos.
- Cada campo respeta un ancho mínimo real; cuando ya no hay espacio, los últimos campos se esconden y quedan disponibles en el panel "Filtros" (en vez de comprimirse hasta romperse).
- El botón "Filtros" y el bloque de la derecha nunca se comprimen: quedan siempre completos y con espacio propio.

## 2. Controles con alturas y tipografías distintas

Algunos filtros están armados a mano (el selector de "Período rápido" del dashboard, el de "Agrupar por", los campos numéricos de año) y usan altura y texto propios, distintos de los selects estándar. Por eso se ven de diferente tamaño y desalineados entre sí.

Qué se hace:
- Todos los controles de filtro pasan a la misma altura (32px) y al mismo tamaño de texto (12px), usando los tokens ya definidos.
- Los grupos tipo "Día / Semana / Mes / Año" quedan a la misma altura que los selects y con el mismo borde/radio.
- Las etiquetas de todos los campos quedan a la misma línea base, de modo que los campos queden alineados horizontalmente.

## 3. El panel lateral "Filtros" se ve apretado

Hoy los filtros dentro del panel conservan el ancho fijo que tenían en la barra, así que quedan tres selects mínimos en fila, con el texto truncado ("3 se..."), en un panel casi vacío.

Qué se hace:
- Dentro del panel, cada filtro ocupa el ancho completo, uno debajo del otro, con su etiqueta arriba.
- El pie del panel es siempre igual: "Limpiar (n)" a la izquierda y "Aplicar" a la derecha (hoy en algunos casos falta "Limpiar").

## Detalles técnicos

- `src/components/filters/FiltersBar.tsx`: `Field` con etiqueta `truncate whitespace-nowrap` y alto fijo; fila desktop con `min-w-0` por campo y anchos mínimos; contenedor del panel con `[&_[data-filter-field]]:w-full` para forzar ancho completo dentro del `Sheet`; pie del panel siempre con ambos botones.
- Marcar cada `Field` con `data-filter-field` para poder anular anchos dentro del panel sin tocar cada página.
- `src/components/filters/FilterMultiSelect.tsx`: usar `controlHeight`/`controlText` y misma estructura de `Field`.
- Controles manuales en `src/pages/Dashboard.tsx` (`Período rápido`, `PeriodSelector`) y en los filtros con inputs numéricos de año: reemplazar `h-9`/`text-[13px]` por `controlClass`.

Sin cambios de datos ni de lógica de filtrado.
