-- Aplica las conversiones historicas por codigo y precio a cualquier fuente.
-- La fuente canonica de una venta puede ser legacy_historico_detallado o
-- grid_campos despues de excluir duplicados; la unidad no depende del origen.

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
    sum(
      coalesce(f.cantidad, v.cantidad, 0) * coalesce(conv.factor_cantidad, 1)
    )::numeric AS unidades_netas,
    sum(greatest(
      coalesce(f.cantidad, v.cantidad, 0) * coalesce(conv.factor_cantidad, 1),
      0
    ))::numeric AS unidades_positivas,
    sum(abs(least(
      coalesce(f.cantidad, v.cantidad, 0) * coalesce(conv.factor_cantidad, 1),
      0
    )))::numeric AS devoluciones,
    count(DISTINCT coalesce(f.codigo_interno_factura, f.factura, f.id::text))::integer AS pedidos,
    sum(CASE
      WHEN upper(coalesce(f.moneda, 'USD')) IN ('GS', 'GRS', 'PYG') THEN 0
      ELSE coalesce(f.total_venta, 0)
    END)::numeric AS importe_comparable
  FROM public.facturacion_lineas_importadas f
  JOIN public.repuestos_ventas_vinculacion v ON v.linea_id = f.id
  LEFT JOIN LATERAL (
    SELECT regla.factor_cantidad
    FROM public.repuestos_conversiones_unidad_historica regla
    WHERE regla.activa
      AND regla.codigo_legacy_norm = public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia)
      AND (regla.fecha_desde IS NULL OR v.fecha_efectiva >= regla.fecha_desde)
      AND (regla.fecha_hasta_exclusiva IS NULL OR v.fecha_efectiva < regla.fecha_hasta_exclusiva)
      AND (
        regla.precio_unitario_min IS NULL
        OR abs(
          coalesce(f.total_venta, 0)
          / nullif(coalesce(f.cantidad, v.cantidad, 0), 0)
        ) >= regla.precio_unitario_min
      )
      AND (
        regla.precio_unitario_max IS NULL
        OR abs(
          coalesce(f.total_venta, 0)
          / nullif(coalesce(f.cantidad, v.cantidad, 0), 0)
        ) <= regla.precio_unitario_max
      )
    ORDER BY regla.id
    LIMIT 1
  ) conv ON true
  WHERE v.estado_vinculo = 'CONFIRMADA'
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

REVOKE ALL ON FUNCTION public.repuestos_publicar_historial_lote(date, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repuestos_publicar_historial_lote(date, date)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.repuesto_ventas_historial(p_producto_codigo text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
SET statement_timeout = '20s'
AS $$
  WITH ventas AS (
    SELECT
      f.id AS linea_id,
      p.codigo_interno AS producto_codigo,
      p.codigo_fabricante AS producto_codigo_fabricante,
      coalesce(f.fecha_factura::date, v.fecha_efectiva) AS fecha_factura,
      coalesce(f.cantidad, v.cantidad, 0)::numeric AS cantidad_original,
      (
        coalesce(f.cantidad, v.cantidad, 0)
        * coalesce(conv.factor_cantidad, 1)
      )::numeric AS cantidad,
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
    FROM public.productos p
    JOIN public.repuestos_ventas_vinculacion v
      ON v.producto_codigo = p.codigo_interno
     AND v.estado_vinculo = 'CONFIRMADA'
    JOIN public.facturacion_lineas_importadas f ON f.id = v.linea_id
    LEFT JOIN LATERAL (
      SELECT regla.*
      FROM public.repuestos_conversiones_unidad_historica regla
      WHERE regla.activa
        AND regla.codigo_legacy_norm = public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia)
        AND (
          regla.fecha_desde IS NULL
          OR coalesce(f.fecha_factura::date, v.fecha_efectiva) >= regla.fecha_desde
        )
        AND (
          regla.fecha_hasta_exclusiva IS NULL
          OR coalesce(f.fecha_factura::date, v.fecha_efectiva) < regla.fecha_hasta_exclusiva
        )
        AND (
          regla.precio_unitario_min IS NULL
          OR abs(
            coalesce(f.total_venta, 0)
            / nullif(coalesce(f.cantidad, v.cantidad, 0), 0)
          ) >= regla.precio_unitario_min
        )
        AND (
          regla.precio_unitario_max IS NULL
          OR abs(
            coalesce(f.total_venta, 0)
            / nullif(coalesce(f.cantidad, v.cantidad, 0), 0)
          ) <= regla.precio_unitario_max
        )
      ORDER BY regla.id
      LIMIT 1
    ) conv ON true
    WHERE p.codigo_interno = p_producto_codigo
      AND p.codigo_interno ILIKE 'REP%'
      AND lower(trim(coalesce(f.grupo_normalizado, f.subgrupo_original, ''))) IN
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
  ) ORDER BY fecha_factura DESC NULLS LAST, factura DESC), '[]'::jsonb)
  FROM ventas;
