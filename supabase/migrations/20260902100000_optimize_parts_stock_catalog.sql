-- Evita recalcular el GROUP BY del stock una vez por cada producto. Primero
-- resume las pocas filas de stock y despues las une al catalogo completo.
CREATE OR REPLACE VIEW public.v_repuestos_stock_matriz AS
WITH stock AS (
  SELECT
    rs.producto_codigo,
    coalesce(sum(rs.saldo_actual) FILTER (WHERE rs.sucursal = 'Santa Rita'), 0) AS santa_rita,
    coalesce(sum(rs.saldo_actual) FILTER (WHERE rs.sucursal = 'Santa Rosa'), 0) AS santa_rosa,
    coalesce(sum(rs.saldo_actual) FILTER (WHERE rs.sucursal = 'Campo 9'), 0) AS campo_9,
    coalesce(sum(rs.saldo_actual) FILTER (WHERE rs.sucursal = 'Misiones'), 0) AS misiones,
    coalesce(sum(rs.saldo_actual) FILTER (WHERE rs.sucursal = 'Loma Plata'), 0) AS loma_plata,
    coalesce(sum(rs.saldo_actual) FILTER (WHERE rs.sucursal = 'Katuete'), 0) AS katuete,
    coalesce(sum(rs.saldo_actual), 0) AS total
  FROM public.repuestos_stock rs
  GROUP BY rs.producto_codigo
)
SELECT
  p.codigo_interno,
  p.descripcion,
  p.codigo_fabricante,
  p.marca,
  p.familia,
  p.unidad,
  coalesce(s.santa_rita, 0) AS santa_rita,
  coalesce(s.santa_rosa, 0) AS santa_rosa,
  coalesce(s.campo_9, 0) AS campo_9,
  coalesce(s.misiones, 0) AS misiones,
  coalesce(s.loma_plata, 0) AS loma_plata,
  coalesce(s.katuete, 0) AS katuete,
  coalesce(s.total, 0) AS total
FROM public.productos p
LEFT JOIN stock s ON s.producto_codigo = p.codigo_interno
WHERE p.codigo_interno ILIKE 'REP%'
  AND p.activo
  AND NOT EXISTS (
    SELECT 1
    FROM public.repuestos_productos_alias a
    WHERE a.alias_codigo = p.codigo_interno
      AND a.activo
  );

ALTER VIEW public.v_repuestos_stock_matriz SET (security_invoker = true);
GRANT SELECT ON public.v_repuestos_stock_matriz TO authenticated;

CREATE INDEX IF NOT EXISTS repuestos_stock_importado_en_idx
  ON public.repuestos_stock (importado_en DESC);
CREATE INDEX IF NOT EXISTS repuestos_productos_alias_activo_idx
  ON public.repuestos_productos_alias (alias_codigo)
  WHERE activo;

