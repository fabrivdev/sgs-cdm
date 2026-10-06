# Contrato del Mayor para indicadores gerenciales

Auditoría local realizada el 2026-10-06 sobre el Mayor de 47.257.141 bytes y
la clasificación preliminar de 251 cuentas. No se aplicó SQL, no se cargaron
datos y no se modificó el panel.

## Controles de fuente

| Capa | Filas | Neto PYG | Neto USD | Tratamiento |
| --- | ---: | ---: | ---: | --- |
| Apertura, TPSLDO 1 | 212 | 0 | 0 | Saldo inicial; excluir de flujos del período |
| Período, TPSLDO 1 | 28.750 | 0 | 0 | Capa principal conciliada |
| Período, TPSLDO 9 | 78 | -317.006.879 | -53.428,63 | Mostrar aparte; no mezclar con TPSLDO 1 |

Las 29.040 filas contables tienen cero duplicados para
`SUCURS+FECHA+LOTE+SUBLOTE+DOCUMENTO+LINEA`. Se excluyen dos totalizadores.
`SALDO01` es PYG y `SALDO02` es USD. No se convierte una moneda a la otra.

## Resultado preliminar con cuentas claras

Los importes siguientes usan solo movimientos `TPSLDO=1`, excluyen apertura y
no incorporan cuentas en revisión.

| Indicador | PYG | USD |
| --- | ---: | ---: |
| Ventas | 32.887.507.158 | 5.496.588,77 |
| Costo de ventas | 19.238.953.317 | 3.083.726,28 |
| Resultado bruto | 13.648.553.841 | 2.412.862,49 |
| Margen bruto | 41,50% | 43,90% |
| Gastos operativos e impuestos/tasas operativos | 3.042.287.188 | 508.858,29 |
| EBITDA preliminar | 10.606.266.653 | 1.904.004,20 |
| Depreciación/amortización identificada | 197.109.944 | 33.229,22 |
| EBIT preliminar | 10.409.156.709 | 1.870.774,98 |
| Resultado financiero neto favorable | 245.331.212,51 | 3.893,36 |
| Resultado antes de renta, preliminar | 10.654.487.921,51 | 1.874.668,34 |

No se presenta resultado neto: no hay movimiento claro de impuesto a la renta
en el período. El Mayor tampoco trae base imponible ni IVA discriminado; esos
controles deben provenir de facturación y compras, no inferirse del saldo.

## Cobertura y excepciones que afectan KPI

- 217 cuentas están claras y 34 en revisión. En el período principal hay 112
  filas no utilizables directamente para KPI: 111 de cuentas en revisión y una
  sin cuenta.
- Esas 112 filas representan 39.188.157.498 PYG y 6.535.755,88 USD de importe
  absoluto, 5,85% y 5,74% del movimiento bruto de `TPSLDO=1`. Su neto es
  233.241.040 PYG y 31.109 USD; el neto pequeño no reduce su materialidad.
- Las cuentas 511 en revisión aportan 465.617.420 PYG y 78.150,39 USD netos.
  Si todas fueran costo, el margen bruto bajaría de 41,50% a 40,08%. Si son
  costo o gasto operativo, el EBITDA bajaría a 10.140.649.233 PYG y
  1.825.853,81 USD. La ubicación cambia margen bruto; ambas opciones cambian
  EBITDA por el mismo importe.
- Las cuentas 52 en revisión tienen un egreso neto de 1.078.004.942 PYG y
  181.878,31 USD. La mayor exposición es `EGRESOS POR SESIONES DE CREDITOS`:
  falta decidir si es financiero, no operativo u operativo.
- Hay una fila `TPSLDO=1` sin cuenta por -1.135.569.486 PYG y -191.819,17 USD.
  Hasta identificarla, no se debe publicar resultado ni ROA como completos.
- Septiembre registra ventas por 8.726.946.957 PYG y costo claro por solo
  160.227.445 PYG: margen preliminar 98,16%. No hay depreciación en septiembre
  ni octubre. El usuario indicó que cree que septiembre aún no se cerró; se
  conserva como indicio y el mes queda `PROVISIONAL/CIERRE_POR_CONFIRMAR`, no
  como prueba de corrupción ni como cierre contable confirmado.
- Octubre termina el día 5 y debe mostrarse como mes parcial.
- La depreciación y la mayor parte del resultado financiero aparecen en la
  sucursal 01. La rentabilidad por sucursal representa imputación directa, no
  una asignación corporativa completa.

Los activos claros `TPSLDO=1` son 170.425.241.663 PYG de apertura y
214.687.282.780 PYG de cierre derivado; el activo medio claro sería
192.556.262.221,50 PYG. No alcanza para ROA porque faltan la cuenta sin código,
la resolución de cuentas patrimoniales ambiguas, impuesto a la renta y una
política de cierre comparable.

## Decisiones concretas pendientes

1. Distribuir las cuentas 511 en costo de ventas o gasto comercial/operativo.
   Es la decisión que mueve margen bruto entre 40,08% y 41,50%.
2. Definir la presentación de cesiones de créditos, venta/baja de activos y
   recuperos de siniestros. Afectan resultado antes de impuestos y, si alguna se
   declara operativa, también EBITDA.
3. Identificar la fila sin cuenta y confirmar formalmente el cierre de costo y
   depreciación. Septiembre queda `PROVISIONAL/CIERRE_POR_CONFIRMAR` y octubre
   `PARCIAL`; julio y agosto tampoco se rotulan cerrados sin confirmación.

No se vuelve a solicitar plan contable externo ni confirmación de moneda. Estas
son decisiones de presentación sobre cuentas e importes ya identificados.

