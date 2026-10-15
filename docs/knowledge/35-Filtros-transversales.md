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
| Ventas · Máquinas | Marca, Tipo de máquina, Vendedor | `ventas_maquinas_dashboard_filtros_v2` aplica los tres filtros antes de KPI, períodos, agrupaciones, detalle y exportación. El vendedor se normaliza y conserva la opción `Sin vendedor`. |
| Stock proyectado | Modelo, signo del Stock proyectado, presencia de OC, presencia de Ventas pendientes | Todas las filas devueltas por `maquinaria_stock_proyectado_v1`; el mismo conjunto alimenta KPI, tabla, orden y Excel. No se expone Programa. |
| Comisiones | Estado OS, Técnico | Campos ya cargados por la vista; no cambia liquidación. |
| Operaciones/Importaciones de Máquinas | Modelo, Vínculo NP o Condición según pestaña | Campos existentes de cada consulta; no cambia facturación ni entrega. |
| Catálogo de Repuestos | Familia, Existencia | Parámetros ya soportados por el catálogo; Excel conserva datos completos. |
| Sugerencias de Repuestos | Segmento, Estado de datos, Solo con sugerencia | Datos existentes del reporte; no cambia demanda ni fórmula. |
| Trabajos/OS | Situación OS, Situación factura | Campos existentes del listado. |
| Parque, Stock de máquinas, Planificador, Órdenes, Dashboard, Historial de máquina y otras vistas de Trabajos | Paneles secundarios que ya existían | Sin cambio de fuente; usan la detección compartida de contenido útil. |
| Administración · Equipo | Estado y Rol | Selectores sobre la misma lista que alimenta la tabla y la exportación; el buscador sigue cubriendo nombre, email, sucursal y nivel. |
| Calendario, Compras y solicitudes auxiliares | Ninguno adicional respaldado cuando todos los primarios caben | Escritorio oculta el disparador; móvil/desborde conserva acceso a primarios. |
| Detalle de repuesto | Ninguno adicional respaldado | Se elimina el panel que duplicaba la misma búsqueda visible. |

En Ventas de Máquinas, el único buscador cubre modelo, chasis, factura, cliente, vendedor y código, además de los demás campos contemplados por la RPC. Marca, Tipo de máquina y Vendedor son selectores secundarios. Si una búsqueda reduce las opciones devueltas por la RPC, el valor ya seleccionado permanece visible y se puede quitar. Los filtros afectan a KPI, períodos, agrupaciones, detalle y exportación por medio de la misma respuesta del servidor. La migración de Vendedor mantiene `ventas_maquinas_dashboard_v1` disponible para los consumidores anteriores.

En Pedidos y Solicitudes de compra, los campos internos de número que no tenían un control visible se retiraron: el buscador existente ya cubre esos identificadores. En Parque de Máquinas, Año desde y Año hasta son selectores de años presentes en los datos, no entradas numéricas libres. En Parque de Clientes, el buscador único cubre nombre, RUC y código de entidad. En Comisiones y Análisis de Repuestos, los contadores de filtros activos incluyen también el buscador.

## Selectores rápidos en teléfono - 07/10/2026

Bajo 640 px, los selectores que cambian el subconjunto o período visible y no son navegación de sección se muestran dentro de `Más filtros`: semana de Planificador, estado visible de Trabajos, estado de técnicos de Productividad y período/medida de Cumplimiento. No se duplican fuera del panel. Órdenes/Productividad/Cumplimiento permanecen como pestañas visibles porque cambian de sección, no son filtros.

Limpiar restablece también estos valores a sus defaults. El conteo activo incluye estado/período/medida cuando difieren del valor inicial. Se conservan fechas, sucursal, búsqueda con debounce, `aria-expanded`, Aplicar y las variantes de escritorio. La revisión de incidencias de Productividad se ofrece como acción útil dentro del panel móvil cuando existe; no se fabrica contenido para justificar `Más filtros`.

## Borrado único de la búsqueda compartida - 07/10/2026

`FiltersBar` mantiene su botón propio `Limpiar búsqueda`, con nombre accesible y borrado inmediato mediante el callback existente. Como ese control ya cubre la función, el mismo input oculta exclusivamente la decoración nativa de cancelación de los navegadores WebKit/Chromium para no mostrar dos cruces. La regla está acotada por la clase `filters-bar-search`: los otros `input[type="search"]` que no dibujan una acción propia conservan el cancelador nativo.

No cambian el debounce de 250 ms, el estado controlado, filtros activos, limpieza general, fechas, sucursal, permisos ni callbacks. Las dos variantes responsive montadas por `FiltersBar` aplican el mismo contrato; en cada una existe un solo botón custom adyacente. La comprobación fue de componente, CSS compilado y respuesta HTTP local, sin navegador ni validación de producción.

## Ventas de Repuestos

La migración local `20261006120000_add_parts_sales_advanced_filters.sql` agrega variantes filtradas de movimientos, panorama y listado. Las RPC anteriores quedan intactas y se siguen usando sin Marca/Vendedor. El helper de movimientos no se concede a clientes autenticados; las RPC públicas conservan la comprobación de acceso de `repuestos.ventas`.

`scripts/verify-parts-sales-filters-pglite.mjs` ejecuta la migración completa en PostgreSQL aislado y comprueba Marca/Vendedor antes de agregados, comparaciones anterior/año anterior, dos páginas, exportación total y `Sin vendedor`. `scripts/verify-parts-sales-filters-sql.mjs` conserva verificaciones estáticas de permisos y ausencia de escrituras.

## Revisión de filtros - 15/10/2026

Se conservan los filtros que representan dimensiones distintas aunque compartan ubicación. En Importaciones, Llegada y Situación no son equivalentes: una describe el arribo y la otra el estado operativo. En Ventas de Servicios, los selectores de tipo, componente, origen, documento y vínculo OS tienen significados distintos y no deben fusionarse en un campo de texto. La simplificación se limita a los campos invisibles/redundantes y a sustituir las entradas de año por selectores.

El filtro de Vendedor de Máquinas se prueba en PostgreSQL aislado con ventas identificadas, un vendedor faltante y comparación de período; el filtro se aplica antes de los agregados. Las pruebas de interfaz cubren la opción `Sin vendedor`, el selector de año, la búsqueda de cliente por RUC/código y la exportación filtrada. La migración `20261015231000_machine_sales_seller_filter.sql` se aplicó en SGS-CDM el 15/10/2026 antes de publicar el frontend. Se verificó la existencia de la RPC, permiso `authenticated` y campos de vendedor; la consulta real del 01/01 al 15/10 devolvió USD 12.036.669,43 general, USD 3.268.788,83 para Carlos Benítez y USD 88.250 para `Sin vendedor`. La publicación visual de Lovable requiere comprobarse aparte.

## Validación y límites anteriores

- Las pruebas de `FiltersBar` cubren fragmentos vacíos/falsy, contenido útil, acceso móvil y desborde.
- Ventas de Repuestos verifica los mismos filtros en panorama, listado paginado y exportación.
- Stock proyectado verifica que el conjunto filtrado alimenta filas, los cuatro KPI y Excel.
- La revisión fue por código y pruebas, sin navegar la aplicación.
- No se aplicó SQL remoto ni se consultó producción.
- `docs/knowledge/mapa-negocio.json` no estaba disponible en este clon ni en la copia generada consultada; el impacto se contrastó con código, migraciones y notas existentes.
- `docs/knowledge/06-Repuestos.md` tampoco estaba disponible en el clon; se consultó su copia generada de Obsidian y no se reconstruyó contenido ausente.
