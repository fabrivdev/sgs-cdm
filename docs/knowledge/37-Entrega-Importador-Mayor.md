# Entrega local del importador de Libro Mayor

Estado: preparado localmente; no aplicado a Supabase/Lovable, no publicado y no
subido al repositorio remoto.

## Identidad de los artefactos

| Orden | Archivo | Bytes | SHA-256 |
|---|---|---:|---|
| 1 | `20261006130000_import_totvs_mayor_staging.sql` | 22.876 | `a9fa2f70931795ff34c32074afe84a4e00c26431503914d54c5195665c0233c3` |
| 2 | `20261006131000_seed_totvs_mayor_clasificacion_preliminar.sql` | 69.808 | `158736b3768d55721ae0dd14dd8e10978101e9d9cc6fe696379bdbbebd5f36b2` |

Fuente contable verificada: `mayor_contable_2_monedas_140624.xml`, 47.257.141
bytes, SHA-256
`30f611ca259bb22ce93b64b08ae99e3b5749ebb8d0f894e4094c00dcbeb7c2ef`.
El archivo no forma parte del paquete y no debe subirse.

El mapa preliminar usado para el segundo SQL tiene SHA-256
`bcb5f334e2f3186d981e06d90caaa47646b42c3ff72c2d6d1bdeb2fd34b916ff`.
El hash queda grabado en cada fila como origen.

## Flujo end-to-end preparado

La interfaz ya no queda en `Simular` solamente:

1. `Leer archivos` ejecuta el preflight streaming y no escribe.
2. `Confirmar importacion` aparece tambien cuando el Mayor es la unica fuente.
3. El cliente calcula SHA-256, inicia una carga auditada y vuelve a recorrer el
   XML en lotes de hasta 500.
4. Cada lote llama primero `validate` y luego `import`.
5. La finalizacion compara filas, aperturas, cuarentena, TPSLDO 1/9 y netos
   PYG/USD contra el preflight.
6. Ante un error anterior a `COMPLETA`, el cliente llama la cancelacion
   compensatoria. Se quita el vinculo de esa carga y solo se eliminan
   movimientos que hayan quedado huerfanos.

El adaptador nuevo es `src/lib/imports/mayorPersist.ts`; el parser streaming
permanece en `src/lib/imports/mayorPreflight.ts`. Los importadores existentes no
cambian sus RPC, lotes ni orden interno. Si se confirman varias fuentes juntas,
el Mayor se procesa primero; la atomicidad es por carga del Mayor, no una
transaccion global que abarque todos los importadores HTTP.

## Idempotencia, conflicto y reimportacion

- Identidad del movimiento:
  `SUCURS+FECHA+LOTE+SUBLOTE+DOCUMENTO+LINEA`.
- Misma clave y misma huella: no crea otro movimiento; la nueva carga queda
  vinculada y contabiliza la fila como `sin_cambios`.
- Misma clave con otra huella: el lote se rechaza con conflicto, no actualiza ni
  pisa el movimiento anterior.
- La vista deduplica primero `movimiento_id` entre cargas completas, por lo que
  reimportar el mismo archivo no duplica saldos.
- Las filas totalizadoras no entran al staging.
- `TPSLDO=9` se conserva y consulta separado de `TPSLDO=1`.

## Clasificacion y visibilidad

El segundo SQL no aprueba el mapa:

- 217 cuentas quedan `PROPUESTA` y excluidas de KPI definitivos.
- 34 cuentas quedan `REVISION` y visibles como tales.
- `CLARA` queda reservada para una nueva version con usuario y fecha de
  aprobacion.
- Las dos filas sin cuenta quedan `SIN_MAPEO`, en
  `totvs_mayor_cuarentena`, y siguen incluidas en conciliacion y montos
  excluidos.
- Septiembre queda `PROVISIONAL_CIERRE_POR_CONFIRMAR`; esto no afirma que este
  cerrado. Octubre queda `PARCIAL`. Julio y agosto siguen `SIN_CONFIRMAR`.

Gerencia solo accede mediante `totvs_consultar_mayor_resumen_v1`; el detalle
crudo exige `admin.importaciones`. Importar, finalizar y cancelar tambien exigen
`admin.importaciones` y una carga perteneciente al usuario autenticado.

## Validacion final local

- 12/12 pruebas focales pasaron, incluidas confirmacion y cancelacion del
  adaptador de interfaz.
- Typecheck y lint focal pasaron. El componente conserva 19 usos historicos de
  `any` fuera del bloque Mayor.
- El build de produccion completo finalizo correctamente.
- Los dos SQL exactos se aplicaron en PGlite sobre disco y el XML real se
  proceso en 59 lotes: 29.040 validados/importados, cero conflictos y dos
  cuarentenas.
- Resultado agregado: 28.890 filas `PROPUESTA`, 148 movimientos pertenecientes
  a las 34 cuentas `REVISION` y dos filas `SIN_MAPEO` en cuarentena.
- `TPSLDO=1`: 28.962 filas y neto de control cero. `TPSLDO=9`: 78 filas,
  -317.006.879 PYG y -53.428,63 USD, sin mezclarse con tipo 1.
- El RPC completo devolvio 2.191 grupos y 1.177.130 bytes en 0,625 s. La corrida
  completa tomo 27,388 s; pico observado 438,9 MiB RSS y 69,5 MiB de heap.

Esta es validacion de codigo, SQL y datos en un entorno local aislado. No incluye
validacion visual del navegador ni ejecucion en el proyecto Lovable real.

## Orden de integracion en el editor de base del proyecto Lovable

Antes de ejecutar, comprobar visualmente el nombre/ref del proyecto y confirmar
que no sea produccion si aun se esta ensayando.

1. Abrir el editor SQL del proyecto correcto.
2. Copiar sin modificaciones el archivo de orden 1, verificar su SHA-256 y
   ejecutar una sola vez.
3. Revisar que la transaccion termine correctamente. No continuar si aparece un
   error de permisos, objeto existente o constraint.
4. Copiar el archivo de orden 2, verificar su SHA-256 y ejecutar. Su bloque de
   control aborta si no quedan exactamente 251 filas: 217 `PROPUESTA` y 34
   `REVISION`.
5. Integrar despues el codigo de interfaz/adaptador. La interfaz detecta
   `PGRST202/42883` y avisa si el codigo se desplego antes que las funciones SQL.
6. Con un usuario que posea `admin.importaciones`, hacer primero `Leer archivos`,
   revisar los controles y recien entonces `Confirmar importacion`.

Consultas de control sin exponer asientos:

```sql
select estado, filas_vinculadas, filas_cuarentena, filas_apertura,
       filas_tpsldo_1, filas_tpsldo_9,
       neto_tpsldo_1_pyg, neto_tpsldo_1_usd,
       neto_tpsldo_9_pyg, neto_tpsldo_9_usd
from public.totvs_mayor_cargas
order by creado_en desc
limit 5;

select clasificacion_estado, tipo_saldo, sum(filas) as filas,
       sum(importe_excluido_pyg) as excluido_pyg,
       sum(importe_excluido_usd) as excluido_usd,
       sum(filas_cuarentena) as cuarentena
from public.totvs_mayor_resumen_agregado
group by clasificacion_estado, tipo_saldo
order by tipo_saldo, clasificacion_estado;
```

No habilitar EBITDA, margen final ni ROA a partir de esta entrega. Primero deben
aprobarse las versiones de cuentas necesarias y resolverse las dos cuarentenas.
