# Acciones de sección

Criterio compartido: `Más filtros` seguido por un único menú `⋮`. No repetir botones Exportar en tablas ni duplicar el menú dentro del panel lateral. El acceso permanece en la barra tanto en escritorio como en móvil.

`FiltersBar.secondaryActions` ubica el menú; `actions` conserva las acciones principales existentes. `SectionActionsMenu` ofrece las opciones, bloquea concurrencia y comunica fallos con posibilidad de reintento. Cada consumidor mantiene sus permisos y su exportador anterior: consultas, filas, columnas, formatos, archivos y nombres de hoja no cambian.

En Ventas de Servicios, `SalesSectionExportsProvider` reúne Períodos y las tablas montadas de la pestaña actual. `useSalesSectionExport` usa el último resultado filtrado/ordenado y elimina la opción al desmontar la tabla. No carga pestañas ocultas ni agrega RPC. Las tablas verifican `datos:exportar` y carga/error/ausencia de filas igual que antes. El total de Períodos sigue incluido; Detalle no agrega subtotal monetario.

La misma entrada se aplica a los exportadores ya existentes de Dashboard, Comisiones, Administración, Clientes/Parque, Máquinas/Stock, catálogo de Repuestos, Sugerencias, Compras, Calendario y Planificador. No incorpora nuevas exportaciones a Ventas de Máquinas/Repuestos ni modifica crear, editar, validar o pagar.

No requiere migración SQL. Pruebas locales con datos ficticios no acreditan estado ni ejecución en producción.

Validación local del 18/09/2026: 121 pruebas de Ventas/menús y 14 de conocimiento, comprobación de tipos y compilación correctas. Playwright verificó un solo menú después de Más filtros en 1920/1366/1024/768/390 px, cambio de pestaña y descargas completas de Períodos/Detalle; Excel conserva las 25 líneas ficticias ordenadas, NC, centavos, códigos, fechas y cantidades originales. ESLint no encontró problemas nuevos: Calendario/Planificador conservan los mismos seis errores `any` y la advertencia de dependencia anteriores a este cambio; no se corrigieron por estar fuera del alcance.
