# Contrato de cuentas por cobrar para mora gerencial

Auditoría local realizada el 2026-10-07 sobre
`cuentas_por_cobrar_a_la_fecha_114844.xml`, sin importar datos, aplicar SQL,
modificar el panel gerencial ni publicar cambios.

## Fuente verificada

- SpreadsheetML de Excel, hoja `Cuentas Por Cobrar a la Fecha`.
- 3.256.444 bytes; SHA-256
  `7ab25e0ebe2d959848ce0a5c11744737dce1d27deed0dbd40182820fdc045ead`.
- El archivo fue creado/modificado el 2026-10-07 alrededor de las 11:49 (-03),
  el nombre termina en `114844` y la fecha máxima de emisión es 2026-10-07.
  Fabrizio confirmó explícitamente `2026-10-07` como corte para este SHA. La
  confirmación pertenece solo a este archivo: el importador sigue exigiendo el
  corte en cada carga y nunca lo infiere del nombre o fecha del archivo.
- 2.683 filas fuente posteriores al encabezado: 2.681 cuotas documentales y
  dos filas de título/control excluidas. Cero duplicados para la clave
  `corte+sucursal+tipo+serie+documento+cuota+cliente`.
- 2.565 documentos, 2.681 cuotas, 280 clientes, 18 asesores y seis sucursales.
- Tipos fuente: 2.597 `NF`, 48 `NCC` y 36 `RA`.
- Todas las filas documentales traen `Moneda=2`. La convención global ya
  documentada del proyecto identifica `2=USD`; no aparecen PYG ni EUR. El
  contrato de esta carga rechaza una moneda distinta o una mezcla de monedas.
- Todas las filas documentales tienen emisión y vencimiento. Las 36 `RA` no
  informan `Vencto Orig`; se conserva el vencimiento vigente sin reconstruirlo.

## SALDO, documentos y anticipos

`VALOR` totaliza USD 14.671.081,80. `SALDO` neto fuente totaliza
USD 8.346.529,29. Hay 1.280 saldos positivos, 1.380 ceros y 21 negativos.
Por tanto, `VALOR` no representa deuda pendiente y no puede alimentar mora.

En Protheus, `RA` significa `Recebimento Antecipado`: cobro anticipado de un
cliente. El archivo real contiene 36 RA con saldo neto USD -498.713,10:

| Control RA | Filas | USD |
| --- | ---: | ---: |
| Saldo positivo | 1 | 1.714,69 |
| Saldo cero | 17 | 0,00 |
| Saldo negativo | 18 | -500.427,79 |
| Total RA | 36 | -498.713,10 |

Las 17 columnas no incluyen factura aplicada, identificador de aplicación ni
tabla de relación. Cobertura de aplicación: `SIN_VINCULO_EXPLICITO`; vinculadas:
cero. Los RA y las NCC se conservan para conciliación, pero nunca se compensan
otra vez contra las NF. Según la semántica confirmada del reporte, una aplicación
ya realizada está plasmada en el `SALDO` de la NF; ese saldo es el pendiente
actual y es la única base de mora. No se necesita el vínculo RA→NF para calcular
la mora de una NF ya ajustada, aunque sí sería necesario para auditar el detalle
de la aplicación. Tampoco se etiqueta `VALOR-SALDO` como pago: esa diferencia no
identifica por sí sola pagos, notas de crédito, aplicaciones ni sus fechas.

## KPI candidato conservador

Población elegible: filas con `Tipo=NF`, moneda USD y `SALDO>0` dentro de una
misma carga completa y corte. Una cuota está vencida solo cuando
`Vencimiento < fecha_corte`; si es igual al corte, vence hoy y no está vencida.

```text
porcentaje_saldo_vencido =
  saldo_vencido_usd / saldo_pendiente_elegible_usd * 100
```

Resultado del archivo real:

| Control | Filas | USD |
| --- | ---: | ---: |
| NF con saldo positivo elegible | 1.278 | 8.845.483,46 |
| Vencidas antes del 2026-10-07 | 986 | 3.920.103,16 |
| Vence el 2026-10-07 | 1 | 1.213,77 |
| Vencimiento futuro | 291 | 4.924.166,53 |
| NCC/RA positivas excluidas | 2 | 1.907,92 |

El cociente candidato es **44,32%**. Es saldo de facturas NF vencido, no
cartera neta tras aplicar créditos o anticipos no vinculados. El saldo positivo
de todos los tipos (USD 8.847.391,38) y el saldo neto fuente
(USD 8.346.529,29) son controles, no denominadores intercambiables.

Agregado de integración por sucursal (clientes distintos dentro de cada
sucursal; una misma persona puede aparecer en más de una):

