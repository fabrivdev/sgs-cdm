# Condiciones visuales obligatorias de Ventas

Acuerdos del usuario. Leer esta nota antes de modificar o publicar vistas de Ventas de Servicios, Máquinas o Repuestos. Estas condiciones son requisitos de presentación, no preferencias opcionales ni cambios de cálculo.

## Reglas

- Cada registro ocupa una sola línea visual. No apilar sucursal bajo factura, propietario bajo cliente, chasis bajo OS ni concepto sobre descripción. Si son necesarios, usar columnas separadas.
- No agregar párrafos explicativos, subtítulos didácticos ni leyendas redundantes dentro del panel. Conservar mensajes necesarios de carga, error o ausencia de datos; no esconder fallos para cumplir el diseño.
- Importes con `$`, nunca con `USD` como prefijo visible. Es solo formato: no convertir moneda, alterar importe, signo de NC o precisión acordada. Detalle de Servicios conserva dos decimales.
- La celda de cantidad contiene solo el número: `4,25`, `76`, `0`; nunca `4,25 h`, `76 km`, `hs` o `unid.`. La unidad/contexto se identifica por concepto, encabezado o título al pasar el cursor, no como sufijo del valor. Cantidad desconocida: `—`, no cero inventado.
- No poner `Total facturado en el período` ni otro subtotal monetario al pie de Detalle. El pie puede contar filas/documentos. Esto NO elimina `Total del período` de los resúmenes por período de los tres módulos: ese total sí fue solicitado.
- Sin scroll horizontal ni ancho mínimo forzado. Ajustar columnas al ancho disponible, con una sola línea, elipsis y valor completo al pasar el cursor para textos extensos. No reducir fuentes hasta hacerlas ilegibles para evitar el scroll.
- Encabezado y dato comparten ancho y eje: texto a la izquierda, cantidades/horas centradas, importes/porcentajes a la derecha. Conservar colores de marcas y nombres de columnas acordados; usar `Ticket Medio`.
- En Detalle de Servicios, usar `Código` en lugar de `Concepto`: código de producto de la línea financiera para repuestos; código operativo documentado como MA01/KM01/SE para servicios. No fabricar códigos por categoría ni tomar el REP de otra línea de la OS. Conservar el componente en el título al pasar el cursor; códigos ausentes o ambiguos quedan `—`.

## Orden y exportación compartidos

- Encabezados ordenables con un clic ascendente y otro descendente, indicador de dirección y acceso por teclado. Comparar valores originales: fechas cronológicas, cantidades/importes numéricos y textos con orden español natural; no ordenar el texto formateado con `$`. Ausencias al final en ambos sentidos; empates estables, sin deduplicar líneas.
- Mantener eje/ancho de encabezado y dato al agregar el icono. No apilar títulos ni ampliar la tabla para acomodarlo. Los totales de resúmenes por período permanecen al pie, fuera del conjunto ordenable.
- Exportar a Excel todas las filas filtradas en el orden y columnas actuales, no solo la página o el área visible. Conservar textos completos, códigos/facturas como texto con ceros iniciales, fechas reales, cantidades numéricas, centavos y NC negativas. No convertir descripciones en fórmulas ni agregar subtotales al Detalle.
- Respetar `datos:exportar`, igual que Parque/Clientes. No habilitar exportación durante carga/error/sin filas; mostrar fallo y permitir reintento. Cargar la librería Excel solo al solicitarla.
- Orden local únicamente sobre una respuesta completa. En reportes paginados ordenar antes de paginar en SQL y exportar el conjunto completo de filtros, nunca presentar una página ordenada como el resultado global.

Paso 1 implementado: base reutilizable `salesTableInteraction`, `SalesTableControls` y `salesTableExport`, aplicada únicamente a las 12 columnas de Detalle de Servicios. Ampliación de filtros y demás tablas/módulos pendiente. No modifica población financiera, correcciones de Comisiones, exclusiones ni cantidades operativas.

## Comprobación antes de entregar/publicar

1. Comparar la vista con las otras dos áreas, no diseñar un formato distinto solo para un módulo.
2. Verificar símbolo `$`, cantidades exclusivamente numéricas, ausencia de total monetario en Detalle, datos apilados y párrafos nuevos.
3. Probar textos largos, NC negativas, ceros y cantidades desconocidas. Preservar cifras, signos y filtros.
4. Mantener pruebas de regresión. Una compilación correcta no demuestra que la presentación respete estas reglas.
5. Registrar qué fue comprobado localmente y qué requiere SQL/publicación; no declarar validación visual en producción sin comprobarla.

## Fuentes y alcance comprobado

[[03-Ventas-y-conciliacion]] recoge las reglas financieras; [[02-Servicios-y-comisiones]] distingue horas OS de horas-persona; [[09-Mantenimiento]] explica cómo mantener y sincronizar esta nota.

Implementación de esta revisión: `src/components/ventas/ServiciosDetalleOS.tsx`. Pruebas de formato: `src/components/ventas/ServiciosDetalleOS.test.tsx`. No equivale a una auditoría completa de todas las pantallas ni aplica SQL automáticamente.

Validación local del 17/09/2026: 16 pruebas de Detalle/Clientes/búsqueda, ESLint y compilación correctos. Las 14 pruebas de sincronización/grafo confirman enlaces válidos y conectividad de la nueva nota/regla; se sincronizó sin conflictos manuales. No se comprobó esta revisión en producción ni se publicó automáticamente.

Revisión posterior de Código: 17 pruebas de Detalle/Clientes/búsqueda y fixture PostgreSQL aislada correctas. Se conserva el contrato financiero/cantidades, repeticiones y NC. Requiere SQL manual `20260917170000_service_invoice_line_product_code.sql`; commit/push no ejecuta SQL. No se consultaron códigos de producción.

Paso 1 de orden/exportación del 17/09/2026: 103 pruebas de componentes de Ventas, ESLint de los archivos afectados y compilación correctos. Playwright verificó el componente real con 25 líneas ficticias, ambos sentidos de importes, búsqueda y descarga Excel completa; el archivo descargado preserva orden, códigos, centavos, NC y cantidades OS. Anchos 1920/1366/1024/768/390 px sin desbordamiento horizontal del documento. Elipsis en pantallas estrechas no equivale a lectura íntegra simultánea. No se consultó producción y no requiere SQL adicional por este paso.
