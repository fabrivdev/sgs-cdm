-- Preflight: ambas firmas deben estar ausentes; detener ante un candidato previo.
SELECT to_regprocedure('public.campi_clientes_cohortes_v1(date,date,date,date)') AS firma_anterior,to_regprocedure('public.campi_clientes_cohortes_v1(date,date,date,date,text)') AS propuesta;
SELECT p.oid::regprocedure,p.proacl,p.prosecdef,p.proconfig FROM pg_proc p WHERE p.oid IN ('public.gerencial_clientes_resumen_v1(date,date,date,date,text)'::regprocedure,'public.gerencial_clientes_movimientos_posventa_v1(date,date)'::regprocedure);
-- Validar por cuentas reales autorizadas/restringidas. No impersonar usuarios. Comparar IDs y reglas de fuente, no sólo cardinalidades.

-- POST aplicación: ejecutar bajo cuenta autorizada, en período acordado. Sin exponer IDs.
WITH fechas AS (SELECT date_trunc('month',current_date)::date AS desde,current_date AS hasta,
 (date_trunc('month',current_date)-interval '1 month')::date AS prev_desde,(current_date-interval '1 month')::date AS prev_hasta),
 candidato AS (SELECT campi_clientes_cohortes_v1(desde,hasta,prev_desde,prev_hasta,'TODAS') AS d FROM fechas),
 vigente AS (SELECT r.* FROM fechas CROSS JOIN LATERAL gerencial_clientes_resumen_v1(desde,hasta,prev_desde,prev_hasta,'TODAS') r)
SELECT d IS NOT NULL AS autorizado, jsonb_array_length(d->'cohorte_base')=compradores_base AS base_coincide,
 jsonb_array_length(d->'retenidos')=compradores_retenidos AS retencion_coincide,
 jsonb_array_length(d->'propietarios')=propietarios_elegibles AS propietarios_coinciden,
 jsonb_array_length(d->'propietarios_con_compra')=propietarios_con_compra_actual AS cobertura_coincide
FROM candidato CROSS JOIN vigente;
-- Cero filas NO equivale a prueba aprobada: indica ausencia de autorización/resumen.
-- Estas cardinalidades complementan, no reemplazan, pruebas de identidad/semántica y roles.
