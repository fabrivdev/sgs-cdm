# Conciliación del Dashboard con Ventas

## Regla monetaria

El total de postventa sin filtros es Ventas de Servicios + Ventas de Repuestos.
Servicios incluye MO, kilometraje, repuestos de OS y terceros. Repuestos incluye
las ventas fuera de OS. No mezclar ese total con Máquinas u Otros.

- Hasta 30/06/2026: MO/Km/Terceros de `facturacion`, sin exclusiones por encontrar
  un repuesto de la misma factura. Los repuestos provienen de
  `v_ventas_repuestos_historico_completo`, incluyendo devoluciones/NC con signo.
- Desde 01/07/2026: `ventas_area_movimientos_base`, como en Ventas.
- Sólo USD o moneda NULL (importaciones anteriores). No sumar ni convertir GS.
- No cambiar importes, cantidades o vínculos operativos para conciliar.

## GRID no es una segunda venta

Las filas GRID originales y el registro de duplicados se conservan. Sólo se usa
el tipo de tiempo como metadato inferido de una línea canónica:

1. Relación archivada existente, con igualdad de importe/cantidad/fecha/cliente/sucursal.
2. Pendiente con un único destino y un único origen: mismo documento, artículo,
   fecha, cliente, sucursal, cantidad e importe (tolerancia 0,01).
3. Un destino ya reclamado por GRID archivado no recibe otro pendiente.
4. La unión de metadatos devuelve como máximo una fila por canónica. Tipos en
   conflicto no se imponen. Pendientes ambiguos/no encontrados no se fuerzan.

No trasladar el tipo de un repuesto a toda la factura o una OS. La clasificación
inferida no sustituye las correcciones de Comisiones. El resumen clásico de
Servicios sin puente verificable con OS conserva tipo **No informado**, no Cliente
por defecto. Esta migración no cambia Ventas ni Comisiones.

## Aplicación y verificación

Primero ejecutar en SQL Editor
`20260916160000_reconcile_dashboard_billing_with_sales.sql`. Luego ejecutar
`verificar_conciliacion_dashboard_2026.sql`: controla por ID, cantidad de filas e
importe antes de agrupar por mes/componente. Las diferencias compensadas también
deben detectarse. Sólo entonces publicar el frontend que consume el nuevo RPC.

La consulta SQL valida la fuente desplegada, no sólo una simulación. No sustituye
la prueba en pantalla de filtros y tiempos de respuesta en la base real. El RPC
exige acceso a `servicios.dashboard`; la fuente interna no es ejecutable por
`authenticated` ni `anon`. Un error no vuelve a la suma anterior ni publica un
resultado parcial como si estuviera completo.

El dashboard separa Terceros en filtro, mix, tabla por período y exportación. El
filtro predeterminado contiene los cuatro rubros de postventa; Máquinas/Otros
siguen disponibles como selección explícita.

## Carga sin recalcular cada página

Aplicar también `20260916170000_dashboard_billing_single_evaluation.sql`.
El nuevo RPC `dashboard_facturacion_lote_v1` devuelve un JSON escalar con todas
las filas y su cantidad. Evalúa una sola vez la fuente conciliada por año,
incluido el año anterior para comparaciones. No se pagina el resultado tabular
del reporte, ya que eso repetía el cálculo anual por cada 1.000 registros.
Dos consultas como máximo en paralelo. Plazo total del cliente: 45 segundos,
con cancelación del transporte al vencer, desmontar o cambiar el rango.
Un fallo o lote incompleto invalida toda la carga, sin cachear cifras parciales.
Los índices de `id::text` aceleran los cruces que no podían usar la PK UUID.
No cambia la fuente, los importes ni el uso de GRID. El tiempo real de la base
debe medirse después de aplicar este SQL; los tests locales no prueban su SLA.

## Pruebas locales de carga

`cargarFacturacion.test.ts`: más de 1.000 movimientos, una llamada por año,
fronteras, rango inválido, lote incompleto, fallos, cancelación y límite de espera.

`src/components/dashboard/facturacionSource.test.ts`: normalización, signo de NC,
rubros explícitos, desconocidos y procedencia de GRID.

`scripts/test-dashboard-reconciliation.mjs`: migración completa en PostgreSQL
aislado (PGlite), fixtures de duplicados, NC, fronteras de fechas, GRID huérfano,
pendientes ambiguos, conflictos, permisos e idempotencia. No usa credenciales ni
se conecta a Supabase. Se ejecuta con un módulo PGlite local como argumento.

## GRUPO FX del histórico y Otros comerciales

Aplicar `20260916180000_respect_historical_group_fx_and_commercial_others.sql`
después de la fuente conciliada de 20260916160000. No requiere reimportar ni
modifica filas originales, OS, jornadas, ajustes de Comisiones, stock o vínculos.

El histórico clásico clasifica **MANO DE OBRA** y **KILOMETRAJE** exclusivamente
por `grupo_fx`, tolerando espacios y mayúsculas. `SERVICIOS - OTROS` / `SERVICE`
en el grupo general no son evidencia de MO cuando GRUPO FX está vacío.
Los demás conceptos no comerciales de esa hoja quedan en Otros, incluidos los
descuentos con signo negativo. Un tipo de tiempo **No informado** sigue siendo
independiente del rubro: la MO histórica con GRUPO FX correcto no se excluye.

Ejemplo original: Fact. Servicios, fila 9741, factura 181925 de 05/01/2026,
artículo 27025, COSTO DE ENVIO, importe 1, grupo SERVICIOS - OTROS y GRUPO FX
vacío. No es MO ni una OS pendiente de vinculación. La hoja de Servicios del
archivo suministrado tiene 195 filas de COSTO DE ENVIO en 2026, por 1.684,48;
esta suma del archivo no sustituye el control de la base desplegada.

La vista detallada de la hoja de Repuestos conserva todas sus líneas y añade
`concepto`. Los grupos de merchandising y las descripciones explícitas de
envíos/intereses se clasifican Otros. Ventas de Repuestos toma sólo Repuestos;
Dashboard toma ambas clases, conservando el mismo ID/importe de cada línea.
El resumen clásico de esa hoja (`tipo=Repuesto`) no se vuelve a sumar, tampoco
cuando el resumen ya dice Otros. Los artículos sin catálogo siguen en Repuestos.
GRID se conserva como metadato, nunca como una segunda venta.

En el sistema nuevo los conceptos explícitos de envío/intereses/merchandising
se separan antes de clasificar por OS. El vínculo documental se conserva;
Otros no entra en Servicios por el mero hecho de tener OS. Terceros sigue como
Terceros dentro de Servicios cuando está vinculado a OS. Máquinas conserva su
clasificación por código/estructura y no se alteran sus reportes comerciales.

El total de **postventa** debe bajar por los conceptos trasladados a Otros; no
forzarlo al valor anterior incorrecto. Los importes siguen disponibles al
seleccionar Otros en Dashboard. Comparar con Ventas usando los mismos rubros,
fechas, moneda y sucursales. Tras aplicar, recargar la app para descartar cachés.

Verificación: `verificar_clasificacion_comercial_2026.sql` para la factura 181925
y `verificar_conciliacion_dashboard_2026.sql` para los 66 controles por ID/mes/rubro.
`scripts/test-historical-commercial-classification.mjs` ejecuta las fuentes SQL
reales en PostgreSQL aislado, reproduce el envío de 1 y prueba rubros, NC,
Otros con OS, Terceros, piezas sin catálogo, ausencia de duplicación de resumen,
conservación de filas originales, permisos, filtros e idempotencia. El desempeño
y los valores reales se verifican después de aplicar, no mediante esta fixture.
