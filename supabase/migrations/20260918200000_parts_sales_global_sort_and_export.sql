BEGIN;
-- Copy the INSTALLED v2 population/ABC rules. Only replace ordering/pagination.
-- Existing v2 remains available; no commercial rows are updated.
CREATE OR REPLACE FUNCTION public.ventas_orden_natural(p_texto text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
  SELECT string_agg(CASE WHEN fragment[1] ~ '^[0-9]+$'
    THEN chr(1)||lpad(length(ltrim(fragment[1],'0'))::text,8,'0')||ltrim(fragment[1],'0')||chr(1)
    -- Spanish ñ follows every n... word and precedes o, even under C collation.
    ELSE replace(translate(lower(fragment[1]),'áéíóúü','aeiouu'),'ñ','n'||chr(127)) END,'' ORDER BY ordinal)
  FROM regexp_matches(nullif(btrim(p_texto),''),'([0-9]+|[^0-9]+)','g') WITH ORDINALITY AS t(fragment,ordinal);
$$;
REVOKE ALL ON FUNCTION public.ventas_orden_natural(text) FROM PUBLIC,anon;

DO $migration$
DECLARE v_def text; v_start integer; v_end integer;
BEGIN
  v_def:=pg_get_functiondef('public.ventas_repuestos_listado_v2(date,date,text,text,text,integer,integer)'::regprocedure);
  IF strpos(v_def,'ventas_repuestos_movimientos_v2')=0 OR strpos(v_def,'clasificados AS (')=0
    OR strpos(v_def,'has_section_access')=0 OR strpos(v_def,'p_por_pagina integer DEFAULT 50)')=0 THEN
    RAISE EXCEPTION 'La definición v2 cambió o falta el SQL de productos/ABC. Revisar antes de aplicar';
  END IF;
  v_def:=replace(v_def,'public.ventas_repuestos_listado_v2(', 'public.ventas_repuestos_listado_v3(');
  v_def:=replace(v_def,'p_por_pagina integer DEFAULT 50)',
    'p_por_pagina integer DEFAULT 50, p_orden text DEFAULT NULL, p_direccion text DEFAULT ''desc'', p_exportar boolean DEFAULT false)');
  v_def:=replace(v_def,'  WITH base AS MATERIALIZED (', $guard$
  IF p_direccion NOT IN ('asc','desc') OR p_direccion IS NULL THEN
    RAISE EXCEPTION 'Dirección inválida' USING errcode='22023'; END IF;
  p_orden:=coalesce(p_orden,CASE WHEN p_vista='detalle' THEN 'fecha' ELSE 'facturado' END);
  IF p_orden NOT IN ('fecha','factura','cliente','sucursal','marca','codigo','codigo_fabricante','descripcion',
    'cantidad','facturado','ventas','notas_credito','clientes','documentos','unidades_netas','vendedor',
    'ticket','anterior','variacion','ultima','participacion','abc') THEN
    RAISE EXCEPTION 'Columna inválida' USING errcode='22023'; END IF;
  WITH base AS MATERIALIZED ($guard$);
  IF strpos(v_def,'Columna inválida')=0 THEN RAISE EXCEPTION 'No se pudo insertar la validación de orden'; END IF;
  v_start:=strpos(v_def, '), pagina AS (');
  v_end:=strpos(v_def, '  RETURN v_result;');
  IF v_start=0 OR v_end<v_start THEN RAISE EXCEPTION 'Paginación v2 incompatible; no se modificó el reporte'; END IF;
  v_def:=substring(v_def,1,v_start-1)||$tail$
  ), claves AS (
    SELECT f.*, CASE WHEN p_orden IN ('cantidad','facturado','ventas','notas_credito','clientes','documentos','unidades_netas','anterior')
        THEN (datos->>p_orden)::numeric
      WHEN p_orden='ticket' THEN facturado/nullif((datos->>'documentos')::numeric,0)
      WHEN p_orden='variacion' THEN (facturado-(datos->>'anterior')::numeric)/nullif(abs((datos->>'anterior')::numeric),0)
      WHEN p_orden='participacion' THEN facturado/nullif((SELECT sum(importe) FROM actual),0) END numero,
      CASE WHEN p_orden IN ('fecha','ultima') THEN (datos->>p_orden)::date END dia,
      CASE WHEN p_orden NOT IN ('cantidad','facturado','ventas','notas_credito','clientes','documentos','unidades_netas','anterior','ticket','variacion','participacion','fecha','ultima')
        THEN public.ventas_orden_natural(datos->>p_orden) END texto
    FROM filas f
  ), ordenadas AS (
    SELECT *,row_number() OVER(ORDER BY
      CASE WHEN p_direccion='asc' THEN numero END ASC NULLS LAST,
      CASE WHEN p_direccion='desc' THEN numero END DESC NULLS LAST,
      CASE WHEN p_direccion='asc' THEN dia END ASC NULLS LAST,
      CASE WHEN p_direccion='desc' THEN dia END DESC NULLS LAST,
      CASE WHEN p_direccion='asc' THEN texto END COLLATE "C" ASC NULLS LAST,
      CASE WHEN p_direccion='desc' THEN texto END COLLATE "C" DESC NULLS LAST,id) posicion
    FROM claves
  ), pagina AS (
    SELECT * FROM ordenadas ORDER BY posicion
    LIMIT CASE WHEN p_exportar THEN NULL ELSE v_size END
    OFFSET CASE WHEN p_exportar THEN 0 ELSE (v_page-1)*v_size END
  ) SELECT jsonb_build_object('total',(SELECT count(*) FROM filas),'pagina',CASE WHEN p_exportar THEN 1 ELSE v_page END,
    'paginas',CASE WHEN p_exportar THEN 1 ELSE greatest(1,ceil((SELECT count(*) FROM filas)::numeric/v_size)) END,
    'total_periodo',coalesce((SELECT sum(importe) FROM actual),0),
    'filas',coalesce((SELECT jsonb_agg(datos ORDER BY posicion) FROM pagina),'[]'::jsonb)) INTO v_result;
$tail$||substring(v_def,v_end);
  EXECUTE v_def;
END $migration$;
REVOKE ALL ON FUNCTION public.ventas_repuestos_listado_v3(date,date,text,text,text,integer,integer,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ventas_repuestos_listado_v3(date,date,text,text,text,integer,integer,text,text,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
