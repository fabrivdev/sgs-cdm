-- Presentation only. Requires 20260918201000. Keep the installed forecast,
-- filters, authorization, coverage formula and complete-export contract.
BEGIN;
DO $migration$
DECLARE
  definition text;
  old_keys text := '''producto_codigo'',''clase'',''stock_global'',''demanda_ponderada_mensual'',''cobertura'',''ultima_venta'',''stock_objetivo'',''sugerencia_unidades''';
  new_keys text := '''marca'',''codigo_fabricante'',''descripcion'',''segmento'',' || old_keys;
  old_text_order text := 'CASE p_orden WHEN ''producto_codigo'' THEN r->>''producto_codigo''';
  new_text_order text := 'CASE p_orden
          WHEN ''marca'' THEN nullif(trim(r->>''marca''),'''')
          WHEN ''codigo_fabricante'' THEN nullif(trim(r->>''codigo_fabricante''),'''')
          WHEN ''descripcion'' THEN nullif(trim(r->>''descripcion''),'''')
          WHEN ''segmento'' THEN nullif(trim(r->>''segmento''),'''')
          WHEN ''producto_codigo'' THEN r->>''producto_codigo''';
BEGIN
  SELECT pg_get_functiondef(to_regprocedure(
    'public.repuestos_sugerencia_viva_ordenada(text,date,text,text,text,boolean,integer,integer,text,text)')) INTO definition;
  IF definition IS NULL OR position('v5_recurrencia_real' IN definition) = 0
    OR position('orden_pos' IN definition) = 0 THEN
    RAISE EXCEPTION 'Falta el motor ordenado reconocido. Ejecutá primero 20260918201000.';
  END IF;
  -- Idempotent: do not extend an unrelated or newer definition by guessing.
  IF position(new_keys IN definition) > 0 THEN RETURN; END IF;
  IF position(old_keys IN definition) = 0 OR position(old_text_order IN definition) = 0
    OR position('concat(r->>''abc'',r->>''fsn'',r->>''xyz'','' '',r->>''segmento'')' IN definition) = 0 THEN
    RAISE EXCEPTION 'Definición de orden no reconocida. No se modificó ninguna función.';
  END IF;
  definition := replace(definition, old_keys, new_keys);
  definition := replace(definition, old_text_order, new_text_order);
  definition := replace(definition,
    'concat(r->>''abc'',r->>''fsn'',r->>''xyz'','' '',r->>''segmento'')',
    'concat(r->>''abc'',r->>''fsn'',r->>''xyz'')');
  EXECUTE definition;
END;
$migration$;
NOTIFY pgrst, 'reload schema';
COMMIT;