| Sucursal | Clientes | Cuotas elegibles | Pendiente USD | Cuotas vencidas | Vencido USD | % vencido |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 01 | 98 | 557 | 7.898.289,15 | 419 | 3.209.606,00 | 40,64% |
| 02 | 34 | 154 | 135.692,17 | 105 | 90.118,39 | 66,41% |
| 03 | 22 | 72 | 45.019,36 | 48 | 23.953,08 | 53,21% |
| 04 | 10 | 364 | 572.634,09 | 324 | 476.053,82 | 83,13% |
| 05 | 17 | 69 | 101.787,02 | 51 | 60.045,73 | 58,99% |
| 06 | 17 | 62 | 92.061,67 | 39 | 60.326,14 | 65,53% |

## Persistencia e idempotencia preparadas

- `totvs_cxc_cargas` conserva archivo, SHA-256, corte/evidencia, estado y
  controles conciliados, incluidos los agregados RA.
- `totvs_cxc_documentos` conserva campos literales, `VALOR`, `SALDO`, moneda,
  vencimientos, `naturaleza_documento` y `datos_fuente` por cuota.
- Cada corte tiene snapshots versionados. Un retry del mismo SHA reutiliza la
  carga y, si está completa, no reescribe filas. Otro SHA crea una nueva
  `snapshot_version`, aunque conserve corte y claves y cambie legítimamente
  `SALDO` por operaciones registradas.
- Reintentar el mismo SHA con otro corte se rechaza. Una huella contradictoria
  bloquea dentro del mismo snapshot, no una versión posterior del mismo corte.
- La versión anterior sigue visible mientras la nueva está validando. Solo al
  finalizar conciliada la nueva pasa a `COMPLETA` y reemplaza lógicamente a la
  anterior; nunca se suman snapshots.
- Los lotes son de hasta 500 filas y pasan por `validate` antes de `import`.
  La finalización recalcula los controles en SQL; un desacuerdo revierte la
  finalización. La cancelación compensatoria elimina solo filas huérfanas.
- La migración local `20261007130000_import_totvs_accounts_receivable.sql`
  queda preparada para revisión: 31.363 bytes, SHA-256
  `52df58770511e0e9dea6c397a8ff2aefb4ebef3285cb258ce95232cea73e3191`.
  No fue aplicada.

## Contrato para el panel gerencial

El panel no debe leer detalle ni descargar toda la tabla. Debe invocar
`totvs_consultar_cxc_resumen_v1(corte)`; sin corte, el RPC elige una sola carga
completa por `fecha_corte DESC, snapshot_version DESC`. Devuelve:

- `carga_id`, `fecha_corte`, `snapshot_version`, `reemplaza_carga_id` y
  `moneda=USD`;
- saldo pendiente elegible, saldo vencido, porcentaje, vence-hoy y futuro;
- controles de saldo cero/negativo y tipos positivos excluidos;
- `anticipos_cliente`, saldo RA total/positivo/negativo, conteos por signo,
  `anticipos_cliente_vinculados` y `cobertura_aplicacion_anticipos`;
- el mismo resumen por sucursal, sin nombres ni códigos de clientes.

El panel debe mostrar corte y cobertura. Si no hay carga completa, el estado es
sin datos, no cero. No debe mezclar cargas, monedas, NCC/RA ni microdatos para
recomponer el KPI.

### Contrato de escritura

1. `totvs_iniciar_cxc_carga_v1(metadata)` recibe nombre, SHA-256, tamaño,
   `fecha_corte` confirmada y `corte_evidencia=USER_CONFIRMED`. Devuelve
   `carga_id`, estado, reutilización, versión y carga reemplazada.
2. Si devuelve `COMPLETA`, termina idempotentemente. En otro estado abierto,
   procesa lotes de hasta 500 primero con
   `totvs_importar_cxc_lote_v1(id,'validate',filas)` y luego con `import`.
3. `totvs_finalizar_cxc_carga_v1(id,controles)` recalcula saldo, población,
   vencido, vence-hoy, futuro, exclusiones y controles RA. Solo una conciliación
   exacta promueve la carga a `COMPLETA`.
4. `totvs_cancelar_cxc_carga_v1(id)` desvincula el snapshot fallido y elimina
   únicamente documentos huérfanos de ese SHA.

## Límites

La validación es local con el archivo real y fixtures; no acredita la base ni
los permisos productivos, y el panel no fue modificado. Una futura política de
aplicación de RA/NCC requiere una relación fuente auditable antes de cambiar el
detalle de conciliación; no puede deducirse del signo, del cliente ni de
`VALOR-SALDO`. Esa ausencia no impide calcular mora con el `SALDO` NF actual ni
autoriza descontar RA por segunda vez.
