# Filtros transversales

## Regla funcional - 06/10/2026

- En escritorio, `Más filtros` representa filtros secundarios reales. Los controles primarios que ya caben en la barra no se repiten dentro del panel.
- En móvil, el panel conserva los controles primarios porque la fila de escritorio no está disponible. Si el ancho de escritorio oculta controles por desborde, el panel también los mantiene accesibles.
- Si una sección no tiene secundarios respaldados y sus primarios caben, el disparador se oculta en escritorio. No se inventan dimensiones ni se usa una búsqueda duplicada para justificar el panel.
- `children` de `FiltersBar` es la fila primaria; `expanded` contiene los filtros secundarios. Fragmentos vacíos, booleanos y ramas `null` no habilitan por sí solos el panel.
- Se conservan `aria-expanded`, `aria-controls`, conteo activo, limpiar, debounce de búsqueda, fechas, sucursal, permisos y acciones de sección.

## Inventario auditado

| Sección / consumidor | Secundarios reales | Fuente y alcance |
| --- | --- | --- |
| Ventas · Repuestos | Marca, Vendedor | `ventas_repuestos_panorama_filtros_v1` y `ventas_repuestos_listado_filtros_v1`; filtran antes de KPI, períodos/comparaciones, agrupaciones, paginación y exportación. |
| Ventas · Servicios | Tipo de tiempo, Marca, Tipo de máquina, campos comerciales, Componente, Origen, Documento, Vínculo OS | Contratos existentes de Servicios; solo se separan primarios y secundarios. |
| Ventas · Máquinas | Marca, Tipo de máquina | Contrato existente de Máquinas; solo se separan primarios y secundarios. |
| Stock proyectado | Modelo, signo del Stock proyectado, presencia de OC, presencia de Ventas pendientes | Todas las filas devueltas por `maquinaria_stock_proyectado_v1`; el mismo conjunto alimenta KPI, tabla, orden y Excel. No se expone Programa. |
| Comisiones | Estado OS, Técnico | Campos ya cargados por la vista; no cambia liquidación. |
| Operaciones/Importaciones de Máquinas | Modelo, Vínculo NP o Condición según pestaña | Campos existentes de cada consulta; no cambia facturación ni entrega. |
| Catálogo de Repuestos | Familia, Existencia | Parámetros ya soportados por el catálogo; Excel conserva datos completos. |
| Sugerencias de Repuestos | Segmento, Estado de datos, Solo con sugerencia | Datos existentes del reporte; no cambia demanda ni fórmula. |
| Trabajos/OS | Situación OS, Situación factura | Campos existentes del listado. |
| Parque, Stock de máquinas, Planificador, Órdenes, Dashboard, Historial de máquina y otras vistas de Trabajos | Paneles secundarios que ya existían | Sin cambio de fuente; usan la detección compartida de contenido útil. |
| Administración, Calendario, Compras y solicitudes auxiliares | Ninguno adicional respaldado cuando todos los primarios caben | Escritorio oculta el disparador; móvil/desborde conserva acceso a primarios. |
| Detalle de repuesto | Ninguno adicional respaldado | Se elimina el panel que duplicaba la misma búsqueda visible. |

## Ventas de Repuestos

La migración local `20261006120000_add_parts_sales_advanced_filters.sql` agrega variantes filtradas de movimientos, panorama y listado. Las RPC anteriores quedan intactas y se siguen usando sin Marca/Vendedor. El helper de movimientos no se concede a clientes autenticados; las RPC públicas conservan la comprobación de acceso de `repuestos.ventas`.

`scripts/verify-parts-sales-filters-pglite.mjs` ejecuta la migración completa en PostgreSQL aislado y comprueba Marca/Vendedor antes de agregados, comparaciones anterior/año anterior, dos páginas, exportación total y `Sin vendedor`. `scripts/verify-parts-sales-filters-sql.mjs` conserva verificaciones estáticas de permisos y ausencia de escrituras.

## Validación y límites

- Las pruebas de `FiltersBar` cubren fragmentos vacíos/falsy, contenido útil, acceso móvil y desborde.
- Ventas de Repuestos verifica los mismos filtros en panorama, listado paginado y exportación.
- Stock proyectado verifica que el conjunto filtrado alimenta filas, los cuatro KPI y Excel.
- La revisión fue por código y pruebas, sin navegar la aplicación.
- No se aplicó SQL remoto ni se consultó producción.
- `docs/knowledge/mapa-negocio.json` no estaba disponible en este clon ni en la copia generada consultada; el impacto se contrastó con código, migraciones y notas existentes.
- `docs/knowledge/06-Repuestos.md` tampoco estaba disponible en el clon; se consultó su copia generada de Obsidian y no se reconstruyó contenido ausente.
