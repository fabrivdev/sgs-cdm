# Cobertura por rubro: preparación local, sin instalar

## Objeto y alcance exacto para aprobación

Crear únicamente `public.campi_cobertura_rubros_v1(p_hasta date, p_modo text)`; devuelve JSONB, STABLE, SECURITY DEFINER. `p_modo` admite month/ytd; el corte es una fecha. No reemplaza funciones existentes, no crea tablas, índices, triggers, roles ni políticas; sin backfill, sin datos modificados. No reconstruye propietarios históricos.

Archivo: `supabase/migrations/20261029210000_campi_coverage_rubros.sql`.
SHA256: `513F048D8A05B6F8488512FDF20165A8CA6CEA39E17C5C25FA416DBA0B277C24`.

El propietario debe ser el mismo que el de `campi_cobertura_parque_actual_serie_v1(date,text)`; el guard rechaza otro ejecutor y una firma nueva ya existente. `search_path=pg_catalog,public,pg_temp`, `plan_cache_mode=force_custom_plan`. Referencias de tablas/funciones de negocio calificadas con public; auth.uid explícito. No se cambia timeout, RLS ni ACL de otra función.

ACL puntual nueva: EXECUTE para authenticated; revocación de PUBLIC, anon y service_role sólo en esa firma, en la misma transacción que CREATE. El propietario conserva su acceso implícito. Control interno previo a la consulta: identidad no nula, rol admin/gerencia/superadmin, módulo parque salvo superadmin, y sección parque.maquinas para todos. Las expresiones nulas fallan cerradas. No concede acceso por tener únicamente rol authenticated.

## Datos y conservación

Fuente de cláusulas: `supabase/review/panorama-v2/gerencial_clientes_movimientos_posventa_v1.live-reference.sql`, contrato COBERTURA exclusivamente. Conserva exclusiones, fechas y sustitución legacy/TOTVS, incluido el antijoin documental global posjulio. Conserva las reglas de moneda y las conversiones de fecha de esa fuente; no las sustituye por las reglas USD de ventas. No utiliza actividad de OS como compra.

Propietarios: DISTINCT cliente_id del parque actual con activo=true o null, sin IDs nulos. Servicios reúne mano de obra, servicio/servicios y kilometraje; Repuestos reúne repuesto/repuestos. Se agregan netos por propietario y ventana antes de contar. Cada propietario puede estar en ambos rubros; la unión es por identidad, no por suma de conteos.

La función vuelve a leer el contrato canónico, una sola vez para el rango fuente, y compara netos por propietario en cada ventana. Devuelve owners y filas con from/to, nets [cliente_id,repuestos,servicios,canónico], source_mismatches y union_conflicts. No devuelve nombres, contactos ni documentos individuales. Los ceros proceden de ausencia comprobada de movimientos para un propietario del universo completo, no de errores de fuente.

Cada ventana exige dos conservaciones: neto Repuestos+Servicios=neto canónico y unión de compradores por rubro=compradores con neto conjunto positivo. Si una NC cruzada produce +100 en Repuestos y -200 en Servicios, la función informa conflicto; el consumidor no cambia la definición ni habilita los filtros. Esta garantía puede mantenerlos deshabilitados tras instalar: la instalación no certifica que no existan esos casos reales.

## Consumidor preparado

`coverageRubros.ts` valida todas las ventanas, IDs únicos, netos finitos, pertenencia al parque, controles cero, unión y equivalencia contra las identidades y serie vigentes. Requiere todos esos contratos, no sólo un porcentaje coincidente. El gráfico, tasa, conteo y badge usan el mismo conjunto seleccionado; el texto integra Repuestos o Servicios cuando sólo está elegido uno. Selección vacía vuelve al total y ambos rubros cuentan cada propietario una vez. Permisos y usuario se conservan en Dashboard.

Feature gate local: `VITE_CAMPI_COVERAGE_RUBROS_ENABLED=true`. **No está activado**. El loader sólo llama la nueva RPC cuando el gate está encendido y el tema Cobertura está autorizado/solicitado. Retención sola no la consulta. La clave de caché separa el contrato y el gate. Si no hay función, permiso o conciliación, siguen el total/serie existentes y los dos controles deshabilitados. No se añaden avisos técnicos al badge.

## Activación futura (no ejecutada)

