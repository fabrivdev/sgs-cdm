# Orden y exportación de tablas

Ampliación solicitada el 18/09/2026. No cambia cálculos financieros, reparto de MO, correcciones de tipo de tiempo, pago de comisiones, estados de pedidos, clasificación ABC ni fórmulas de sugerencias.

## Criterio compartido

- Una entrada por sección: `Más filtros → ⋮`. Sin botones de exportación por tabla. Los paneles de detalle tienen su propia sección y menú, no duplican acciones en el panel lateral de filtros.
- Encabezados con ambos sentidos e indicador. Comparar números y fechas originales, no etiquetas formateadas. Texto natural español; ausencias al final en ambos sentidos y empates estables. No deduplicar líneas.
- Excel completo filtrado y ordenado. Textos completos; códigos/facturas como texto, cantidades/importes numéricos y NC con signo. El exportador tipado conserva fechas Excel y centavos. Los informes especializados existentes conservan sus columnas adicionales.
- Respetar `datos:exportar`. Bloquear descargas durante carga/error o sin datos; mostrar errores y permitir reintento. XLSX se carga al solicitarlo.
- Orden local solo sobre una respuesta completa. En listados paginados, ordenar en servidor antes de aplicar el límite. No generar un archivo parcial si la cantidad recibida no coincide con la declarada.
- Totales de Períodos fijos al pie, nunca mezclados con filas ordenables. No sumar conteos distintos por grupo para obtener el total.

Base: `useSectionTable`, `salesTableInteraction`, `SalesTableControls`, `salesTableExport`, `SalesSectionExports`, `FiltersBar`, `SectionActionsMenu`. Los encabezados nativos clicables admiten Enter/Espacio sin interceptar controles internos.

## Cobertura implementada

| Sección | Tablas / comportamiento |
| --- | --- |
| Ventas de Servicios | Períodos, resúmenes, Técnicos, Clientes, Máquinas y Detalle; historial de OS/repuestos por máquina con menú propio. |
| Ventas de Máquinas | Períodos, Marca, Condición, Vendedores, Clientes, Máquinas, modelos y Detalle; modelos exportables aunque el grupo esté cerrado. |
| Ventas de Repuestos | Períodos, Sucursal, Marca, Vendedores, Clientes, Repuestos y Detalle; orden global y exportación completa mediante nueva RPC. |
| Parque / Clientes | Clientes, Máquinas y Stock; ordenar todas las columnas útiles y exportar el conjunto filtrado. Stock se carga por lotes estables, no con un único límite de respuesta. |
| Operaciones / Importaciones | Columnas visibles de ambas listas; fechas reales, llaves naturales y posición de unidad como texto `1/3`. Mantener acciones comerciales y logísticas. |
| Repuestos / catálogo | Mantener orden paginado en servidor y exportación completa con filtros/orden. El informe maestro stock + ventas conserva su alcance por marcas; su nombre lo distingue del exportador de la tabla filtrada. |
| Sugerencias | Doce encabezados: Marca, Código, Cód. fabr., Descripción, Clase, Segmento, Stock, Dem. pond., Cobertura 12m, Última venta, Objetivo y Sugerencia. Orden global en servidor y después de combinar particiones. Exportar todos los resultados de los filtros actuales, no forzar “solo sugeridos”. |
| Compras | Pedidos y Solicitudes, incluidos ítems dentro de cada documento. Exportaciones de ítems siguen documentos/ítems ordenados y búsqueda visible. |
| Ficha de repuesto | Facturas, Clientes/Meses y Sucursales; filtro local y exportación en menú único del panel de detalle. |
| Trabajos / OS vinculadas | Todas las columnas; exportación completa y bloqueo tras fallo de carga. |
| Comisiones | Resumen técnico, OS, Liquidaciones y jornadas del panel de OS. El desglose conserva grupos/totales por día: Fecha ordena grupos, otras columnas ordenan dentro de cada día; Excel sigue ese orden sin deduplicar jornadas. Filtros del panel no alteran población liquidable. |
| Administración | Equipo y Accesos; carga completa por páginas, exportación con el mismo orden y permisos existentes. No cambia altas, roles ni concesión de accesos. |
| Planificador | Ocho encabezados y exportación en el orden actual; tarjetas móviles comparten ese orden. |
| Dashboard | Facturas, Clientes, tabla dinámica, OS de Servicios y Trabajos abiertos. El menú reúne tablas montadas con informes especializados sin repetir la exportación de OS/trabajos abiertos. |

Las matrices cronológicas, calendarios, gráficas/rankings y previsualizaciones de importación NO se convierten en listados genéricos: preservar calendario, secuencia, límites visuales y número de línea de origen. Las tablas de impresión no incorporan botones interactivos. Componentes antiguos sin consumidor activo no acreditan cobertura productiva. Esta revisión no es una certificación universal de cada formulario o gráfica de la app.

## SQL manual, en este orden

1. `supabase/migrations/20260918200000_parts_sales_global_sort_and_export.sql`: helper natural y `ventas_repuestos_listado_v3`. Conserva las CTE/reglas de la versión vigente, agrega claves/direcciones permitidas y exportación completa sin alterar `v2`.
2. `supabase/migrations/20260918201000_purchase_suggestions_global_sort.sql`: `repuestos_sugerencia_viva_ordenada`, basada en el motor vigente de recurrencia. Requiere el helper anterior y conserva la RPC original y los cálculos de demanda/stock objetivo.
3. `supabase/migrations/20260918210000_purchase_suggestion_identity_sort.sql`: agrega orden por marca, fabricante, descripción y segmento; Clase compara únicamente ABC/FSN/XYZ, no el segmento. Conserva el motor instalado, permisos, filtros, paginación, cobertura y recomendaciones. Es transaccional, admite reejecución y no escribe datos de negocio.

