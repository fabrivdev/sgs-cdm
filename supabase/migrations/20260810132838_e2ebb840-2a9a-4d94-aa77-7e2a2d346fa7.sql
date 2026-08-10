CREATE INDEX IF NOT EXISTS idx_productos_norm_fabricante
  ON public.productos (public.normalizar_codigo_repuesto(codigo_fabricante));
CREATE INDEX IF NOT EXISTS idx_productos_norm_interno
  ON public.productos (public.normalizar_codigo_repuesto(codigo_interno));

CREATE OR REPLACE VIEW public.v_repuestos_ventas_unificadas
WITH (security_invoker = true)
AS
SELECT
  f.id AS linea_id,
  producto.codigo_interno AS producto_codigo,
  producto.codigo_fabricante AS producto_codigo_fabricante,
  producto.descripcion AS producto_descripcion,
  producto.marca AS producto_marca,
  producto.familia AS producto_familia,
  f.fecha_factura,
  coalesce(f.cantidad, 0)::numeric AS cantidad,
  coalesce(f.total_venta, 0)::numeric AS total_venta_usd,
  f.entidad_nombre AS cliente,
  f.sucursal,
  coalesce(f.codigo_interno_factura, f.factura) AS factura,
  f.cod_mercaderia AS codigo_facturado,
  f.codigo_fabricante AS codigo_fabricante_facturado,
  f.mercaderia AS descripcion_facturada,
  coalesce(f.origen_sistema, 'historico') AS origen_sistema,
  producto.metodo_vinculo
FROM public.facturacion_lineas_importadas f
JOIN LATERAL (
  SELECT
    p.codigo_interno,
    p.codigo_fabricante,
    p.descripcion,
    p.marca,
    p.familia,
    CASE
      WHEN public.normalizar_codigo_repuesto(f.codigo_fabricante) IS NOT NULL
       AND public.normalizar_codigo_repuesto(f.codigo_fabricante) = public.normalizar_codigo_repuesto(p.codigo_fabricante)
        THEN 1
      WHEN public.normalizar_codigo_repuesto(f.cod_mercaderia) IS NOT NULL
       AND public.normalizar_codigo_repuesto(f.cod_mercaderia) = public.normalizar_codigo_repuesto(p.codigo_interno)
        THEN 2
      ELSE 3
    END AS prioridad,
    CASE
      WHEN public.normalizar_codigo_repuesto(f.codigo_fabricante) IS NOT NULL
       AND public.normalizar_codigo_repuesto(f.codigo_fabricante) = public.normalizar_codigo_repuesto(p.codigo_fabricante)
        THEN 'codigo_fabricante'
      WHEN public.normalizar_codigo_repuesto(f.cod_mercaderia) IS NOT NULL
       AND public.normalizar_codigo_repuesto(f.cod_mercaderia) = public.normalizar_codigo_repuesto(p.codigo_interno)
        THEN 'codigo_interno'
      ELSE 'codigo_facturado_fabricante'
    END AS metodo_vinculo
  FROM public.productos p
  WHERE p.codigo_interno ILIKE 'REP%'
    AND (
      public.normalizar_codigo_repuesto(p.codigo_fabricante)
        = public.normalizar_codigo_repuesto(f.codigo_fabricante)
      OR public.normalizar_codigo_repuesto(p.codigo_interno)
        = public.normalizar_codigo_repuesto(f.cod_mercaderia)
      OR public.normalizar_codigo_repuesto(p.codigo_fabricante)
        = public.normalizar_codigo_repuesto(f.cod_mercaderia)
    )
  ORDER BY prioridad, p.codigo_interno
  LIMIT 1
) producto ON true
WHERE lower(trim(coalesce(f.grupo_normalizado, f.subgrupo_original, ''))) IN (
    'repuesto',
    'repuestos',
    'repuestos diversos'
  )
  AND upper(coalesce(f.moneda, 'USD')) <> 'GS';

COMMENT ON VIEW public.v_repuestos_ventas_unificadas IS
  'Ventas detalladas legacy y actuales vinculadas a un único repuesto por código estable. No incluye la tabla agregada facturacion para evitar doble conteo.';

GRANT SELECT ON public.v_repuestos_ventas_unificadas TO authenticated;