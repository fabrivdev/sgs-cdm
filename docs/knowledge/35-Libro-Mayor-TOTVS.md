# Libro Mayor TOTVS

Contexto verificado localmente el 2026-10-06 contra
`mayor_contable_2_monedas_140624.xml` (47.257.141 bytes), un SpreadsheetML de
Excel 2003. Esta etapa solo agrega reconocimiento y preflight local: no crea
tablas, RPC, migraciones ni persistencia.

## Lectura segura

El Mayor se procesa incrementalmente desde el `Blob`. El preflight conserva
solo conjuntos y totales de control; no materializa los asientos completos en
memoria. Las filas sin `FECHA` y `TPSLDO`, incluidas las dos filas finales de
totalización, se excluyen de movimientos.

## Evidencia del archivo de referencia

- 29.042 filas posteriores al encabezado: 29.040 movimientos y 2 filas de
  totalización que no son asientos.
- Cobertura 2026-07-01 a 2026-10-05, 6 sucursales, 251 cuentas, 23 centros de
  costo y 212 filas de apertura.
- `SALDO01` corresponde a PYG y `SALDO02` a USD, confirmación funcional del
  negocio. No deben mezclarse ni convertirse implícitamente.
- `TIPO_MOV=1` conserva importes no negativos y `TIPO_MOV=2` importes no
  positivos. La clave candidata es
  `SUCURS+FECHA+LOTE+SUBLOTE+DOCUMENTO+LINEA`; no se observaron duplicados.
- `TPSLDO=1` contiene 28.962 movimientos; `TPSLDO=9`, 78 movimientos y debe
  permanecer separado en cualquier total de control.
- Hay 2 movimientos sin cuenta, 3 sin descripción de cuenta, 3.325 sin centro
  de costo y 1.392 sin origen. Estos faltantes se informan, no se completan por
  inferencia.

## Alcance gerencial y faltantes

El Mayor habilita preclasificación de ventas, gastos, costos, resultado y
movimientos por sucursal/centro de costo, pero no prueba por sí solo EBITDA,
margen ni ROA. Esos KPI requieren plan y mapeo contable gobernado, tratamiento
de depreciación, costos e impuestos, saldos de activos medios y cobertura
temporal comparable.

Un importador futuro debe ser incremental e idempotente, excluir totalizadores,
conservar el registro fuente, separar `TPSLDO` y registrar una huella estable.
El Kardex sintético usa los ejes 1, 2 y 3 como PYG, USD y EUR respectivamente,
según confirmación del negocio; el archivo sigue sin declarar fecha de corte.
