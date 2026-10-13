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

## Reimportacion y ausencia de evidencia (2026-10-03)

La regla de destinatario del importador anterior no se traslada a TOTVS. Sin
vinculo real con OS, el tipo de tiempo queda NULL; la ausencia de una OS en un
XML nuevo no prueba que un vinculo persistido haya dejado de existir.

La migracion `20261003001500` propuesta conserva UUID y pares reparados. Admite
completar vendedores vacios, limpiar el antiguo default Cliente sin OS
ni metadata de evidencia, incorporar un vinculo previamente ausente cuando
el XML aporta evidencia completa y univoca (con tiempo/marca comprobados),
y retener un vinculo/clasificacion existente cuando
la entrada declara evidencia ausente. Cambios explicitos contradictorios de
OS, tipo, marca, vendedor conocido, cantidades o importes siguen bloqueando.
Las preservaciones auditadas conservan sus verificaciones de huella, timestamp
y par; no usan el respaldo general. La limpieza actualiza tambien
`raw_data.canonical_time_type` para evitar que consumidores recuperen el viejo
default. Los cambios de vendedor/tipo quedan en una auditoria transaccional.

Los duplicados del lote deben coincidir tambien en su metadata de evidencia,
tanto antes de enviarse desde el frontend como dentro del RPC. Repetir un
paquete sin novedades no debe actualizar filas cuyo campo y entrada siguen
ambos vacios. La validacion descrita es local; aplicar codigo no ejecuta SQL y
no acredita triggers ni vistas productivas que no se hayan reproducido.

La migracion guarda la definicion previa del RPC antes de reemplazarla. La
auditoria de importacion conserva valores anteriores de todas las columnas
modificadas, raw_data anterior y huellas antes/despues. Revertir el codigo no
revierte datos importados; una reversion de datos requiere controles propios.

## Anulacion por ausencia en snapshot completo (2026-10-09)

El usuario confirmo que un documento anulado deja de aparecer del reporte
acumulativo de Ventas TOTVS. Esta semantica solo se aplica cuando el operador
declara `totvs-billing-full-v1`, todos los documentos, el intervalo DESDE/HASTA
del reporte y la lista de sucursales incluidas. El XML real inspeccionado no
trae esos filtros como metadata; por eso las fechas no se deducen del minimo y
maximo observado. Una sucursal declarada puede tener cero filas. Las sucursales
observadas deben ser subconjunto de las declaradas. Fechas y sucursales se
solicitan sin valores precargados, de modo que incluir una sucursal vacia sea
una decision explicita y no un efecto del formulario.

La migracion `20261009180000` conserva UUID, importacion anterior, importes y
`raw_data` de la linea ausente. Marca la linea fuera de reportes y registra un
evento `ANULADA_POR_AUSENCIA`; no ejecuta DELETE sobre el detalle. El resumen
de la ventana se reconstruye solo desde el snapshot actual dentro de la misma
transaccion. Si una identidad reaparece en un snapshot completo posterior, se
reactiva la misma fila y se registra `REACTIVADA_POR_REAPARICION`. Repetir el
mismo archivo no crea otro cambio de estado.

La regla no se activa para cargas incrementales o archivos que el operador
declare parciales, aunque el archivo contenga filas de todas las sucursales.
Los consumidores SQL operativos y los lectores directos filtran
`excluido_de_reportes=false`; parque, repuestos y consolidacion se refrescan
dentro de la misma transaccion del snapshot completo. Un fallo de cualquiera
revierte detalle, resumen y auditoria. La migracion `20261009182000` no revierte
estados manuales de maquinaria por una mera coincidencia de chasis. Si existe
un vinculo manual independiente o una conciliacion automatica historica sin
estado previo trazable, la carga completa aborta transaccionalmente para no
adivinar ni pisar ese estado.
No cambia formulas, cron ni diseno del panel. La verificacion es local y no
acredita que las migraciones hayan sido aplicadas en produccion.

