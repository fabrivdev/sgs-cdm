-- Presentation only: copy the installed recurrence engine, retaining its
-- filters, forecast, minimums, access checks and original RPC.
-- Requires 20260918200000 (ventas_orden_natural) and the v5 recurrence engine.
BEGIN;
DO $migration$
DECLARE
  definition text;
  old_order text := E'ORDER BY sugerencia DESC,\n      coalesce((r->>''total_vendido_12m'')::numeric, 0) DESC,\n      r->>''producto_codigo''';
  new_order text := $order$ORDER BY
      CASE WHEN p_direccion = 'asc' THEN
        CASE p_orden
          WHEN 'stock_global' THEN (r->>'stock_global')::numeric
          WHEN 'demanda_ponderada_mensual' THEN (r->>'demanda_ponderada_mensual')::numeric
          WHEN 'stock_objetivo' THEN (r->>'stock_objetivo')::numeric
          WHEN 'sugerencia_unidades' THEN sugerencia::numeric
          WHEN 'cobertura' THEN CASE WHEN (r->>'unidades_12m')::numeric > 0
            THEN greatest(0,(r->>'stock_global')::numeric / ((r->>'unidades_12m')::numeric/12)) END
        END END ASC NULLS LAST,
      CASE WHEN p_direccion = 'desc' THEN
        CASE p_orden
          WHEN 'stock_global' THEN (r->>'stock_global')::numeric
          WHEN 'demanda_ponderada_mensual' THEN (r->>'demanda_ponderada_mensual')::numeric
          WHEN 'stock_objetivo' THEN (r->>'stock_objetivo')::numeric
          WHEN 'sugerencia_unidades' THEN sugerencia::numeric
          WHEN 'cobertura' THEN CASE WHEN (r->>'unidades_12m')::numeric > 0
            THEN greatest(0,(r->>'stock_global')::numeric / ((r->>'unidades_12m')::numeric/12)) END
        END END DESC NULLS LAST,
      CASE WHEN p_orden = 'ultima_venta' AND p_direccion = 'asc' THEN nullif(r->>'ultima_venta','')::date END ASC NULLS LAST,
      CASE WHEN p_orden = 'ultima_venta' AND p_direccion = 'desc' THEN nullif(r->>'ultima_venta','')::date END DESC NULLS LAST,
      CASE WHEN p_direccion = 'asc' THEN public.ventas_orden_natural(
        CASE p_orden WHEN 'producto_codigo' THEN r->>'producto_codigo'
          WHEN 'clase' THEN concat(r->>'abc',r->>'fsn',r->>'xyz',' ',r->>'segmento') END) END COLLATE "C" ASC NULLS LAST,
      CASE WHEN p_direccion = 'desc' THEN public.ventas_orden_natural(
        CASE p_orden WHEN 'producto_codigo' THEN r->>'producto_codigo'
          WHEN 'clase' THEN concat(r->>'abc',r->>'fsn',r->>'xyz',' ',r->>'segmento') END) END COLLATE "C" DESC NULLS LAST,
      public.ventas_orden_natural(r->>'producto_codigo') COLLATE "C", r->>'producto_codigo'$order$;
BEGIN
  SELECT pg_get_functiondef(to_regprocedure(
    'public.repuestos_sugerencia_viva(text,date,text,text,text,boolean,integer,integer)')) INTO definition;
  definition := replace(definition, chr(13), '');
  IF definition IS NULL OR position('v5_recurrencia_real' IN definition)=0
    OR position(old_order IN definition)=0
    OR position('p_offset integer DEFAULT 0)' IN definition)=0 THEN
    RAISE EXCEPTION 'Motor vivo v5 no reconocido. No se modificó ninguna función.';
  END IF;
  definition := replace(definition, 'public.repuestos_sugerencia_viva(', 'public.repuestos_sugerencia_viva_ordenada(');
  definition := replace(definition, 'p_offset integer DEFAULT 0)',
    'p_offset integer DEFAULT 0, p_orden text DEFAULT ''sugerencia_unidades'', p_direccion text DEFAULT ''desc'')');
  definition := replace(definition, old_order, new_order);
  definition := replace(definition, E'SELECT *\n    FROM filtradas\n    ' || new_order,
    'SELECT *, row_number() OVER (' || new_order || E') AS orden_pos\n    FROM filtradas\n    ' || new_order);
  definition := replace(definition, 'jsonb_agg(r) FROM pagina', 'jsonb_agg(r ORDER BY orden_pos) FROM pagina');
  definition := replace(definition, E'BEGIN\n',
    E'BEGIN\n  IF p_orden IS NULL OR p_orden NOT IN (''producto_codigo'',''clase'',''stock_global'',''demanda_ponderada_mensual'',''cobertura'',''ultima_venta'',''stock_objetivo'',''sugerencia_unidades'') OR p_direccion IS NULL OR p_direccion NOT IN (''asc'',''desc'') THEN RAISE EXCEPTION ''Orden inválido'' USING ERRCODE = ''22023''; END IF;\n');
  EXECUTE definition;
END;
$migration$;
REVOKE ALL ON FUNCTION public.repuestos_sugerencia_viva_ordenada(text,date,text,text,text,boolean,integer,integer,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repuestos_sugerencia_viva_ordenada(text,date,text,text,text,boolean,integer,integer,text,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
