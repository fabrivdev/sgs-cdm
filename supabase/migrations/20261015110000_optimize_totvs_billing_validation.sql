-- Only lookup plans change. Business rules, permissions, rollback validation and timeouts remain intact.
BEGIN;
CREATE INDEX IF NOT EXISTS facturacion_totvs_origen_normalizado_idx ON public.facturacion_lineas_importadas (upper(btrim(origen_sistema)));
CREATE INDEX IF NOT EXISTS facturacion_dedupe_descartada_canonica_idx ON public.facturacion_dedupe_repair_pairs (linea_descartada_id,linea_canonica_id);
DO $optimize$
DECLARE cfg jsonb; patch jsonb; def text; anchor text;
 marker constant text := '/* totvs_billing_lookup_performance_v1 */';
 pattern constant text := 'ON public\.facturacion_totvs_identidad\(\s*f\.origen_sistema,';
BEGIN
 FOR cfg IN SELECT value FROM jsonb_array_elements($config$[{"name": "facturacion_importar_totvs_lote_v1", "matches": 2, "patches": [{"anchor": "DROP TABLE IF EXISTS pg_temp.tc_totvs_grupo_servicio_candidatas;", "insert": "ANALYZE pg_temp.tc_totvs_grupo_servicio_entrada;"}, {"anchor": "DROP TABLE IF EXISTS pg_temp.tc_totvs_grupo_servicio_elegibles;", "insert": "CREATE INDEX ON pg_temp.tc_totvs_grupo_servicio_candidatas(identidad,id); ANALYZE pg_temp.tc_totvs_grupo_servicio_candidatas;"}, {"anchor": "DROP TABLE IF EXISTS pg_temp.tc_totvs_grupo_servicio_destinos;", "insert": "CREATE INDEX ON pg_temp.tc_totvs_grupo_servicio_elegibles(identidad); ANALYZE pg_temp.tc_totvs_grupo_servicio_elegibles;"}, {"anchor": "DROP TABLE IF EXISTS pg_temp.tc_totvs_procedencia_candidatas;", "insert": "ANALYZE pg_temp.tc_totvs_procedencia_entrada;"}, {"anchor": "DROP TABLE IF EXISTS pg_temp.tc_totvs_procedencia_elegibles;", "insert": "CREATE INDEX ON pg_temp.tc_totvs_procedencia_candidatas(identidad,id); ANALYZE pg_temp.tc_totvs_procedencia_candidatas;"}, {"anchor": "DROP TABLE IF EXISTS pg_temp.tc_totvs_procedencia_destinos;", "insert": "CREATE INDEX ON pg_temp.tc_totvs_procedencia_elegibles(identidad); ANALYZE pg_temp.tc_totvs_procedencia_elegibles;"}]}, {"name": "facturacion_importar_totvs_lote_core_consolidacion_v1", "matches": 1, "patches": [{"anchor": "CREATE TEMP TABLE tmp_facturacion_totvs_candidatas ON COMMIT DROP AS", "insert": "ANALYZE pg_temp.tmp_facturacion_totvs_unicas;"}, {"anchor": "CREATE TEMP TABLE tmp_facturacion_totvs_elegibles ON COMMIT DROP AS", "insert": "CREATE INDEX ON pg_temp.tmp_facturacion_totvs_candidatas(identidad,id); ANALYZE pg_temp.tmp_facturacion_totvs_candidatas;"}, {"anchor": "CREATE TEMP TABLE tmp_facturacion_totvs_destinos ON COMMIT DROP AS", "insert": "CREATE INDEX ON pg_temp.tmp_facturacion_totvs_elegibles(identidad); ANALYZE pg_temp.tmp_facturacion_totvs_elegibles;"}]}, {"name": "facturacion_importar_totvs_lote_core_group_enrichment_v1", "matches": 1, "patches": [{"anchor": "DROP TABLE IF EXISTS pg_temp.tc_facturacion_procedencia_destinos;", "insert": "ANALYZE pg_temp.tc_facturacion_procedencia_entrada;"}]}]$config$::jsonb) LOOP
  SELECT pg_get_functiondef(to_regprocedure('public.'||(cfg->>'name')||'(jsonb,jsonb,jsonb,date,date,boolean)')) INTO def;
  IF def IS NULL THEN RAISE EXCEPTION 'Falta función requerida: %',cfg->>'name'; END IF;
  IF position(marker IN def)>0 THEN CONTINUE; END IF;
  IF (SELECT count(*) FROM regexp_matches(def,pattern,'g'))<>(cfg->>'matches')::integer THEN
   RAISE EXCEPTION 'Cambió la búsqueda de identidad en %; revisar antes de aplicar',cfg->>'name';
  END IF;
  def:=regexp_replace(def,pattern,
   'ON upper(btrim(f.origen_sistema)) IN (''NEW_XML_FACTURACION_DIRECTA'',''NEW_XML_FACTURACION_OS'',''NEW_XML_FACTURACION'') '||marker||E'\n AND public.facturacion_totvs_identidad(f.origen_sistema,','g');
  FOR patch IN SELECT value FROM jsonb_array_elements(cfg->'patches') LOOP
   anchor:=patch->>'anchor';
   IF (length(def)-length(replace(def,anchor,'')))/length(anchor)<>1 THEN
    RAISE EXCEPTION 'Ancla ambigua en %: %',cfg->>'name',anchor;
   END IF;
   def:=replace(def,anchor,(patch->>'insert')||E'\n '||anchor);
  END LOOP;
  EXECUTE def;
 END LOOP;
END;
$optimize$;
NOTIFY pgrst,'reload schema';
COMMIT;
