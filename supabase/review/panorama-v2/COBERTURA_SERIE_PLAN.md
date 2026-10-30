# Cobertura de posventa: serie aplicada y conciliada (22/10/2026)

Estado verificado en SIG CDM: se creó únicamente
`public.campi_cobertura_parque_actual_serie_v1(date,text)`. La consulta posterior
acreditó `SECURITY DEFINER`, `authenticated` con EXECUTE y `anon` sin EXECUTE.
Los cuerpos vigentes de `gerencial_clientes_resumen_v1` y
`gerencial_clientes_movimientos_posventa_v1` coincidieron con las referencias
locales antes de aplicar la función; la firma nueva no existía. No se modificaron
tablas, registros de negocio ni otras funciones. La publicación del frontend
permanece a cargo del usuario.

Con la sesión administradora real y corte 22/10/2026, el cargador de Panorama
aceptó las dos series: Mes cerró en 31/211 (14,69 %) y Acum. en 160/211
(75,83 %), idénticos a sus respectivos KPIs vigentes. Mes devolvió seis puntos
(mayo-octubre); Acum. diez (enero-octubre). El denominador 211 incluye
plataformas/cabezales, conforme a la conciliación realizada por el usuario.
Numeradores observados, todos sobre 211: Mes mayo-octubre =
72, 68, 52, 56, 57, 31; Acum. enero-octubre =
102, 128, 137, 140, 143, 144, 150, 155, 160, 160.
Queda pendiente probar cuentas reales con permisos restringidos y registrar
tiempos de respuesta bajo carga representativa; el cotejo con una cuenta
administradora no acredita esos permisos.

La tarjeta conserva el KPI de `gerencial_clientes_resumen_v1`. La función instalada
`public.campi_cobertura_parque_actual_serie_v1(date,text)` devuelve JSONB para Mes o Acum.
en una sola lectura de movimientos `COBERTURA`, sobre el mismo conjunto deduplicado de
propietarios actuales que usa el resumen. No accede a la función privada desde el cliente.
El cliente rechaza la serie si cambian denominador, ventana, versión o último numerador
respecto del KPI; ante error conserva el KPI vigente y su estado sin serie.

Lectura real del 22/10/2026 con sesión administradora: el RPC vigente devolvió
31 propietarios con compra de 211 elegibles para Mes (01/10–22/10). La consulta
acotada de Parque leyó 423 máquinas; 406 activas y con propietario produjeron
211 propietarios distintos. Esto concilia el denominador **bajo la regla vigente**,
pero aún no acredita si algún propietario tiene `clientes.activo=false`.
`cobertura_denominador_auditoria.readonly.sql` prepara ese desglose sin IDs.

## Interpretación

- Mes: seis meses consecutivos, compras netas positivas de servicios o repuestos por
  propietario actual en cada mes. La última ventana puede ser parcial.
- Acum.: de enero al cierre de cada mes del año seleccionado, con suma neta por propietario
  en cada ventana; no es suma de porcentajes ni suma de compradores mensuales.
- El denominador es el parque **actual** fijo para todas las barras. No se afirma que fuera
  el mismo parque en esos meses. No se asignan altas/bajas históricas sin corte acreditado.
- El filtro de propietario vigente es `parque_maquinas.activo IS TRUE OR IS NULL` y
  `cliente_id IS NOT NULL`, exactamente como el resumen capturado. No se agregó filtro
  por `clientes.activo` ni exclusión adicional de plataformas: el usuario confirmó
  211 propietarios al incluir plataformas en Clientes del parque.

## Controles previos realizados

1. Se identificó SIG CDM y se guardaron cuerpo, firma, MD5 y ACL actuales de
   `gerencial_clientes_resumen_v1` y `gerencial_clientes_movimientos_posventa_v1`.
   Las dos definiciones coincidieron con `*.live-reference.sql` del repositorio.
2. La firma nueva no existía antes del `CREATE`; el SQL conserva una guarda que falla
   si existe y no reemplaza ninguna función vigente.
3. La autorización se limitó a completar Cobertura. No se publicó la app ni se
   aplicaron otros SQL del paquete Panorama.

## Validación y límites

Con la misma sesión, rol y fecha de corte, se comparó el último numerador/denominador de
`campi_cobertura_parque_actual_serie_v1(hasta,'month')` con
`gerencial_clientes_resumen_v1(inicio_mes,hasta,base_inicio,base_fin,'TODAS')`.
Se repitió con `'ytd'` e inicio de año: 160/211 coincide con el resumen anual.
El cargador verificó orden, ventanas continuas y mes parcial en ambas series.
El parser tiene pruebas de rechazo ante denominador, ventanas o último numerador
inconsistentes. Faltan pruebas con cuentas reales restringidas y validación de
tiempos de respuesta bajo carga representativa; la ACL niega EXECUTE a `anon`,
pero no sustituye esas pruebas. La serie representa la cohorte actual, no cortes
históricos del parque. Entre julio y agosto, el conteo acumulado subió de 150 a 155:
cinco propietarios ingresaron al grupo con neto positivo y ninguno salió. La regla
cuenta propietarios con neto acumulado positivo; si hubiera un descenso futuro,
habría que contrastarlo con los movimientos netos y las notas de crédito.

## Reversión

Si falla alguna validación posterior, deshabilitar su consumo en
frontend y, tras verificar dependencias y autorización, eliminar exclusivamente
`public.campi_cobertura_parque_actual_serie_v1(date,text)`. No revertir el resumen ni
modificar la tabla de propietarios. Se ejecutó únicamente el DDL de creación y
permisos de la función nueva; no se cambió dato de negocio.

Los checks locales de parser usan fixtures sintéticos. Los valores citados arriba
provienen de la sesión real administradora; no certifican cuentas restringidas ni rendimiento.
