# Optimización de lotes del Libro Mayor — 23/10/2026

La migración `20261023130000_optimize_totvs_mayor_batch_lookups.sql` registra la definición ya aplicada de `public.totvs_importar_mayor_lote_v1(uuid,text,jsonb)`. Esta incorporación al repositorio no vuelve a ejecutar SQL en producción.

Materializa las versiones de las claves del lote una sola vez y calcula conflictos mediante conjuntos. Conserva la comparación de huella completa, versiones, cuarentena, validación, persistencia y límite de 500 filas. No cambia datos existentes, índices, timeout, permisos ni RLS. `CREATE OR REPLACE` conserva OID, propietario, ACL y configuración de la función.

El cuerpo anterior esperado tiene MD5 `d03ed4b29f9c5304d3e91b7ec1703ee5`; el final aplicado, `48bf0443eccd2a37f1c71104292f45f3`. La migración no hace nada si ya encuentra el final y aborta ante otra definición. SHA256 del archivo recibido, comprobado antes de normalización de finales de línea por Git: `d363cda0466eadacb4d80b104c3195caccdaef94bb921f8caeb8770d58c8e84f`. Se conserva sin modificar su encabezado histórico de revisión; ese encabezado no describe el estado de aplicación actual.

## Evidencia y límites

El registro de aplicación de la tarea confirma la ejecución transaccional y el hash final consultado después, preservando propietario, ACL, SECURITY DEFINER y search_path. El usuario confirmó posteriormente una carga manual COMPLETA: 35.849 filas, vínculos y claves, rango 01/07–20/10/2026, cuatro netos de control en cero. Esto acredita ese archivo; no garantiza cualquier volumen o concurrencia. No se incluyen archivos de carga, rutas personales, identificadores de cargas ni credenciales.

El benchmark sintético previo usó PGlite 0.5.8 / PostgreSQL WASM, 40.789 movimientos y 566.672 vínculos iniciales. El candidato final pasó 14 comparaciones semánticas; dos fotos de 71 lotes tuvieron máximos validate de 84,26/92,90 ms e import de 127,38/106,50 ms. Son mediciones locales, no un SLA productivo. El candidato inicial no resolvía el crecimiento de la consulta correlacionada de conflictos y no se incorpora.

PGlite no hizo cumplir statement_timeout de 8 s y no prueba contención entre sesiones, disco ni caché física fría. El intento PostgreSQL nativo quedó bloqueado por EACCES en loopback: no se declara pasado. La carga manual exitosa aporta evidencia productiva separada del benchmark.

## Regresión reproducible

Validación de integración: PASS, 14 comparaciones diferenciales, 13 controles baseline y 17 optimizados. Sintaxis Node y git diff --check verificados; no se repitió el benchmark ampliado ni el intento nativo.

Ejecutar `node scripts/test-mayor-batch-lookups.cjs` desde el repositorio con dependencias instaladas. Crea dos bases PGlite efímeras, sin red ni conexión productiva. Compara original y optimizada, validación sin escrituras, repetición de lote, conflictos, cuarentena, permisos, propiedad de carga, colisión de hash modelada, rechazo por drift, repetición de migración y restauración de la definición original. Comprueba hashes, OID, propietario, ACL, SECURITY DEFINER, volatilidad y configuración. Solo usa fixtures sintéticos.

La restauración en la prueba recupera pg_get_functiondef del baseline de esa base efímera. El rollback productivo exacto permanece en las evidencias operativas externas al repositorio; no se ejecuta ni se incorpora como migración automática. Cualquier reversión real requiere revisar la definición vigente y preservar su contexto.
