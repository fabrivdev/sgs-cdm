# Sugerencia de compra — ordenar la UI y depurar la tabla

Hoy la página rompe con el resto de la app: los controles de Marca y Corte del análisis viven sueltos en el encabezado con etiquetas y alturas propias, hay un cartel "Cálculo en vivo" grande al lado del título, y la tabla usa tipografías/paddings propios en vez de la densidad estándar (11px encabezado, 13px celda) que usan Catálogo y Stock, Trabajos y Planificador. Además la columna "Clasificación" acumula hasta 6 badges por fila y hay columnas que no aportan decisión de compra.

## 1. Encabezado y filtros al patrón de la app

- Encabezado: solo el título "Sugerencia de compra" + acciones compactas (`h-8`, 12px): Parámetros, Modelo e historial (icono), Exportar.
- Marca y Corte del análisis bajan a la barra de filtros (`FiltersBar` + `FilterSelect` / `FilterDate`), con encabezado de filtro estándar, en una sola fila junto a Segmento, Estado de datos y Solo con sugerencia.
- El indicador "Cálculo en vivo" pasa a ser un punto discreto con texto en el `meta` del encabezado (o junto al contador de resultados), no un bloque destacado.
- Los KPIs quedan como están (ya usan `KpiStrip`), solo se revisa que los cuatro tengan la misma altura de detalle.

## 2. Tabla: columnas que sí sirven para decidir la compra

Columnas nuevas (todas las numéricas alineadas a la derecha y tabulares):

| Columna | Contenido |
|---|---|
| Pieza | Descripción + línea secundaria con código interno · código fabricante · familia |
| Clase | Un solo badge `ABC/FSN/XYZ` + segmento; los avisos (confianza baja, nuevo sin historial, sin ventas 24m, seguridad estimada) se resumen en un único badge de alerta con tooltip |
| Stock | Stock global |
| Demanda mensual | `demanda_ponderada_mensual` — es el número que alimenta el cálculo |
| Cobertura | Meses de cobertura al ritmo actual, con semáforo (rojo si < lead time, ámbar si corta) |
| Última venta | Fecha + días desde la última venta (`ultima_venta` / `dias_ultima_venta`) |
| Objetivo | `stock_objetivo` |
| Sugerencia | Unidades sugeridas, en la píldora destacada actual |

Se quitan de la tabla (siguen disponibles en el detalle lateral y en el Excel): Vendido 24m, la repetición de horizonte dentro de la celda de cobertura, y el bloque de badges secundarios.

## 3. Densidad visual

- Encabezados de tabla con `tableHeadText`, celdas 13px, alto de fila compacto igual a Catálogo y Stock.
- Pie de tabla (contador + paginación) con la misma altura y estilo de botón `h-8` que las otras tablas.
- Estados vacíos / de carga se mantienen, solo se les baja el tamaño de tipografía al estándar.

## Detalle técnico

- Todo el cambio es de presentación en `src/pages/RepuestosSugerencias.tsx`; no se tocan hooks, RPC ni el motor de cálculo.
- Se usan `FiltersBar`, `FilterSelect`, `FilterDate`, `FilterCustom` de `src/components/filters/FiltersBar.tsx` y los tokens de `src/lib/ui-classes.ts`.
- `ultima_venta`, `dias_ultima_venta` y `demanda_ponderada_mensual` ya vienen en `ResultadoSugerencia`, no hace falta consultar nada nuevo.
- La exportación a Excel queda igual (mantiene todos los campos).
