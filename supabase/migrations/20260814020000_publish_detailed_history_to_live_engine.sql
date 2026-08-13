-- Garantiza que el motor vivo y el panel de calidad lean el detalle historico
-- ya cargado. No requiere volver a seleccionar el Excel.

CREATE INDEX IF NOT EXISTS repuestos_demanda_mensual_producto_mes_idx
  ON public.repuestos_demanda_mensual(producto_codigo, mes);

CREATE OR REPLACE FUNCTION public.repuestos_publicar_facturacion_historica()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '180s'
AS $$
DECLARE
  v_lineas integer := 0;
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

  CREATE TEMP TABLE tmp_facturacion_historica_codigos ON COMMIT DROP AS
  WITH codigos AS MATERIALIZED (
    SELECT DISTINCT public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia) AS codigo_norm
    FROM public.facturacion_lineas_importadas f
    WHERE f.origen_sistema = 'legacy_historico_detallado'
      AND public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia) IS NOT NULL
  ),
  candidatos AS MATERIALIZED (
    SELECT c.codigo_norm, m.producto_codigo, 0 AS prioridad, 'MAESTRO_LEGACY'::text AS metodo
    FROM codigos c
    JOIN public.repuestos_maestro_legacy_cargas mc
      ON mc.activo AND mc.estado = 'COMPLETADO'
    JOIN public.repuestos_maestro_legacy m
      ON m.carga_id = mc.id AND m.codigo_legacy_norm = c.codigo_norm
    WHERE m.producto_codigo IS NOT NULL
      AND m.estado_vinculo IN ('CONFIRMADA', 'CONFIRMADA_CANONICA')

    UNION ALL

    SELECT c.codigo_norm, p.codigo_interno, 1, 'CODIGO_INTERNO'
    FROM codigos c
    JOIN public.productos p
      ON public.normalizar_codigo_repuesto_flexible(p.codigo_interno) = c.codigo_norm
    WHERE p.activo

    UNION ALL

    SELECT c.codigo_norm, p.codigo_interno, 2, 'CODIGO_FABRICANTE'
    FROM codigos c
    JOIN public.productos p
      ON public.normalizar_codigo_repuesto_flexible(p.codigo_fabricante) = c.codigo_norm
    WHERE p.activo
  )
  SELECT DISTINCT ON (codigo_norm)
    codigo_norm, producto_codigo, prioridad, metodo
  FROM candidatos
  ORDER BY codigo_norm, prioridad, producto_codigo;

  CREATE UNIQUE INDEX tmp_facturacion_historica_codigos_idx
    ON tmp_facturacion_historica_codigos(codigo_norm);
  ANALYZE tmp_facturacion_historica_codigos;

  INSERT INTO public.repuestos_ventas_vinculacion(
    linea_id, producto_codigo, estado_vinculo, metodo_vinculo, prioridad,
    confianza, candidatos, cantidad_candidatos, fecha_efectiva,
    marca_origen, moneda, cantidad, unidad_producto
  )
  SELECT
    f.id,
    mapa.producto_codigo,
    CASE WHEN mapa.producto_codigo IS NULL THEN 'SIN_COINCIDENCIA' ELSE 'CONFIRMADA' END,
    mapa.metodo,
    mapa.prioridad,
    CASE
      WHEN mapa.prioridad = 0 THEN 1.00
      WHEN mapa.prioridad = 1 THEN 0.95
      WHEN mapa.prioridad = 2 THEN 0.90
      ELSE 0
    END,
    CASE WHEN mapa.producto_codigo IS NULL THEN '{}'::text[] ELSE ARRAY[mapa.producto_codigo] END,
    CASE WHEN mapa.producto_codigo IS NULL THEN 0 ELSE 1 END,
    f.fecha_factura::date,
    coalesce(p.marca, f.marca_normalizada, 'OTROS'::public.marca),
    f.moneda,
    coalesce(f.cantidad, 0),
    p.unidad
  FROM public.facturacion_lineas_importadas f
  LEFT JOIN tmp_facturacion_historica_codigos mapa
    ON mapa.codigo_norm = public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia)
  LEFT JOIN public.productos p ON p.codigo_interno = mapa.producto_codigo
  WHERE f.origen_sistema = 'legacy_historico_detallado'
  ON CONFLICT (linea_id) DO UPDATE SET
    producto_codigo = EXCLUDED.producto_codigo,
    estado_vinculo = EXCLUDED.estado_vinculo,
    metodo_vinculo = EXCLUDED.metodo_vinculo,
    prioridad = EXCLUDED.prioridad,
    confianza = EXCLUDED.confianza,
    candidatos = EXCLUDED.candidatos,
    cantidad_candidatos = EXCLUDED.cantidad_candidatos,
    fecha_efectiva = EXCLUDED.fecha_efectiva,
    marca_origen = EXCLUDED.marca_origen,
    moneda = EXCLUDED.moneda,
    cantidad = EXCLUDED.cantidad,
    unidad_producto = EXCLUDED.unidad_producto,
    actualizado_en = now();

  -- Solo se reemplaza el tramo cubierto por la fuente historica.
  DELETE FROM public.repuestos_demanda_mensual
  WHERE mes < v_fecha_corte;

  INSERT INTO public.repuestos_demanda_mensual(
    producto_codigo, mes, unidades_netas, unidades_positivas,
    devoluciones, pedidos, importe_comparable
  )
  SELECT
    v.producto_codigo,
    date_trunc('month', v.fecha_efectiva)::date,
    sum(v.cantidad)::numeric,
    sum(greatest(v.cantidad, 0))::numeric,
    sum(abs(least(v.cantidad, 0)))::numeric,
    count(DISTINCT coalesce(f.codigo_interno_factura, f.factura, f.id::text))::integer,
    sum(CASE
      WHEN upper(coalesce(f.moneda, 'USD')) IN ('GS', 'GRS', 'PYG') THEN 0
      ELSE coalesce(f.total_venta, 0)
    END)::numeric
  FROM public.repuestos_ventas_vinculacion v
  JOIN public.facturacion_lineas_importadas f ON f.id = v.linea_id
  WHERE f.origen_sistema = 'legacy_historico_detallado'
    AND v.estado_vinculo = 'CONFIRMADA'
    AND v.producto_codigo IS NOT NULL
    AND v.fecha_efectiva < v_fecha_corte
  GROUP BY v.producto_codigo, date_trunc('month', v.fecha_efectiva)::date
  ON CONFLICT (producto_codigo, mes) DO UPDATE SET
    unidades_netas = EXCLUDED.unidades_netas,
    unidades_positivas = EXCLUDED.unidades_positivas,
    devoluciones = EXCLUDED.devoluciones,
    pedidos = EXCLUDED.pedidos,
    importe_comparable = EXCLUDED.importe_comparable,
    actualizado_en = now();

  SELECT count(*)::integer, count(DISTINCT v.producto_codigo)::integer
  INTO v_lineas, v_productos
  FROM public.repuestos_ventas_vinculacion v
  JOIN public.facturacion_lineas_importadas f ON f.id = v.linea_id
  WHERE f.origen_sistema = 'legacy_historico_detallado'
    AND v.estado_vinculo = 'CONFIRMADA';

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
    lineas_vinculadas = v_lineas,
    productos_vinculados = v_productos
  WHERE activo AND estado = 'COMPLETADO';

  RETURN jsonb_build_object(
    'lineas_vinculadas', v_lineas,
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
  WITH base AS (
    SELECT
      v.estado_vinculo,
      v.producto_codigo,
      v.fecha_efectiva AS fecha,
      coalesce(p.marca, v.marca_origen) AS marca
    FROM public.repuestos_ventas_vinculacion v
    LEFT JOIN public.productos p ON p.codigo_interno = v.producto_codigo
  ),
  filtrada AS (
    SELECT * FROM base
    WHERE p_marca IS NULL OR marca::text = upper(trim(p_marca))
  ),
  ultima AS (
    SELECT * FROM public.repuestos_historial_actualizaciones
    WHERE estado = 'COMPLETADA'
    ORDER BY completado_en DESC
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'preparado', EXISTS (SELECT 1 FROM ultima)
      OR EXISTS (SELECT 1 FROM public.repuestos_facturacion_historica_cargas WHERE activo AND estado = 'COMPLETADO'),
    'lineas_totales', count(*)::integer,
    'confirmadas', count(*) FILTER (WHERE estado_vinculo = 'CONFIRMADA')::integer,
    'ambiguas', count(*) FILTER (WHERE estado_vinculo = 'AMBIGUA')::integer,
    'sin_coincidencia', count(*) FILTER (WHERE estado_vinculo = 'SIN_COINCIDENCIA')::integer,
    'productos_confirmados', count(DISTINCT producto_codigo)
      FILTER (WHERE estado_vinculo = 'CONFIRMADA')::integer,
    'fecha_desde', min(fecha),
    'fecha_hasta', max(fecha),
    'actualizado_en', greatest(
      (SELECT completado_en FROM ultima),
      (SELECT max(completado_en) FROM public.repuestos_facturacion_historica_cargas WHERE activo AND estado = 'COMPLETADO')
    )
  )
  FROM filtrada;
$$;

REVOKE ALL ON FUNCTION public.repuestos_publicar_facturacion_historica() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repuestos_publicar_facturacion_historica() TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_resumen_calidad_historial(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