## Enriquecimiento descriptivo seguro de facturacion (2026-10-13)

La propuesta `20261013173000` cubre el hueco de grupo/subgrupo sin convertir
una reimportacion en reemplazo de asientos. Solo admite completar un grupo
ausente (`NULL`, vacio o `-`) cuando factura y maestro de productos aportan el
mismo subgrupo no vacio para el mismo SKU, el tipo canonico coincide y el resto
de la firma comercial, fecha, fabricante compatible y moneda no cambia. Un
grupo conocido distinto, una sola fuente descriptiva, una preservacion
auditada o un documento excluido no se adapta.

La matriz sigue separando identidad de descripcion. SKU, cantidad, importes y
moneda son guardas duras; cero es un importe, no ausencia. El core previo sigue
siendo responsable de completar fabricante y vendedor ausentes y de las reglas
de OS/tiempo/marca que exigen evidencia. Esta propuesta no relaja esas reglas
ni convierte codigo de fabricante en identidad de producto. Ademas conserva
un vendedor conocido solo si coincide con su raw historico, y una marca
conocida ante ausencia explicita aunque no haya OS solo cuando la evidencia
historica es univoca. Tambien conserva `CODFAB` conocido ante vacio solo si el
SKU permanece igual y el raw historico coincide; fabricante nunca forma la
identidad. Esas preservaciones se auditan por separado. Para grupo,
una fuente posterior vacia solo conserva un valor conocido si `GRUPO` y
`product_group` historicos lo acreditan conjuntamente.

Una fila canonica con OS y par de deduplicacion permanece bajo la proteccion
especial del core aunque no tenga una preservacion explicita: este wrapper no
la adapta. Completar una marca antes desconocida continua sujeto a las reglas
de evidencia del core; esta allowlist no pretende aceptar toda diferencia
descriptiva futura.

El wrapper toma el mismo advisory lock que el core y bloquea los UUID destino
antes de planificar. Los duplicados fisicos solo se resuelven mediante pares
canonico/descartado auditados; nunca por `min(id)`. Antes de adaptar el lote,
reconcilia el resumen recibido contra el detalle original. Despues reconstruye
detalle efectivo y resumen desde la misma clasificacion, conserva UUID, hash,
carga e importes, y registra la decision. Cualquier fallo posterior revierte
detalle, resumen, auditoria, procedencia e importacion.

La validacion disponible es local con PGlite y contratos de funciones tomados
de las migraciones del repositorio. No acredita el cuerpo desplegado de
`core_consolidacion`, no aplica SQL remoto y requiere un preflight completo del
lote antes de confirmar una importacion productiva.

El hotfix `20261013183500` corrige dos incompatibilidades de tipos del wrapper
ya instalado: convierte `tipo_facturacion` a `text` antes de usar una cadena
vacia en `coalesce`, y asigna `grupo_normalizado` como `text` sin referenciar un
tipo enum inexistente. La regresion reproduce primero el `22P02` con los enums
reales de sucursal, marca y tipo de facturacion, verifica que grupo permanece
`text` y ejecuta el hotfix dos veces para comprobar idempotencia. No modifica
filas ni relaja las guardas comerciales.

El hotfix `20261013190000` separa la evidencia historica de las reparaciones
cientificas del resumen materializado. Conserva `resumen_id` UUID NOT NULL y
los snapshots before/after, pero elimina exclusivamente la FK RESTRICT de
`resumen_id` a `facturacion(id)` en las tablas V1/V2, despues de verificar
tabla, columna, tipo, destino y accion de borrado en catalogo. Las FKs a la
linea de detalle y a la importacion permanecen. Esto permite que un snapshot
completo reconstruya `facturacion` sin borrar auditoria ni usar CASCADE.
El rollback V2 anterior no debe ejecutarse luego de esa reconstruccion: sus
UUID de resumen ya son historicos; sus guardas abortan y revierten sin tocar
detalle ni evidencia cuando no encuentra exactamente los tres resumenes.
