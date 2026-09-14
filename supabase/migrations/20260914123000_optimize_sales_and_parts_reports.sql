BEGIN;

-- Índices usados por los joins normalizados de Ventas de Servicios.
CREATE INDEX IF NOT EXISTS ordenes_servicio_importadas_os_normalizado_idx
  ON public.ordenes_servicio_importadas ((upper(btrim(os_numero))));
CREATE INDEX IF NOT EXISTS comisiones_jornadas_os_vigente_valida_idx
  ON public.comisiones_jornadas ((upper(btrim(os_numero))), tipo_tiempo)
  WHERE vigente AND estado_validacion IS DISTINCT FROM 'INVALIDA';
CREATE INDEX IF NOT EXISTS facturacion_lineas_importadas_fecha_usd_idx
  -- fecha_factura es timestamptz. Su conversión directa a date depende de la
  -- zona horaria de la sesión y PostgreSQL la considera STABLE, no IMMUTABLE;
  -- por eso no puede formar parte de la expresión de un índice.
  ON public.facturacion_lineas_importadas (fecha_factura)
  WHERE fecha_factura IS NOT NULL
    AND upper(btrim(coalesce(moneda, 'USD'))) = 'USD';
CREATE INDEX IF NOT EXISTS facturacion_fecha_usd_reportable_idx
  ON public.facturacion (fecha)
  WHERE NOT coalesce(excluido_de_reportes, false)
    AND upper(btrim(coalesce(moneda, 'USD'))) = 'USD';

-- Evita planes genéricos deficientes para rangos de tamaños muy diferentes y
-- elimina el límite interno de 30 s que cancelaba los reportes antes de terminar.
ALTER FUNCTION public.ventas_area_movimientos_base(date, date, text, text)
  SET statement_timeout TO '120s';
ALTER FUNCTION public.ventas_area_movimientos_base(date, date, text, text)
  SET plan_cache_mode TO 'force_custom_plan';
ALTER FUNCTION public.ventas_servicios_panorama_v2(date, date, text, text, text, text, text, text)
  SET statement_timeout TO '120s';
ALTER FUNCTION public.ventas_servicios_panorama_v2(date, date, text, text, text, text, text, text)
  SET plan_cache_mode TO 'force_custom_plan';
ALTER FUNCTION public.ventas_servicios_detalle_os_v2(date, date, text, text, text, text, text)
  SET statement_timeout TO '120s';
ALTER FUNCTION public.ventas_servicios_detalle_os_v2(date, date, text, text, text, text, text)
  SET plan_cache_mode TO 'force_custom_plan';
ALTER FUNCTION public.ventas_servicios_lineas_v2(date, date, text, text, text, text)
  SET statement_timeout TO '120s';
ALTER FUNCTION public.ventas_servicios_lineas_v2(date, date, text, text, text, text)
  SET plan_cache_mode TO 'force_custom_plan';
ALTER FUNCTION public.ventas_servicios_indicadores_v1(date, date, text, text, text, text, text)
  SET statement_timeout TO '120s';
ALTER FUNCTION public.ventas_servicios_indicadores_v1(date, date, text, text, text, text, text)
  SET plan_cache_mode TO 'force_custom_plan';
ALTER FUNCTION public.ventas_servicios_tecnicos_v1(date, date, text, text, text, text, text)
  SET statement_timeout TO '120s';
ALTER FUNCTION public.ventas_servicios_tecnicos_v1(date, date, text, text, text, text, text)
  SET plan_cache_mode TO 'force_custom_plan';
ALTER FUNCTION public.ventas_servicios_historial(text, text)
  SET statement_timeout TO '120s';
ALTER FUNCTION public.ventas_servicios_historial(text, text)
  SET plan_cache_mode TO 'force_custom_plan';

ALTER FUNCTION public.repuestos_catalogo_stock_paginado(text, text[], text[], text[], text, text, integer, integer)
  SET statement_timeout TO '60s';
ALTER FUNCTION public.repuestos_catalogo_stock_paginado(text, text[], text[], text[], text, text, integer, integer)
  SET plan_cache_mode TO 'force_custom_plan';

-- La exportación filtrada ejecuta una sola agregación del catálogo, en vez de
-- recalcular la vista una vez por cada página descargada.
CREATE OR REPLACE FUNCTION public.repuestos_catalogo_stock_exportar(
  p_busqueda text DEFAULT NULL,
  p_marcas text[] DEFAULT '{}'::text[],
  p_familias text[] DEFAULT '{}'::text[],
  p_estados_stock text[] DEFAULT '{con_stock}'::text[],
  p_orden text DEFAULT 'total',
  p_direccion text DEFAULT 'desc'
)
RETURNS SETOF public.v_repuestos_stock_matriz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '180s'
SET plan_cache_mode = 'force_custom_plan'
AS $function$
DECLARE
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

  RETURN QUERY
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
  )
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
    f.codigo_interno ASC;
END;
$function$;

REVOKE ALL ON FUNCTION public.repuestos_catalogo_stock_exportar(text, text[], text[], text[], text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repuestos_catalogo_stock_exportar(text, text[], text[], text[], text, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