Las migraciones son transaccionales, validan la definición de origen antes de modificar funciones y no reescriben datos. Si cambia después el motor original, regenerar las variantes. SQL faltante produce error explícito, no fallback a una página ordenada o datos parciales. El límite de universo del motor original de sugerencias no se amplía desde este cambio.

Commit/push NO ejecuta SQL. No se midió el rendimiento de producción ni se comprobó su esquema aplicado.

## Verificación

Primer paso de unificación visual fuera del Dashboard (18/09): Catálogo y Stock usa `PartsStockTable`, con doce columnas separadas (Código, Fabricante, Marca, Descripción, Familia, seis sucursales y Total), una línea, colores compartidos y cantidades/encabezados centrados. En anchos menores a 1024 px muestra Código/Marca/Descripción/Total; el desglose se conserva en la ficha y en Excel, sin comprimir cifras para hacer caber doce campos. Fabricante y Familia también permanecen en el título de Descripción. Cabeceras breves distinguen S. Rita/S. Rosa/L. Plata. Mantiene las nueve claves de orden global ya admitidas por la RPC; Marca/Fabricante/Familia aún no se ofrecen como ordenables: requieren una ampliación posterior de servidor, no orden local de una página. Sin cambios de SQL, consultas, KPI, stock, filtros ni exportadores.

Verificado con 18 pruebas de componente/integración/menú/exportación, tipos, lint y compilación; navegador local con 50 productos ficticios en 1920/1366/1024/768/390 px, sin desplazamiento horizontal ni registros apilados. La prueba de exportación recibe 51 filas pese a una sola visible y conserva códigos con ceros y cantidades. No valida producción. El Dashboard ejecutivo queda expresamente fuera de esta nueva unificación.

Segundo paso: `DetalleRepuestoSheet` unifica Facturas, Clientes, Meses y Sucursales: registros de una línea, textos a la izquierda, cantidades/conteos centrados e importes a la derecha, con encabezados en el mismo eje y `aria-sort`. `Cant.`, `P. unit.`, `Facturación` y `Stock` evitan etiquetas largas. Importes con `$` y hasta dos decimales; cantidades fraccionarias con hasta seis, sin sufijos, conservando NC negativas. No modifica fórmulas, agrupaciones, conteos distintos ni la base de cobertura de la ficha.

La conversión conserva ecuación y regla en un aviso junto a Factura, accesible por clic/teclado; nunca añade unidades a Cantidad. Tablas de ancho fijo sin mínimos y pestañas ajustadas al panel. En teléfonos Facturas muestra Fecha/Factura/Cant./Facturación; Cliente y P. unit. permanecen en el título de Factura y Excel completo. Clientes/Meses/Sucursales mantienen sus cuatro campos. Búsqueda, orden, permisos y menú `Más filtros → ⋮` siguen vigentes. La exportación conserva valores originales, centavos, facturas como texto y formato de cantidades de seis decimales.

Verificación local de la ficha: ocho nuevas pruebas de formato, conversiones, NC, ambos sentidos de orden, agrupaciones, sucursales, ausencia de stock, exportación/permisos y error/reintento; 35 regresiones de ficha/stock/menú/orden/Excel y 14 de conocimiento correctas, tipos y compilación correctos, lint sin errores ni advertencias nuevas frente a HEAD. Navegador con 51 líneas ficticias y cuatro vistas en cinco anchos, sin desbordamiento horizontal, con aviso y orden operables por teclado. No consulta producción ni necesita SQL nuevo. Siguen pendientes Compras de Repuestos, Parque/Importaciones y Servicios.

Revisión compacta de Sugerencias del 18/09: registros de una sola línea, columnas separadas, MarcaBadge compartido y cantidades centradas; sin anchos mínimos ni desplazamiento horizontal. Familia, antigüedad, detalle ABC/FSN/XYZ y avisos de confianza permanecen al pasar el cursor y en la ficha/exportación. En teléfonos se muestran Marca, Código, Descripción, Stock y Sugerencia, con aviso de calidad junto a la descripción; las otras columnas no se comprimen hasta volver sus números ilegibles y permanecen en la ficha y el Excel completo. Cobertura 12m es stock / promedio mensual real de doce meses; Dem. pond. es el pronóstico ponderado, no su denominador. Excel conserva ambas bases numéricas. No modifica recomendaciones, mínimos ni horizonte. Pruebas React, tipos, lint, compilación y PostgreSQL aislado; navegador local con 122 registros ficticios en cinco anchos. Elipsis en pantallas estrechas no equivale a lectura completa simultánea. No se consultó producción ni se aplicó SQL remoto.

174 pruebas React/negocio correctas (29 archivos), tipos y compilación. Fixtures PostgreSQL aisladas (`scripts/verify-parts-sales-order-sql.mjs`, `scripts/verify-suggestion-sort-sql.mjs`) comparan páginas contra exportación completa, permisos, claves inválidas, ausencias, NC, totales, ABC y sugerencias contra las RPC originales.

Playwright con componentes reales y 122 filas ficticias comprobó Máquinas/Repuestos a 1920/1366/1024/768/390 px: menú único después de Más filtros y documento sin desbordamiento horizontal. Los archivos realmente descargados contienen las 122 líneas en orden, ceros iniciales, fechas y valores originales; Repuestos descarga el total aunque solo haya 50 filas visibles. En móvil continúa siendo necesaria la elipsis; no equivale a legibilidad íntegra simultánea. No se usaron datos ni cuentas de producción. ESLint se compara contra HEAD para detectar problemas nuevos sin refactorizar advertencias anteriores ajenas al alcance.
