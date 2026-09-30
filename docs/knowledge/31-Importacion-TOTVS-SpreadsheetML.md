# Importación TOTVS SpreadsheetML

Contexto verificado localmente el 2026-09-30 contra 17 exports XML de TOTVS. Esta nota describe estructura y límites; no acredita despliegue ni migraciones aplicadas en producción. `docs/knowledge/00-Inicio.md` y `mapa-negocio.json` no estaban disponibles en este checkout, por lo que las decisiones se contrastaron con archivos y código vigente.

## Cobertura

El selector reconoce OS, facturación de ventas, productos, stock de repuestos, stock de máquinas, maquinarias como respaldo de chasis, clientes, pedidos/solicitudes de compra, pedidos de venta, despacho de importaciones, Kardex analítico y sintético, facturas de compra, proveedores y transferencias entre sucursales en tránsito. Los nombres con sufijo `_original` son respaldo y se ignoran; el Kardex anterior sin ese sufijo se conserva porque aporta cobertura de junio.

## Reglas conservadoras

- Kardex analítico usa `TABLA + RECNO`. Dos archivos reales comparten 10.457 claves y contradicen 4.063: 3.998 solo en costos y 65 en campos no monetarios. El lote completo se bloquea; nunca se prefiere el archivo más nuevo por fecha.
- Kardex sintético conserva SALDO, PPP1/2/3 y VALOR_1/2/3. La fuente no declara fecha de corte ni moneda de cada eje y no se recalcula `VALOR = SALDO × PPP`.
- Facturas de compra conservan `MONORI`, importes Gs, importes USD y `TIPCAM` por separado. No convierten ni eligen una moneda contable. La serie puede venir vacía y forma parte de la clave como texto vacío.
- El maestro de proveedores contiene dos encabezados idénticos `Ag. Ret.IVA?`; se guardan como banderas 1 y 2 hasta confirmar su semántica.
- Transferencias en tránsito son una foto: las claves ausentes en una carga completa dejan de estar vigentes, pero permanecen en historial.
- Despacho es un reporte agregado de productos/repuestos; no prueba unidades de máquinas ni chasis.
- La cobertura de fechas se informa como la observada en cada archivo y no se presenta como acumulado anual.

## Persistencia local propuesta

Las migraciones `20260930160000` a `20260930190000` crean tablas fuente y RPC por lotes de hasta 500 filas con permisos de `admin.importaciones`, trazabilidad (`archivo_origen`, `fila_origen`, `huella_origen`, `datos_fuente`, `carga_id`) y conteos de insertadas/actualizadas/sin cambios. No se ejecutaron contra producción.

Estas tablas quedan preparadas como fuentes para un futuro panel gerencial macro. No se implementó ninguna pantalla ni se adoptó un nombre literal basado en la metáfora visual del panel.

## Validación pendiente para rentabilidad

Antes de alimentar margen o resultado económico se necesita un Kardex comparable del período 2026-07-01 a 2026-08-25, con todas las filiales, depósitos, productos, tablas y movimientos, conservando TABLA/RECNO y los ejes de costo. También se debe confirmar la semántica de `MONEDA=0/2`, `_D_2`, `_D_3`, `T_C=0` y si los reprocesos de costo/fecha reescriben históricos manteniendo RECNO.
