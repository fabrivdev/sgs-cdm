# Facturación adicional de Panorama — preparación local

## Resultado y contrato
Cuatro categorías visibles: Repuestos, Servicios, Máquinas y Otros. Otros suma todo el complemento de las tres áreas canónicas, incluidos activos fijos, conceptos desconocidos y movimientos pendientes de clasificación. No hay una lista cerrada de ventas permitidas dentro de Otros. Las subdivisiones internas `otros`, `sin_clasificar` y `revision` sólo sirven para conservar controles, nunca se muestran como categorías públicas.

El puente utiliza componentes numéricos estables, no etiquetas de texto: bruto + NC firmadas = neto. Precisión interna intacta; USD se presenta sin decimales. Otros tiene el mismo control de filtro individual/desfiltro que las tres áreas; al desfiltrar vuelve el total combinado autorizado. No se añade selección múltiple arbitraria.

## Fuente y límites
La nueva función usa `ventas_area_movimientos_base` con rangos y complemento excluyente; para el histórico sustituye resúmenes legacy de tipo Repuesto por líneas de `v_ventas_repuestos_historico_completo` de conceptos distintos de Repuestos hasta junio de 2026. No sustituye la fuente histórica canónica de máquinas por el dashboard general. No usa resta de totales de fuentes incongruentes.

Se validan identidad de línea, meses completos de respuesta, rangos, signos, suma mensual, suma de categorías y bruto/NC/neto. Una identidad duplicada o control inválido bloquea sólo Otros. La identidad documental se hereda de los contratos canónicos: el control cuenta IDs de línea, no demuestra por sí mismo ausencia de duplicados comerciales con IDs diferentes entre fuentes. La cobertura es de registros USD fechados observados, no certificación de completitud de importaciones o toda moneda. No hay montos reales de Otros verificados aún. Antes de activar como cobertura completa se debe conciliar una lectura autorizada contra los contratos existentes, especialmente histórico y duplicados comerciales. Las pruebas sintéticas no acreditan eso ni rendimiento productivo.

## Seguridad y activación pendiente
Archivo preparado, NO ejecutado: `supabase/migrations/20261029190000_campi_additional_billing.sql`.
Única función nueva: `public.campi_facturacion_adicional_v1(date,date)`, STABLE SECURITY DEFINER, search_path pg_catalog,public,pg_temp, rango máximo 367 días y límite de sentencia 20 segundos propio. Comprueba auth.uid y el permiso existente `servicios.dashboard`, igual al dashboard de facturación. Ese identificador fue retirado de navegación pero sus grants existentes se conservaron; se tipa como legado sin crear sección, rol, grant de sección ni remapearlo a ventas. Sin permiso existente no se consulta.

La instalación requiere aprobación específica de esta función y sus ACL: revocar EXECUTE de PUBLIC, anon y service_role sólo para esa firma; permitir authenticated con control interno. Propietario debe verificarse como propietario confiable de funciones canónicas, sin ampliar roles. La transacción rechaza sobrescribir una función existente. No cambia RLS, tablas, índices, datos de negocio ni otras funciones. No instalar automáticamente todas las migraciones del checkout.

El consumidor ya está conectado bajo disponibilidad: falta de función, permiso, timeout o controles inválidos conserva las tres áreas y marca cobertura parcial; Otros queda deshabilitado y nunca se representa como cero. No cambia los cuatro temas guardados. Instalación sola no acredita conciliación real ni rendimiento.

## Verificación local
Vitest cubre mes/acumulado, conservación, categorías desconocidas, falta de RPC/permisos, períodos incompletos, duplicados, filtro/desfiltro y puente independiente de etiquetas. SQL ejecutado sólo en PGlite aislado con datos sintéticos: complemento, NC, límite junio/julio, particiones, rechazo de acceso y ACL. Navegador Fabrizio confirma fuente adicional ausente con cobertura parcial y puente operativo; el tema Evolución no está entre sus cuatro seleccionados, por lo que el control se verifica por componente sin guardar otras preferencias.


## Activación autorizada y verificada — 29/10/2026
La sección de preparación anterior describe el estado previo. Se instaló exclusivamente la migración aprobada SHA256 `5C329846349D8053A339F6C3F82E36E9E52F29B41EA7E61E9FD2B33A2BB67D4E` en SIG CDM, proyecto `7c439c1a-a281-4122-938b-166c9a77b41b`, mediante editor SQL visible. Preflight: firma inexistente, funciones canónicas y editor con propietario postgres. Transacción: Query succeeded. Lectura posterior confirmó firma, propietario postgres, STABLE, SECURITY DEFINER, search_path y límite 20s; authenticated=true, anon=false, service_role=false, PUBLIC=false. MD5 de prosrc `e2e0998a7728f00a6975435800dac1ab`, igual al cuerpo local normalizado LF. Hubo un error de conexión en la primera lectura de metadatos; se repitió sólo esa lectura, nunca el DDL.

La lectura autenticada y la conciliación por fuentes se verificaron durante la instalación autorizada. Se omiten aquí los importes y resultados comerciales privados; no son constantes del runtime.

Límites: unicidad de IDs no es prueba universal de ausencia de documentos duplicados con IDs distintos. No se certificó completitud de todas las importaciones ni monedas ajenas al contrato USD. Se conservó fuente canónica histórica de máquinas. No se alteraron facturas, RLS, otras funciones, preferencias, frontend publicado ni Git remoto.

Los filtros y el retorno a las preferencias se verificaron localmente durante esa etapa. No se publican preferencias individuales.