1. Verificar proyecto SIG CDM, hash anterior, firma nueva ausente, propietario de serie y definiciones/ACL vigentes. Cotejar la referencia COBERTURA contra producción; ante diferencias materiales detener antes de instalar.
2. Ejecutar exclusivamente este archivo transaccional con autorización específica. No hacer push general de migraciones. Verificar pg_proc, definición, owner, proconfig, proacl y permisos efectivos (incluidas herencias).
3. Ejecutar lectura autorizada con Fabrizio para Mes y Acum., comprobar source_mismatches/union_conflicts cero y conservación con los contratos vigentes. No usar sesión admin como prueba de permisos de usuario.
4. Sólo después habilitar el gate en configuración local de Vite, reiniciar el servidor local y comprobar rubros/ambos/ninguno, serie y badge en la app real. Publicación sigue a cargo del usuario.

Reversión sin datos: apagar gate/reiniciar frontend local restaura inmediatamente el total anterior. Si se autoriza retirar el objeto remoto, usar `supabase/review/panorama-v2/campi_cobertura_rubros_v1.rollback.sql`: DROP de esa única firma con RESTRICT, sin CASCADE. No toca contratos anteriores. No se ejecutó ninguna reversión.

## Pruebas y límites

`node scripts/verify-campi-coverage-rubros.mjs` usa PGlite existente, en memoria y exclusivamente fixtures sintéticos; no conexión ni credenciales remotas. Ejecuta la definición real de referencia y la migración exacta. Pasó fuente canónica, union/NC conflictiva, fechas UTC/Asunción, junio/julio, reemplazo documental, PYG conservado según contrato, nulos, propietarios duplicados/inactivos, roles, ACL, divergencia de fuente y vacío. 87 ms para el conjunto de consultas de esa fixture tras preparar el entorno; no representa rendimiento productivo.

Tests de consumidor cubren gate apagado, activado válido, función ausente, permisos, Retención sin consulta extra, ventanas, duplicados, pertenencia, NC conflictiva, cohorte vacía, series y selección combinada. No se afirma prueba runtime de la función nueva: todavía no existe en remoto. El tipado global conserva cuatro diagnósticos previos fuera de este cambio, documentados en la nota 41.

Cierre local: 99 pruebas de consumidor/UI/regresión pasaron; lint focalizado sin errores; build final pasó en 18,11 s. No se activó el gate ni se ejecutó SQL remoto.

## Activación verificada — 29/10/2026

Instalada únicamente `public.campi_cobertura_rubros_v1(date,text)` en SIG CDM, proyecto `7c439c1a-a281-4122-938b-166c9a77b41b`, con transacción confirmada. Antes de crear: firma inexistente, propietario de serie e instalador postgres, fuente canónica MD5 `eb6bcb9bde23f64d979c9bedbb7a11ae` sin cambios. Después: cuerpo MD5 `01a1090b17a5e016927acc3ae37791c1`, STABLE SECURITY DEFINER, search_path pg_catalog/public/pg_temp y force_custom_plan. ACL exacta postgres + authenticated; EXECUTE efectivo false para anon, service_role y PUBLIC. No se cambiaron tablas, facturas, RLS ni otras funciones.

Lectura desde sesión real Fabrizio mediante cliente existente, sin suplantación. Corte 29/10/2026; denominador 211 propietarios del parque actual.

| Ventana | Repuestos | Servicios | Ambos | Unión | Cobertura unión |
|---|---:|---:|---:|---:|---:|
| 01–29 octubre |31|14|8|37|17,54%|
| 01 enero–29 octubre |153|99|92|160|75,83%|

Validación completa de identidades contra contrato vigente y serie: 6 ventanas mensuales mayo–octubre y 10 acumuladas enero–octubre, todas con source_mismatches=0 y union_conflicts=0. Se preserva regla de neto positivo y tratamiento canónico de NC. Si una lectura futura produce conflicto de unión/netos, el consumidor mantiene el total vigente y no habilita un desglose incompatible. No se afirma que el parque actual sea el parque histórico de cada mes.

Activado únicamente en `.env.local`: `VITE_CAMPI_COVERAGE_RUBROS_ENABLED=true`. En Chrome real Fabrizio se verificó Mes y Acum., Repuestos, Servicios, ambos y deselección; card, gráfico y comentario coinciden. Repuestos mes 14,69%, Servicios 6,64%; acumulados 72,51% y 46,92%. Prueba realizada con recorrido de vista previa sin persistencia; al cerrar se restauraron Facturación neta, Cambios próximos, Retención y Pedidos, en ese orden. Sin publicación ni push.
