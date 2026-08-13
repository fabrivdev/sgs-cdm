-- Publicacion reanudable del historial detallado. Cada lote cubre tres meses
-- para permanecer por debajo del timeout HTTP/SQL del proyecto.

ALTER TABLE public.repuestos_facturacion_historica_cargas
  ADD COLUMN IF NOT EXISTS publicacion_estado text,
  ADD COLUMN IF NOT EXISTS publicacion_hasta date,
  ADD COLUMN IF NOT EXISTS publicado_en timestamptz;

CREATE INDEX IF NOT EXISTS facturacion_lineas_historico_fecha_idx
  ON public.facturacion_lineas_importadas(fecha_factura, id)
  WHERE origen_sistema = 'legacy_historico_detallado';

CREATE OR REPLACE FUNCTION public.repuestos_iniciar_publicacion_historial()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '20s'
AS $$
DECLARE
  v_fuente integer;
  v_desde date;
  v_hasta date;
BEGIN
  IF auth.uid() IS NOT NULL AND (
    NOT public.has_module_access(auth.uid(), 'repuestos')
    OR NOT (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
    )
  ) THEN
    RAISE EXCEPTION 'No tenes permiso para publicar el historial de repuestos'
      USING ERRCODE = '42501';
  END IF;

  SELECT filas_recibidas
  INTO v_fuente
  FROM public.repuestos_facturacion_historica_cargas
  WHERE activo AND estado = 'COMPLETADO'
  LIMIT 1;

  IF coalesce(v_fuente, 0) = 0 THEN
    RAISE EXCEPTION 'No existe una carga historica completada';
  END IF;

  SELECT
    date_trunc('month', min(f.fecha_factura))::date,
    least(DATE '2026-07-01', (date_trunc('month', max(f.fecha_factura)) + interval '1 month')::date)
  INTO v_desde, v_hasta
  FROM public.facturacion_lineas_importadas f
  WHERE f.origen_sistema = 'legacy_historico_detallado'
    AND f.fecha_factura < DATE '2026-07-01';

  IF v_desde IS NULL OR v_hasta IS NULL THEN
    RAISE EXCEPTION 'No hay ventas historicas confirmadas para materializar';
  END IF;

  UPDATE public.repuestos_facturacion_historica_cargas
  SET publicacion_estado = 'PROCESANDO', publicacion_hasta = NULL, publicado_en = NULL
  WHERE activo AND estado = 'COMPLETADO';

  RETURN jsonb_build_object(
    'fecha_desde', v_desde,
    'fecha_hasta_exclusiva', v_hasta,
    'lineas_fuente', v_fuente
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.repuestos_publicar_historial_lote(
  p_desde date,
  p_hasta_exclusiva date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '25s'
AS $$
DECLARE
  v_filas integer := 0;
  v_productos integer := 0;
BEGIN
  IF p_desde IS NULL OR p_hasta_exclusiva IS NULL OR p_hasta_exclusiva <= p_desde
    OR p_hasta_exclusiva > DATE '2026-07-01'
    OR p_hasta_exclusiva > (p_desde + interval '3 months')::date
  THEN
    RAISE EXCEPTION 'Rango de lote invalido';
  END IF;

  IF auth.uid() IS NOT NULL AND (
    NOT public.has_module_access(auth.uid(), 'repuestos')
    OR NOT (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
    )
  ) THEN
    RAISE EXCEPTION 'No tenes permiso para publicar el historial de repuestos'
      USING ERRCODE = '42501';
  END IF;

  CREATE TEMP TABLE tmp_demanda_lote ON COMMIT DROP AS
  SELECT
    v.producto_codigo,
    date_trunc('month', v.fecha_efectiva)::date AS mes,
    sum(v.cantidad)::numeric AS unidades_netas,
    sum(greatest(v.cantidad, 0))::numeric AS unidades_positivas,
    sum(abs(least(v.cantidad, 0)))::numeric AS devoluciones,
    count(DISTINCT coalesce(f.codigo_interno_factura, f.factura, f.id::text))::integer AS pedidos,
    sum(CASE
      WHEN upper(coalesce(f.moneda, 'USD')) IN ('GS', 'GRS', 'PYG') THEN 0
      ELSE coalesce(f.total_venta, 0)
    END)::numeric AS importe_comparable
  FROM public.facturacion_lineas_importadas f
  JOIN public.repuestos_ventas_vinculacion v ON v.linea_id = f.id
  WHERE f.origen_sistema = 'legacy_historico_detallado'
    AND v.estado_vinculo = 'CONFIRMADA'
    AND v.producto_codigo IS NOT NULL
    AND v.fecha_efectiva >= p_desde
    AND v.fecha_efectiva < p_hasta_exclusiva
  GROUP BY v.producto_codigo, date_trunc('month', v.fecha_efectiva)::date;

  SELECT count(*)::integer, count(DISTINCT producto_codigo)::integer
  INTO v_filas, v_productos
  FROM tmp_demanda_lote;

  DELETE FROM public.repuestos_demanda_mensual
  WHERE mes >= p_desde AND mes < p_hasta_exclusiva;

  INSERT INTO public.repuestos_demanda_mensual(
    producto_codigo, mes, unidades_netas, unidades_positivas,
    devoluciones, pedidos, importe_comparable
  )
  SELECT
    producto_codigo, mes, unidades_netas, unidades_positivas,
    devoluciones, pedidos, importe_comparable
  FROM tmp_demanda_lote;

  UPDATE public.repuestos_facturacion_historica_cargas
  SET publicacion_hasta = greatest(coalesce(publicacion_hasta, p_desde), p_hasta_exclusiva)
  WHERE activo AND estado = 'COMPLETADO';

  RETURN jsonb_build_object(
    'desde', p_desde,
    'hasta_exclusiva', p_hasta_exclusiva,
    'filas_mensuales', v_filas,
    'productos', v_productos
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.repuestos_finalizar_publicacion_historial()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '25s'
AS $$
DECLARE
  v_lineas integer;
  v_productos integer;
  v_productos_12m integer;
  v_productos_24m integer;
BEGIN
  IF auth.uid() IS NOT NULL AND (
    NOT public.has_module_access(auth.uid(), 'repuestos')
    OR NOT (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
    )
  ) THEN
    RAISE EXCEPTION 'No tenes permiso para publicar el historial de repuestos'
      USING ERRCODE = '42501';
  END IF;

  SELECT lineas_vinculadas, productos_vinculados
  INTO v_lineas, v_productos
  FROM public.repuestos_facturacion_historica_cargas
  WHERE activo AND estado = 'COMPLETADO'
  LIMIT 1;

  SELECT
    count(DISTINCT producto_codigo) FILTER (
      WHERE mes >= DATE '2025-08-01' AND mes <= DATE '2026-07-01' AND unidades_positivas > 0
    )::integer,
    count(DISTINCT producto_codigo) FILTER (
      WHERE mes >= DATE '2024-08-01' AND mes <= DATE '2026-07-01' AND unidades_positivas > 0
    )::integer
  INTO v_productos_12m, v_productos_24m
  FROM public.repuestos_demanda_mensual;

  UPDATE public.repuestos_facturacion_historica_cargas
  SET
    publicacion_estado = 'COMPLETADO',
    publicado_en = now(),
    lineas_vinculadas = v_lineas,
    productos_vinculados = v_productos
  WHERE activo AND estado = 'COMPLETADO';

  RETURN jsonb_build_object(
    'lineas_vinculadas', v_lineas,
    'productos_vinculados', v_productos,
    'productos_con_ventas_12m', v_productos_12m,
    'productos_con_ventas_24m', v_productos_24m
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.repuestos_estado_facturacion_historica()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce((
    SELECT jsonb_build_object(
      'cargado', estado = 'COMPLETADO' AND activo,
      'en_proceso', estado = 'PROCESANDO',
      'carga_id', id,
      'archivo_nombre', archivo_nombre,
      'filas_archivo', filas_archivo,
      'filas_recibidas', filas_recibidas,
      'lineas_vinculadas', lineas_vinculadas,
      'productos_vinculados', productos_vinculados,
      'completado_en', completado_en,
      'publicacion_estado', publicacion_estado,
      'publicacion_hasta', publicacion_hasta,
      'publicado_en', publicado_en
    )
    FROM public.repuestos_facturacion_historica_cargas
    WHERE activo OR estado = 'PROCESANDO'
    ORDER BY activo DESC, creado_en DESC
    LIMIT 1
  ), jsonb_build_object('cargado', false, 'en_proceso', false));
$$;

CREATE OR REPLACE FUNCTION public.repuestos_resumen_calidad_historial(p_marca text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH filtrada AS (
    SELECT v.estado_vinculo, v.producto_codigo, v.fecha_efectiva AS fecha
    FROM public.repuestos_ventas_vinculacion v
    LEFT JOIN public.productos p ON p.codigo_interno = v.producto_codigo
    WHERE p_marca IS NULL OR coalesce(p.marca, v.marca_origen)::text = upper(trim(p_marca))
  ),
  carga AS (
    SELECT publicacion_estado, publicado_en
    FROM public.repuestos_facturacion_historica_cargas
    WHERE activo AND estado = 'COMPLETADO'
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'preparado', coalesce((SELECT publicacion_estado = 'COMPLETADO' FROM carga), false),
    'lineas_totales', count(*)::integer,
    'confirmadas', count(*) FILTER (WHERE estado_vinculo = 'CONFIRMADA')::integer,
    'ambiguas', count(*) FILTER (WHERE estado_vinculo = 'AMBIGUA')::integer,
    'sin_coincidencia', count(*) FILTER (WHERE estado_vinculo = 'SIN_COINCIDENCIA')::integer,
    'productos_confirmados', count(DISTINCT producto_codigo)
      FILTER (WHERE estado_vinculo = 'CONFIRMADA')::integer,
    'fecha_desde', min(fecha),
    'fecha_hasta', max(fecha),
    'actualizado_en', (SELECT publicado_en FROM carga)
  )
  FROM filtrada;
$$;

REVOKE ALL ON FUNCTION public.repuestos_iniciar_publicacion_historial() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repuestos_publicar_historial_lote(date,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repuestos_finalizar_publicacion_historial() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repuestos_iniciar_publicacion_historial() TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_publicar_historial_lote(date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_finalizar_publicacion_historial() TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_estado_facturacion_historica() TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_resumen_calidad_historial(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