## Contrato propuesto de persistencia

La fuente y su clasificación deben permanecer separadas:

- `totvs_mayor_cargas`: archivo, SHA-256, tamaño, período observado, conteos,
  totales por moneda/capa, estado de validación, usuario y fecha.
- `totvs_mayor_asientos`: clave fuente, huella de contenido, campos literales,
  `importe_pyg`, `importe_usd`, `tpsldo`, `es_apertura`, archivo y fila de origen.
- `totvs_mayor_mapeo_cuentas`: cuenta, categoría, subcategoría, estado
  `PROPUESTA/CLARA/REVISION`, versión, vigencia y aprobación. El mapeo no modifica el
  asiento fuente.
- Vista agregada gerencial por mes, sucursal, centro de costo, moneda, TPSLDO,
  apertura y estado de clasificación. El panel no necesita acceso al detalle
  contable personal.

La clave idempotente es
`SUCURS+FECHA+LOTE+SUBLOTE+DOCUMENTO+LINEA`. Una reimportación con la misma
clave y huella cuenta como sin cambio. La misma clave con distinta huella
bloquea el lote para revisión; no se actualiza silenciosamente. Los
totalizadores nunca llegan a la tabla de asientos.

El RPC propuesto debe aceptar lotes de hasta 500 filas, modo `validate/import`,
rol `admin.importaciones`, auditoría por carga y totales de insertadas,
actualizadas, sin cambio y conflicto. Lectores gerenciales acceden solo a la
vista agregada. Una reimportación no borra historia ni suma dos veces saldos.

## Plan en tres pasos

1. Aprobar las tres decisiones de presentación y registrar el estado de cierre
   de cada mes. Los parciales pueden mostrarse fielmente con una advertencia,
   pero no se estiman costos, depreciaciones ni provisiones faltantes.
2. Implementar staging, RPC de validación e idempotencia con pruebas de
   repetición, conflicto de huella, exclusión de totalizadores y conciliación
   PYG/USD/TPSLDO. Mantenerlo local hasta revisión.
3. Exponer al panel únicamente agregados con cobertura y monto excluido. Activar
   margen, EBITDA y ROA por separado a medida que cada prerrequisito quede
   aprobado; nunca reemplazar faltantes por cero.

## Estado local y ajuste de eficiencia

La simulacion local del archivo real alcanzo 29.040 filas validadas, 29.040
persistidas, dos cuarentenas y conciliacion final. La primera ejecucion se
detuvo despues de ese punto al abrir el XLSX de clasificacion; la segunda perdio
el entorno durante una nueva carga. Por lo tanto, no hay evidencia de que la
consulta agregada haya fallado: no llego a ejecutarse en esas corridas.

La revision de codigo si encontro un riesgo de memoria evitable en la vista:
la CTE seleccionaba `m.*`, incluyendo `datos_fuente` JSON y columnas de detalle
que el agregado no utiliza, y resolvia cada movimiento con un `EXISTS`
correlacionado. El contrato local ahora deduplica primero solo los IDs vinculados
a cargas completas y luego une las columnas necesarias. Esto conserva la
idempotencia entre reimportaciones, mantiene `TPSLDO=1` y `TPSLDO=9` separados
y deja `PROPUESTA`, `CLARA`, `REVISION` y `SIN_MAPEO` visibles.

La correccion queda pendiente de validacion liviana cuando el frente de filtros
libere el entorno; no se aplico a ninguna base. El Mayor revisado trae dos
importes, PYG y USD. La convencion global confirmada es moneda 1 PYG, 2 USD y
3 EUR, pero EUR no aparece como columna ni importe en este archivo y no se
infiere ni se completa como si hubiera sido reportado.

### Validacion local completa del contrato optimizado

Con el entorno liberado se ejecuto una simulacion aislada en PGlite sobre disco,
sin conexion a ningun backend. El XML real se recorrio una vez y cada lote se
valido y persistio secuencialmente:

- 29.040 movimientos en 59 lotes de hasta 500; 29.040 validados, 29.040
  persistidos, cero conflictos y dos cuarentenas.
- 28.962 filas `TPSLDO=1`, con neto de control cero en PYG y USD; 78 filas
  `TPSLDO=9`, conservadas aparte, con -317.006.879 PYG y -53.428,63 USD.
- 212 aperturas y estado final de carga `COMPLETA`.
- En la simulacion tecnica el mapa auxiliar se cargo como 217 `CLARA` y 34
  `REVISION` para medir cobertura. La entrega no convierte esa simulacion en
  aprobacion: persiste las 217 como `PROPUESTA` y las 34 como `REVISION`.
  El XLSX escribe `REVISIÓN` con tilde; esa etiqueta de presentacion se
  normaliza al identificador tecnico `REVISION` sin aprobar ni reclasificar la
  cuenta.
- Septiembre permanecio `PROVISIONAL_CIERRE_POR_CONFIRMAR`, octubre `PARCIAL`,
  y julio/agosto `SIN_CONFIRMAR`.
- La consulta compacta de la vista tomo 0,260 s. El RPC agregado completo
  devolvio 2.191 grupos y 1.158.269 bytes en 0,344 s.
- Tiempo interno total 19,132 s; pico observado de proceso 545,4 MiB RSS y
  163,8 MiB de heap. La mayor parte corresponde al runtime WASM/base embebida,
  no al resultado agregado.

Las pruebas focales quedaron 10/10, typecheck sin errores y lint focal sin
errores. El lint historico del componente de importacion conserva 19 usos de
`any` preexistentes en otros importadores; no fueron introducidos por el Mayor.
