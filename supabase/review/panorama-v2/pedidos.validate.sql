-- Ejecutar sólo en sesión autorizada; no simular JWT/roles en producción.
SELECT p.oid::regprocedure, md5(pg_get_functiondef(p.oid)) AS hash_cuerpo,p.prosecdef,p.proconfig,p.proacl FROM pg_proc p WHERE p.oid='public.campi_pedidos_abastecimiento_v1()'::regprocedure;
-- Capturar respuesta previa y posterior bajo la misma cuenta y corte; comparar todos los campos anteriores, excluyendo únicamente los nuevos. No se ejecutó aquí la consulta de datos.

-- POST: una evaluación; comparar también todos los campos vigentes con captura previa.
WITH r AS MATERIALIZED (SELECT campi_pedidos_abastecimiento_v1() AS d)
SELECT jsonb_array_length(d->'pedidos_completos') AS pedidos_clasificados,(d->>'pedidos')::int AS pedidos_vigentes,
 (SELECT sum((v->>'unidades')::numeric) FROM jsonb_array_elements(d->'pedidos_completos') v) AS unidades_clasificadas,
 (d->>'unidades')::numeric AS unidades_vigentes,
 (SELECT count(*) FROM jsonb_array_elements(d->'pedidos_completos') v WHERE v->>'categoria'='No clasificables') AS no_clasificables,
 NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d->'pedidos_completos') v WHERE (v->>'clasificable')::boolean IS DISTINCT FROM (v->>'categoria'<>'No clasificables')) AS contrato_clasificacion
FROM r;
-- Operaciones sin ID, cantidades inválidas o diferencias de universos: detener activación, no forzar conciliación.
