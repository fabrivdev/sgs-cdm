-- Publica la carga historica ya vinculada sin volver a recorrer el maestro.
-- Este parche es deliberadamente liviano: agrega por producto/mes las lineas
-- que repuestos_finalizar_facturacion_historica ya dejo en vinculacion.

CREATE INDEX IF NOT EXISTS facturacion_lineas_historico_origen_id_idx
  ON public.facturacion_lineas_importadas(origen_sistema, id)
  WHERE origen_sistema = 'legacy_historico_detallado';

CREATE OR REPLACE FUNCTION public.repuestos_publicar_facturacion_historica()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '90s'
AS $$
DECLARE
  v_lineas_fuente integer := 0;
  v_lineas_evaluadas integer := 0;
  v_lineas_vinculadas integer := 0;
  v_productos integer := 0;
  v_productos_12m integer := 0;
  v_productos_24m integer := 0;
  v_fecha_corte date := DATE '2026-07-01';
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

  SELECT
    count(*)::integer,
    count(v.linea_id)::integer,
    count(*) FILTER (WHERE v.estado_vinculo = 'CONFIRMADA')::integer,
    count(DISTINCT v.producto_codigo)
      FILTER (WHERE v.estado_vinculo = 'CONFIRMADA')::integer
  INTO v_lineas_fuente, v_lineas_evaluadas, v_lineas_vinculadas, v_productos
  FROM public.facturacion_lineas_importadas f
  LEFT JOIN public.repuestos_ventas_vinculacion v ON v.linea_id = f.id
  WHERE f.origen_sistema = 'legacy_historico_detallado';

  IF v_lineas_fuente = 0 THEN
    RAISE EXCEPTION 'No existe una carga de facturacion historica detallada para publicar';
  END IF;

  IF v_lineas_evaluadas <> v_lineas_fuente THEN
    RAISE EXCEPTION
      'La vinculacion historica esta incompleta: % de % lineas fueron evaluadas. No se modifico la demanda.',
      v_lineas_evaluadas, v_lineas_fuente;
  END IF;

  CREATE TEMP TABLE tmp_demanda_historica_mensual ON COMMIT DROP AS
  SELECT
    v.producto_codigo,
    date_trunc('month', v.fecha_efectiva)::date AS mes,
    sum(v.cantidad)::numeric AS unidades_netas,
    sum(greatest(v.cantidad, 0))::numeric AS unidades_positivas,
    sum(abs(least(v.cantidad, 0)))::numeric AS devoluciones,
    count(DISTINCT coalesce(f.codigo_interno_factura, f.factura, f.id::text))::integer AS pedidos,
    sum(
      CASE
        WHEN upper(coalesce(f.moneda, 'USD')) IN ('GS', 'GRS', 'PYG') THEN 0
        ELSE coalesce(f.total_venta, 0)
      END
    )::numeric AS importe_comparable
  FROM public.facturacion_lineas_importadas f
  JOIN public.repuestos_ventas_vinculacion v ON v.linea_id = f.id
  WHERE f.origen_sistema = 'legacy_historico_detallado'
    AND v.estado_vinculo = 'CONFIRMADA'
    AND v.producto_codigo IS NOT NULL
    AND v.fecha_efectiva IS NOT NULL
    AND v.fecha_efectiva < v_fecha_corte
  GROUP BY v.producto_codigo, date_trunc('month', v.fecha_efectiva)::date;

  CREATE UNIQUE INDEX tmp_demanda_historica_mensual_idx
    ON tmp_demanda_historica_mensual(producto_codigo, mes);

  DELETE FROM public.repuestos_demanda_mensual
  WHERE mes < v_fecha_corte;

  INSERT INTO public.repuestos_demanda_mensual(
    producto_codigo, mes, unidades_netas, unidades_positivas,
    devoluciones, pedidos, importe_comparable
  )
  SELECT
    producto_codigo, mes, unidades_netas, unidades_positivas,
    devoluciones, pedidos, importe_comparable
  FROM tmp_demanda_historica_mensual;

  SELECT
    count(DISTINCT producto_codigo) FILTER (
      WHERE mes >= DATE '2025-08-01'
        AND mes <= DATE '2026-07-01'
        AND unidades_positivas > 0
    )::integer,
    count(DISTINCT producto_codigo) FILTER (
      WHERE mes >= DATE '2024-08-01'
        AND mes <= DATE '2026-07-01'
        AND unidades_positivas > 0
    )::integer
  INTO v_productos_12m, v_productos_24m
  FROM public.repuestos_demanda_mensual;

  UPDATE public.repuestos_facturacion_historica_cargas
  SET
    lineas_vinculadas = v_lineas_vinculadas,
    productos_vinculados = v_productos
  WHERE activo AND estado = 'COMPLETADO';

  RETURN jsonb_build_object(
    'lineas_fuente', v_lineas_fuente,
    'lineas_evaluadas', v_lineas_evaluadas,
    'lineas_vinculadas', v_lineas_vinculadas,
    'productos_vinculados', v_productos,
    'productos_con_ventas_12m', v_productos_12m,
    'productos_con_ventas_24m', v_productos_24m,
    'mes_desde', (SELECT min(mes) FROM public.repuestos_demanda_mensual),
    'mes_hasta', (SELECT max(mes) FROM public.repuestos_demanda_mensual)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.repuestos_resumen_calidad_historial(p_marca text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH filtrada AS (
    SELECT
      v.estado_vinculo,
      v.producto_codigo,
      v.fecha_efectiva AS fecha
    FROM public.repuestos_ventas_vinculacion v
    LEFT JOIN public.productos p ON p.codigo_interno = v.producto_codigo
    WHERE p_marca IS NULL
      OR coalesce(p.marca, v.marca_origen)::text = upper(trim(p_marca))
  ),
  carga AS (
    SELECT completado_en
    FROM public.repuestos_facturacion_historica_cargas
    WHERE activo AND estado = 'COMPLETADO'
    ORDER BY completado_en DESC
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'preparado', EXISTS (SELECT 1 FROM public.repuestos_demanda_mensual),
    'lineas_totales', count(*)::integer,
    'confirmadas', count(*) FILTER (WHERE estado_vinculo = 'CONFIRMADA')::integer,
    'ambiguas', count(*) FILTER (WHERE estado_vinculo = 'AMBIGUA')::integer,
    'sin_coincidencia', count(*) FILTER (WHERE estado_vinculo = 'SIN_COINCIDENCIA')::integer,
    'productos_confirmados', count(DISTINCT producto_codigo)
      FILTER (WHERE estado_vinculo = 'CONFIRMADA')::integer,
    'fecha_desde', min(fecha),
    'fecha_hasta', max(fecha),
    'actualizado_en', (SELECT completado_en FROM carga)
  )
  FROM filtrada;
$$;

REVOKE ALL ON FUNCTION public.repuestos_publicar_facturacion_historica() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repuestos_publicar_facturacion_historica() TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_resumen_calidad_historial(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
