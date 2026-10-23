# Contrato de tablas de períodos de ventas

## Alcance

Solo Períodos de Repuestos, Máquinas y Servicios. Se mantienen filtros, permisos, indicadores y detalles existentes. No hay migración ni aplicación de SQL. Main no equivale a publicación en Lovable.

- Repuestos/Máquinas: Período · Facturación neta · Facturación Bruta · NC ($) · Clientes · Documentos · Período anterior · LY · Participación.
- Servicios: Período · Facturación neta · Mano de obra · Kilometraje · Repuestos · Terceros · Clientes · Documentos · Período anterior · LY · Participación.

## Fuentes y cardinalidad

Repuestos conserva `ventas_repuestos_panorama_v2` y `ventas_repuestos_panorama_filtros_v1`: `facturado`, `ventas`, `notas_credito`, `documentos`, `clientes`. La fuente define el documento mediante su clave comercial; no se cuentan líneas ni se recalculan claves en frontend. `anterior_lineas`/`anio_anterior_lineas` sin líneas conservan comparación no acreditada, como antes.

Servicios conserva `ventas_servicios_panorama_v2` y su variante `_filtrado`. Composición monetaria neta del RPC: `total`, `mo`, `km`, `repuestos`, `terceros`. Documentos conserva `facturas`, cuya clave compuesta incluye factura, fecha, cliente, sucursal y línea en ausencia de factura. No se homologa silenciosamente esa cardinalidad con Máquinas.

Máquinas conserva `ventas_maquinas_dashboard_filtros_v2`: documentos son `facturas` (facturas distintas según la fuente) y clientes vienen del agregado. Bruta es suma de importes positivos; NC ($) son importes negativos, no unidades devueltas. Se usa el mismo contrato de `resumen.venta_bruta`/`notas_credito_monto` de `20261015231000_machine_sales_seller_filter.sql`. Para cada período se suman las líneas completas del rango, comprobando que su neto reconcilie con el agregado; si faltan/no reconcilian, Bruta/NC quedan desconocidas. Las NC monetarias sin devolución de unidades siguen reduciendo dinero. Netas = Bruta + NC firmadas. No cambian unidades ni devoluciones en otras vistas.

El total de clientes/documentos proviene del resumen único del rango, nunca de sumar meses. Servicios suma componentes monetarios; los porcentajes se recalculan sobre el total.

## Comparaciones y presentación

Anterior desplaza las fechas efectivamente incluidas un día/semana/mes/año según la agrupación. LY usa las mismas fechas calendario del año anterior. En semanas no se busca una clave de lunes del año anterior; se suman días dentro de las fechas equivalentes. Mes/año completos conservan su cierre (incluido 29 de febrero); fechas inexistentes al desplazar se ajustan al último día válido. Los parciales no se comparan contra meses completos.

Servicios/Máquinas hacen dos consultas complementarias diarias con los mismos filtros de la consulta actual; cubren todas las ventanas de filas y la ventana del total. Un error/denegación/malformación deja comparación desconocida, sin bloquear la tabla actual. Una respuesta diaria vacía válida suma cero. Las respuestas anteriores no reemplazan la solicitud vigente. Repuestos mantiene las ventanas ya calculadas por su RPC.

Variación = (actual − anterior) / anterior solo para base positiva. Base cero/negativa conserva importe y variación no calculable, con contexto en la celda. Ausente no equivale a cero. Participación usa neto de la fila / neto del rango, con signos originales.

Pantalla: USD sin decimales; precisión interna intacta. Excel: importe y razón de variación en columnas numéricas separadas, no texto compuesto ni importes redondeados. Exportar conserva autorización `datos:exportar` y no ejecuta consultas nuevas.

## Verificación

Pruebas de componentes y funciones cubren bruto/NC/neto, NC monetaria sin unidades, períodos vacíos, días/semanas/meses/años, parciales/bisiestos, totales únicos, bases cero/nulas/negativas, filtros y errores de comparación, exportación numérica, disponibilidad del exportador al contraer, formato móvil y permisos existentes. No se usó navegador ni se consultaron/importaron datos productivos para esta implementación.

Validación de esta entrega: 185 pruebas aprobadas en 24 archivos de Ventas y Stock proyectado; lint focal sin errores; build aprobado. El chequeo estándar de tipos encuentra un error previo en `src/test/totvsBillingSnapshotVersions.test.ts:96` (`String.replaceAll` con lib ES2020), presente también en main antes del cambio. No se altera esa prueba ni tsconfig dentro de este alcance. La primera corrida simultánea con build tuvo dos timeouts; la repetición con dos workers pasó completa.
La comprobación completa con `--lib es2021,dom,dom.iterable` pasó sin cambiar archivos de configuración; separa ese bloqueo previo de los tipos de esta entrega.

## Nomenclatura posterior

Las etiquetas activas se centralizan en `salesLabels.ts`: Facturación Neta, Facturación Bruta, Nota de crédito y Año anterior. El nombre exacto de conteo documental es Cant. N.C.; las devoluciones físicas son Unidades devueltas. El historial mixto usa Importe. Esta corrección de nombres no modifica el contrato numérico descrito arriba. Excel conserva importe y variación separados, identificados explícitamente, y el nombre Ventas permanece en navegación/contextos generales.

Validación de nomenclatura: 187 pruebas aprobadas en 23 archivos, lint focal y build aprobados; tipos aprobados usando ES2021 solo en el comando. Sigue separada la limitación previa de `replaceAll` con lib ES2020 en una prueba TOTVS ajena a este cambio. No hubo revisión visual general ni consultas productivas.