$$;

COMMENT ON FUNCTION public.repuesto_ventas_historial(text) IS
  'Detalle canonico sin duplicados y con conversiones de unidad independientes de la fuente.';

REVOKE ALL ON FUNCTION public.repuesto_ventas_historial(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repuesto_ventas_historial(text) TO authenticated;

-- Corrige inmediatamente solo los productos alcanzados por alguna conversion.
-- Luego reconstruye para ellos todas sus ventas (incluidos codigos posteriores
-- ya expresados en metros), evitando un recalculo masivo y timeouts.
CREATE TEMP TABLE tmp_productos_unidad_corregida ON COMMIT DROP AS
SELECT DISTINCT v.producto_codigo
FROM public.repuestos_ventas_vinculacion v
JOIN public.facturacion_lineas_importadas f ON f.id = v.linea_id
JOIN public.repuestos_conversiones_unidad_historica regla
  ON regla.activa
 AND regla.codigo_legacy_norm = public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia)
 AND (regla.fecha_desde IS NULL OR v.fecha_efectiva >= regla.fecha_desde)
 AND (regla.fecha_hasta_exclusiva IS NULL OR v.fecha_efectiva < regla.fecha_hasta_exclusiva)
 AND (
   regla.precio_unitario_min IS NULL
   OR abs(
     coalesce(f.total_venta, 0)
     / nullif(coalesce(f.cantidad, v.cantidad, 0), 0)
   ) >= regla.precio_unitario_min
 )
 AND (
   regla.precio_unitario_max IS NULL
   OR abs(
     coalesce(f.total_venta, 0)
     / nullif(coalesce(f.cantidad, v.cantidad, 0), 0)
   ) <= regla.precio_unitario_max
 )
WHERE v.estado_vinculo = 'CONFIRMADA'
  AND v.producto_codigo IS NOT NULL
  AND v.fecha_efectiva IS NOT NULL;

DELETE FROM public.repuestos_demanda_mensual d
WHERE d.producto_codigo IN (
  SELECT producto_codigo FROM tmp_productos_unidad_corregida
);

INSERT INTO public.repuestos_demanda_mensual(
  producto_codigo, mes, unidades_netas, unidades_positivas,
  devoluciones, pedidos, importe_comparable
)
SELECT
  v.producto_codigo,
  date_trunc('month', v.fecha_efectiva)::date,
  sum(
    coalesce(f.cantidad, v.cantidad, 0) * coalesce(conv.factor_cantidad, 1)
  )::numeric,
  sum(greatest(
    coalesce(f.cantidad, v.cantidad, 0) * coalesce(conv.factor_cantidad, 1),
    0
  ))::numeric,
  sum(abs(least(
    coalesce(f.cantidad, v.cantidad, 0) * coalesce(conv.factor_cantidad, 1),
    0
  )))::numeric,
  count(DISTINCT coalesce(f.codigo_interno_factura, f.factura, f.id::text))::integer,
  sum(CASE
    WHEN upper(coalesce(f.moneda, 'USD')) IN ('GS', 'GRS', 'PYG') THEN 0
    ELSE coalesce(f.total_venta, 0)
  END)::numeric
FROM public.repuestos_ventas_vinculacion v
JOIN public.facturacion_lineas_importadas f ON f.id = v.linea_id
LEFT JOIN LATERAL (
  SELECT regla.factor_cantidad
  FROM public.repuestos_conversiones_unidad_historica regla
  WHERE regla.activa
    AND regla.codigo_legacy_norm = public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia)
    AND (regla.fecha_desde IS NULL OR v.fecha_efectiva >= regla.fecha_desde)
    AND (regla.fecha_hasta_exclusiva IS NULL OR v.fecha_efectiva < regla.fecha_hasta_exclusiva)
    AND (
      regla.precio_unitario_min IS NULL
      OR abs(
        coalesce(f.total_venta, 0)
        / nullif(coalesce(f.cantidad, v.cantidad, 0), 0)
      ) >= regla.precio_unitario_min
    )
    AND (
      regla.precio_unitario_max IS NULL
      OR abs(
        coalesce(f.total_venta, 0)
        / nullif(coalesce(f.cantidad, v.cantidad, 0), 0)
      ) <= regla.precio_unitario_max
    )
  ORDER BY regla.id
  LIMIT 1
) conv ON true
WHERE v.estado_vinculo = 'CONFIRMADA'
  AND v.producto_codigo IS NOT NULL
  AND v.fecha_efectiva IS NOT NULL
  AND v.producto_codigo IN (
    SELECT producto_codigo FROM tmp_productos_unidad_corregida
  )
GROUP BY v.producto_codigo, date_trunc('month', v.fecha_efectiva)::date;

NOTIFY pgrst, 'reload schema';
