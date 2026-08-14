-- El detalle de un repuesto debe leer la vinculacion ya consolidada.
-- La version anterior repetia siete estrategias de coincidencia contra toda
-- facturacion_lineas_importadas en cada apertura y agotaba el timeout.

CREATE INDEX IF NOT EXISTS repuestos_ventas_vinculacion_confirmada_detalle_idx
  ON public.repuestos_ventas_vinculacion(producto_codigo, fecha_efectiva DESC, linea_id)
  WHERE estado_vinculo = 'CONFIRMADA' AND producto_codigo IS NOT NULL;

CREATE INDEX IF NOT EXISTS repuestos_conversiones_unidad_historica_codigo_activa_idx
  ON public.repuestos_conversiones_unidad_historica(codigo_legacy_norm, fecha_desde, fecha_hasta_exclusiva)
  WHERE activa;

CREATE OR REPLACE FUNCTION public.repuesto_ventas_historial(p_producto_codigo text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH producto AS MATERIALIZED (
    SELECT p.codigo_interno, p.codigo_fabricante
    FROM public.productos p
    WHERE p.codigo_interno = p_producto_codigo
      AND p.codigo_interno ILIKE 'REP%'
    LIMIT 1
  ),
  ventas AS (
    SELECT
      f.id AS linea_id,
      p.codigo_interno AS producto_codigo,
      p.codigo_fabricante AS producto_codigo_fabricante,
      coalesce(f.fecha_factura::date, v.fecha_efectiva) AS fecha_factura,
      coalesce(f.cantidad, v.cantidad, 0)::numeric AS cantidad_original,
      (coalesce(f.cantidad, v.cantidad, 0) * coalesce(conv.factor_cantidad, 1))::numeric AS cantidad,
      coalesce(f.total_venta, 0)::numeric AS total_venta_usd,
      f.entidad_nombre AS cliente,
      f.sucursal,
      coalesce(f.codigo_interno_factura, f.factura) AS factura,
      f.cod_mercaderia AS codigo_facturado,
      f.codigo_fabricante AS codigo_fabricante_facturado,
      f.mercaderia AS descripcion_facturada,
      coalesce(f.origen_sistema, 'historico') AS origen_sistema,
      coalesce(v.metodo_vinculo, 'vinculacion_confirmada') AS metodo_vinculo,
      coalesce(conv.factor_cantidad, 1)::numeric AS factor_conversion,
      conv.unidad_origen,
      conv.unidad_destino,
      conv.regla_clave
    FROM producto p
    JOIN public.repuestos_ventas_vinculacion v
      ON v.producto_codigo = p.codigo_interno
     AND v.estado_vinculo = 'CONFIRMADA'
    JOIN public.facturacion_lineas_importadas f
      ON f.id = v.linea_id
    LEFT JOIN LATERAL (
      SELECT regla.*
      FROM public.repuestos_conversiones_unidad_historica regla
      WHERE f.origen_sistema = 'legacy_historico_detallado'
        AND regla.activa
        AND regla.codigo_legacy_norm = public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia)
        AND (regla.fecha_desde IS NULL OR coalesce(f.fecha_factura::date, v.fecha_efectiva) >= regla.fecha_desde)
        AND (regla.fecha_hasta_exclusiva IS NULL OR coalesce(f.fecha_factura::date, v.fecha_efectiva) < regla.fecha_hasta_exclusiva)
        AND (regla.precio_unitario_min IS NULL OR abs(coalesce(f.total_venta, 0) / nullif(coalesce(f.cantidad, v.cantidad), 0)) >= regla.precio_unitario_min)
        AND (regla.precio_unitario_max IS NULL OR abs(coalesce(f.total_venta, 0) / nullif(coalesce(f.cantidad, v.cantidad), 0)) <= regla.precio_unitario_max)
      ORDER BY regla.id
      LIMIT 1
    ) conv ON true
    WHERE lower(trim(coalesce(f.grupo_normalizado, f.subgrupo_original, ''))) IN
      ('repuesto', 'repuestos', 'repuestos diversos')
      AND upper(coalesce(f.moneda, 'USD')) <> 'GS'
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'linea_id', linea_id,
    'producto_codigo', producto_codigo,
    'producto_codigo_fabricante', producto_codigo_fabricante,
    'fecha_factura', fecha_factura,
    'cantidad', cantidad,
    'cantidad_original', cantidad_original,
    'total_venta_usd', total_venta_usd,
    'cliente', cliente,
    'sucursal', sucursal,
    'factura', factura,
    'codigo_facturado', codigo_facturado,
    'codigo_fabricante_facturado', codigo_fabricante_facturado,
    'descripcion_facturada', descripcion_facturada,
    'origen_sistema', origen_sistema,
    'metodo_vinculo', metodo_vinculo,
    'factor_conversion', factor_conversion,
    'unidad_original', unidad_origen,
    'unidad_destino', unidad_destino,
    'regla_conversion', regla_clave,
    'conversion_aplicada', regla_clave IS NOT NULL
  ) ORDER BY fecha_factura DESC, factura DESC), '[]'::jsonb)
  FROM ventas;
$$;

COMMENT ON FUNCTION public.repuesto_ventas_historial(text) IS
  'Detalle indexado de ventas: consume exclusivamente vinculaciones confirmadas del historial consolidado.';

REVOKE ALL ON FUNCTION public.repuesto_ventas_historial(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repuesto_ventas_historial(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