-- Lista, total paginado y KPI se calculan juntos. Antes la pantalla lanzaba
-- tres count exactos mas la pagina sobre la misma vista agregada.
CREATE OR REPLACE FUNCTION public.repuestos_catalogo_stock_paginado(
  p_busqueda text DEFAULT NULL,
  p_marcas text[] DEFAULT '{}'::text[],
  p_familias text[] DEFAULT '{}'::text[],
  p_estados_stock text[] DEFAULT '{con_stock}'::text[],
  p_orden text DEFAULT 'total',
  p_direccion text DEFAULT 'desc',
  p_limite integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_resultado jsonb;
  v_busqueda text := nullif(btrim(p_busqueda), '');
  v_orden text := CASE
    WHEN p_orden IN ('codigo_interno','descripcion','santa_rita','santa_rosa',
      'campo_9','misiones','loma_plata','katuete','total') THEN p_orden
    ELSE 'total'
  END;
  v_direccion text := CASE WHEN lower(p_direccion) = 'asc' THEN 'asc' ELSE 'desc' END;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_module_access(auth.uid(), 'repuestos') THEN
    RAISE EXCEPTION 'No tenes acceso al catalogo de repuestos'
      USING ERRCODE = '42501';
  END IF;

  WITH filtrado AS MATERIALIZED (
    SELECT m.*
    FROM public.v_repuestos_stock_matriz m
    WHERE (v_busqueda IS NULL OR m.codigo_interno ILIKE '%' || v_busqueda || '%'
      OR m.descripcion ILIKE '%' || v_busqueda || '%'
      OR m.codigo_fabricante ILIKE '%' || v_busqueda || '%')
      AND (coalesce(cardinality(p_marcas), 0) = 0 OR m.marca::text = ANY(p_marcas))
      AND (coalesce(cardinality(p_familias), 0) = 0 OR m.familia = ANY(p_familias))
      AND (
        coalesce(cardinality(p_estados_stock), 0) <> 1
        OR (p_estados_stock[1] = 'con_stock' AND m.total > 0)
        OR (p_estados_stock[1] = 'sin_stock' AND m.total = 0)
      )
  ), pagina AS (
    SELECT f.*
    FROM filtrado f
    ORDER BY
      CASE WHEN v_orden = 'codigo_interno' AND v_direccion = 'asc' THEN f.codigo_interno END ASC NULLS LAST,
      CASE WHEN v_orden = 'codigo_interno' AND v_direccion = 'desc' THEN f.codigo_interno END DESC NULLS LAST,
      CASE WHEN v_orden = 'descripcion' AND v_direccion = 'asc' THEN f.descripcion END ASC NULLS LAST,
      CASE WHEN v_orden = 'descripcion' AND v_direccion = 'desc' THEN f.descripcion END DESC NULLS LAST,
      CASE WHEN v_orden = 'santa_rita' AND v_direccion = 'asc' THEN f.santa_rita END ASC NULLS LAST,
      CASE WHEN v_orden = 'santa_rita' AND v_direccion = 'desc' THEN f.santa_rita END DESC NULLS LAST,
      CASE WHEN v_orden = 'santa_rosa' AND v_direccion = 'asc' THEN f.santa_rosa END ASC NULLS LAST,
      CASE WHEN v_orden = 'santa_rosa' AND v_direccion = 'desc' THEN f.santa_rosa END DESC NULLS LAST,
      CASE WHEN v_orden = 'campo_9' AND v_direccion = 'asc' THEN f.campo_9 END ASC NULLS LAST,
      CASE WHEN v_orden = 'campo_9' AND v_direccion = 'desc' THEN f.campo_9 END DESC NULLS LAST,
      CASE WHEN v_orden = 'misiones' AND v_direccion = 'asc' THEN f.misiones END ASC NULLS LAST,
      CASE WHEN v_orden = 'misiones' AND v_direccion = 'desc' THEN f.misiones END DESC NULLS LAST,
      CASE WHEN v_orden = 'loma_plata' AND v_direccion = 'asc' THEN f.loma_plata END ASC NULLS LAST,
      CASE WHEN v_orden = 'loma_plata' AND v_direccion = 'desc' THEN f.loma_plata END DESC NULLS LAST,
      CASE WHEN v_orden = 'katuete' AND v_direccion = 'asc' THEN f.katuete END ASC NULLS LAST,
      CASE WHEN v_orden = 'katuete' AND v_direccion = 'desc' THEN f.katuete END DESC NULLS LAST,
      CASE WHEN v_orden = 'total' AND v_direccion = 'asc' THEN f.total END ASC NULLS LAST,
      CASE WHEN v_orden = 'total' AND v_direccion = 'desc' THEN f.total END DESC NULLS LAST,
      f.codigo_interno ASC
    LIMIT least(greatest(coalesce(p_limite, 50), 1), 200)
    OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT jsonb_build_object(
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM pagina p), '[]'::jsonb),
    'count', (SELECT count(*) FROM filtrado),
    'kpis', jsonb_build_object(
      'totalCatalogo', (SELECT count(*) FROM filtrado),
      'conStock', (SELECT count(*) FROM filtrado WHERE total > 0),
      'enCero', (SELECT count(*) FROM filtrado WHERE total = 0),
      'ultimaImportacion', (SELECT max(importado_en) FROM public.repuestos_stock)
    )
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$function$;

REVOKE ALL ON FUNCTION public.repuestos_catalogo_stock_paginado(
  text, text[], text[], text[], text, text, integer, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repuestos_catalogo_stock_paginado(
  text, text[], text[], text[], text, text, integer, integer
) TO authenticated;

COMMENT ON FUNCTION public.repuestos_catalogo_stock_paginado(
  text, text[], text[], text[], text, text, integer, integer
) IS 'Devuelve pagina, total y KPI del catalogo de stock en una sola evaluacion.';

NOTIFY pgrst, 'reload schema';
