-- Hotfix: la recuperacion lateral de fecha agregada en 15:00 podia recorrer
-- toda la facturacion por cada venta del producto y agotar statement_timeout.
-- Se resuelve cada factura una sola vez mediante una clave indexada.

CREATE INDEX IF NOT EXISTS facturacion_lineas_clave_fecha_idx
  ON public.facturacion_lineas_importadas (
    (coalesce(codigo_interno_factura, factura)),
    fecha_factura
  )
  WHERE fecha_factura IS NOT NULL;

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
  lineas_producto AS MATERIALIZED (
    SELECT
      f.id AS linea_id,
      p.codigo_interno AS producto_codigo,
      p.codigo_fabricante AS producto_codigo_fabricante,
      f.fecha_factura,
      v.fecha_efectiva AS fecha_vinculada,
      coalesce(f.cantidad, v.cantidad, 0)::numeric AS cantidad_original,
      coalesce(f.total_venta, 0)::numeric AS total_venta_usd,
      f.entidad_nombre AS cliente,
      f.sucursal,
      coalesce(f.codigo_interno_factura, f.factura) AS factura,
      f.cod_mercaderia AS codigo_facturado,
      f.codigo_fabricante AS codigo_fabricante_facturado,
      f.mercaderia AS descripcion_facturada,
      coalesce(f.origen_sistema, 'historico') AS origen_sistema,
      coalesce(v.metodo_vinculo, 'vinculacion_confirmada') AS metodo_vinculo
    FROM producto p
    JOIN public.repuestos_ventas_vinculacion v
      ON v.producto_codigo = p.codigo_interno
     AND v.estado_vinculo = 'CONFIRMADA'
    JOIN public.facturacion_lineas_importadas f ON f.id = v.linea_id
    WHERE lower(trim(coalesce(f.grupo_normalizado, f.subgrupo_original, ''))) IN
      ('repuesto', 'repuestos', 'repuestos diversos')
      AND upper(coalesce(f.moneda, 'USD')) <> 'GS'
  ),
  claves AS MATERIALIZED (
    SELECT DISTINCT factura
    FROM lineas_producto
    WHERE factura IS NOT NULL
      AND fecha_factura IS NULL
      AND fecha_vinculada IS NULL
  ),
  fechas_lineas AS MATERIALIZED (
    SELECT
      coalesce(f.codigo_interno_factura, f.factura) AS factura,
      min(f.fecha_factura::date) AS fecha_factura
    FROM claves c
    JOIN public.facturacion_lineas_importadas f
      ON coalesce(f.codigo_interno_factura, f.factura) = c.factura
    WHERE f.fecha_factura IS NOT NULL
    GROUP BY coalesce(f.codigo_interno_factura, f.factura)
    HAVING count(DISTINCT f.fecha_factura::date) = 1
  ),
  fechas_cabecera AS MATERIALIZED (
    SELECT
      c.factura,
      min(f.fecha) AS fecha_factura
    FROM claves c
    JOIN public.facturacion f ON lower(f.cod_factura) = lower(c.factura)
    GROUP BY c.factura
    HAVING count(DISTINCT f.fecha) = 1
  ),
  ventas AS (
    SELECT
      l.linea_id,
      l.producto_codigo,
      l.producto_codigo_fabricante,
      coalesce(
        l.fecha_factura::date,
        l.fecha_vinculada,
        fl.fecha_factura,
        fc.fecha_factura
      ) AS fecha_factura,
      l.cantidad_original,
      (l.cantidad_original * coalesce(conv.factor_cantidad, 1))::numeric AS cantidad,
      l.total_venta_usd,
      l.cliente,
      l.sucursal,
      l.factura,
      l.codigo_facturado,
      l.codigo_fabricante_facturado,
      l.descripcion_facturada,
      l.origen_sistema,
      l.metodo_vinculo,
      coalesce(conv.factor_cantidad, 1)::numeric AS factor_conversion,
      conv.unidad_origen,
      conv.unidad_destino,
      conv.regla_clave
    FROM lineas_producto l
    LEFT JOIN fechas_lineas fl ON fl.factura = l.factura
    LEFT JOIN fechas_cabecera fc ON fc.factura = l.factura
    LEFT JOIN LATERAL (
      SELECT regla.*
      FROM public.repuestos_conversiones_unidad_historica regla
      WHERE l.origen_sistema = 'legacy_historico_detallado'
        AND regla.activa
        AND regla.codigo_legacy_norm = public.normalizar_codigo_repuesto_flexible(l.codigo_facturado)
        AND (
          regla.fecha_desde IS NULL
          OR coalesce(l.fecha_factura::date, l.fecha_vinculada, fl.fecha_factura, fc.fecha_factura) >= regla.fecha_desde
        )
        AND (
          regla.fecha_hasta_exclusiva IS NULL
          OR coalesce(l.fecha_factura::date, l.fecha_vinculada, fl.fecha_factura, fc.fecha_factura) < regla.fecha_hasta_exclusiva
        )
        AND (
          regla.precio_unitario_min IS NULL
          OR abs(l.total_venta_usd / nullif(l.cantidad_original, 0)) >= regla.precio_unitario_min
        )
        AND (
          regla.precio_unitario_max IS NULL
          OR abs(l.total_venta_usd / nullif(l.cantidad_original, 0)) <= regla.precio_unitario_max
        )
      ORDER BY regla.id
      LIMIT 1
    ) conv ON true
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
  ) ORDER BY fecha_factura DESC NULLS LAST, factura DESC), '[]'::jsonb)
  FROM ventas;
$$;

COMMENT ON FUNCTION public.repuesto_ventas_historial(text) IS
  'Detalle indexado de ventas confirmadas; resuelve una sola vez la fecha omitida por factura TOTVS.';

-- Politica solicitada para repuestos sin marca especifica.
UPDATE public.repuestos_modelo_versiones
SET origen_predeterminado = 'PARAGUAY',
    lead_time_meses = 2
WHERE marca = 'OTROS'::public.marca
  AND activa;

-- Corrige solamente valores heredados del default anterior; respeta cualquier
-- origen distinto que un usuario haya elegido manualmente.
UPDATE public.repuestos_articulo_planificacion ap
SET origen = 'PARAGUAY',
    actualizado_en = now()
FROM public.productos p
WHERE p.codigo_interno = ap.producto_codigo
  AND p.marca = 'OTROS'::public.marca
  AND upper(trim(coalesce(ap.origen, 'ALEMANIA'))) = 'ALEMANIA';

REVOKE ALL ON FUNCTION public.repuesto_ventas_historial(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repuesto_ventas_historial(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
