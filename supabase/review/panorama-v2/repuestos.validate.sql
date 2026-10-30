-- Ejecutar sólo en sesión autorizada; no simular JWT/roles en producción.
SELECT p.oid::regprocedure, md5(pg_get_functiondef(p.oid)) AS hash_cuerpo,p.prosecdef,p.proconfig,p.proacl FROM pg_proc p WHERE p.oid='public.campi_repuestos_exposicion_v1()'::regprocedure;
-- Capturar respuesta previa y posterior bajo la misma cuenta y corte; comparar todos los campos anteriores, excluyendo únicamente los nuevos. No se ejecutó aquí la consulta de datos.

-- POST: una única evaluación del RPC. No ejecutar mientras la consulta previa de Stock siga incierta.
WITH r AS MATERIALIZED (SELECT campi_repuestos_exposicion_v1() AS d)
SELECT (SELECT sum((v->>'valor_usd')::numeric) FROM jsonb_array_elements(d->'tramos_compra') v) AS suma_tramos,
 (d->>'valor_antiguo_usd')::numeric AS kpi_antiguo,
 NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d->'transiciones') v WHERE (v->>'dias_hasta')::int NOT BETWEEN 1 AND 30) AS dias_validos,
 (SELECT count(*)=count(DISTINCT v->>'codigo') FROM jsonb_array_elements(d->'transiciones') v) AS codigos_unicos,
 jsonb_typeof(d->'candidatos_30d')='array' AS fichas_presentes,
 (SELECT count(*) FROM jsonb_array_elements(d->'candidatos_30d') v) =
   (SELECT sum((v->>'codigos')::integer) FROM jsonb_array_elements(d->'avisos') v) AS fichas_concilian_codigos,
 coalesce((SELECT sum((v->>'valor_usd')::numeric) FROM jsonb_array_elements(d->'candidatos_30d') v),0) =
   coalesce((SELECT sum((v->>'valor_usd')::numeric) FROM jsonb_array_elements(d->'avisos') v),0) AS fichas_concilian_usd,
 NOT EXISTS (SELECT 1 FROM jsonb_array_elements(d->'avisos') a WHERE
   (a->>'codigos')::integer <> (SELECT count(*) FROM jsonb_array_elements(d->'candidatos_30d') c WHERE c->>'destino'=a->>'destino')
   OR (a->>'valor_usd')::numeric <> coalesce((SELECT sum((c->>'valor_usd')::numeric) FROM jsonb_array_elements(d->'candidatos_30d') c WHERE c->>'destino'=a->>'destino'),0)
 ) AS fichas_concilian_por_destino,
 NOT EXISTS (SELECT 1 FROM jsonb_array_elements(d->'candidatos_30d') v WHERE
   (v->>'color_actual',v->>'destino') NOT IN (('LILA','GRIS'),('GRIS','ROJO'))
   OR (v->>'dias_hasta')::integer NOT BETWEEN 1 AND 30
   OR (v->>'dias_compra')::integer + (v->>'dias_hasta')::integer <> CASE WHEN v->>'destino'='GRIS' THEN 366 ELSE 1001 END
   OR (v->>'unidades_anio_actual')::numeric <> 0 OR (v->>'unidades_anio_anterior')::numeric <> 0
   OR (v->>'unidades_hace_dos_anios')::numeric <> 0) AS fichas_respetan_regla
FROM r;
-- Para esta propuesta nueva, comparar JSON previo quitando tramos_compra,
-- transiciones y candidatos_30d. Conservar fecha_analisis, avisos y totales.
-- Además: conciliar cantidades e importes por destino contra cada aviso.
-- No confundir ultima_carga_kardex con corte físico. Revisar EXPLAIN sin ANALYZE antes de prueba de datos costosa.
