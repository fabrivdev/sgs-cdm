# Validacion local de migraciones TOTVS

Fecha: 2026-10-01. Esta evidencia es exclusivamente local; no acredita despliegue ni ejecucion en produccion.

## Entorno

- PostgreSQL 17.11, binarios portatiles x64 distribuidos por EDB desde el enlace oficial de PostgreSQL para Windows.
- Instancia ligada solo a `127.0.0.1:55439`, sin servicio de Windows, cambios de firewall ni conexiones remotas.
- Base final limpia de validacion: `totvs_validation_v3`.
- Supabase simulado solo con roles `anon` y `authenticated`, `auth.uid()` y las firmas de `has_section_access`/`has_module_access`.

No se reprodujeron GoTrue, JWT reales, PostgREST ni el resto del esquema productivo. La prueba acredita los contratos PostgreSQL, permisos y RLS de estas migraciones, pero no sustituye un ensayo futuro en un proyecto Supabase aislado completo.

## Resultado

Las migraciones `20260930160000` a `20260930190000` se aplicaron dos veces sin errores. El catalogo resultante contiene siete tablas TOTVS con RLS habilitado, siete politicas y ocho RPC.

La matriz sintetica verifico:

- insercion y repeticion idempotente en los siete importadores;
- rechazo de claves duplicadas dentro de cada tipo de lote;
- actualizacion por huella distinta donde corresponde;
- rechazo conservador de una huella contradictoria para la misma clave del Kardex analitico, sin sobrescribir la version existente;
- finalizacion, baja logica y reactivacion de transferencias en transito;
- denegacion sin usuario, permisos de ejecucion `anon`/`authenticated` y filtrado RLS;
- rollback completo de una llamada RPC;
- rollback atomico de una migracion deliberadamente fallida, sin tabla residual.

La primera ejecucion encontro que llamadas repetidas al mismo RPC dentro de una transaccion chocaban con su tabla temporal. Los siete RPC ahora eliminan exclusivamente su propia tabla `pg_temp` antes de recrearla. La matriz completa paso desde una base vacia despues de la correccion.

## Artefactos locales

Los arneses no productivos permanecen fuera del repositorio, en `task-5/postgres-local/`:

- `supabase-shim.sql`
- `totvs-migration-tests.sql`
- `totvs-security-transaction-tests.sql`

No se usaron datos reales ni credenciales existentes y no se conecto a ningun servicio remoto.
