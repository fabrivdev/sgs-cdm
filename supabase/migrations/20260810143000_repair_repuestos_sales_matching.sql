-- Preserve exact product codes and add a controlled fallback for manufacturer
-- codes printed as the final token of the product description. For example,
-- "CONTRATUERCA - 237947.0" represents manufacturer code "237947"; it must
-- not be collapsed into the distinct formal code "2379470".
CREATE OR REPLACE FUNCTION public.normalizar_codigo_repuesto_flexible(p_codigo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(
    regexp_replace(
      upper(regexp_replace(trim(coalesce(p_codigo, '')), '\.0+$', '')),
      '[^A-Z0-9]',
      '',
      'g'
    ),
    ''
  );
$$;

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
    CASE coincidencia.prioridad
      WHEN 1 THEN 'codigo_fabricante'
      WHEN 2 THEN 'codigo_interno'
      WHEN 3 THEN 'codigo_facturado_fabricante'
      ELSE 'descripcion_codigo_fabricante'
    END AS metodo_vinculo
  FROM public.productos p
  CROSS JOIN LATERAL (
    SELECT public.normalizar_codigo_repuesto_flexible(
      substring(
        upper(trim(coalesce(p.descripcion, '')))
        from '([A-Z0-9][A-Z0-9./-]*[0-9])$'
      )
    ) AS codigo_descripcion
  ) descripcion
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN public.normalizar_codigo_repuesto(f.codigo_fabricante) IS NOT NULL
       AND public.normalizar_codigo_repuesto(f.codigo_fabricante) = public.normalizar_codigo_repuesto(p.codigo_fabricante)
        THEN 1
      WHEN public.normalizar_codigo_repuesto(f.cod_mercaderia) IS NOT NULL
       AND public.normalizar_codigo_repuesto(f.cod_mercaderia) = public.normalizar_codigo_repuesto(p.codigo_interno)
        THEN 2
      WHEN public.normalizar_codigo_repuesto(f.cod_mercaderia) IS NOT NULL
       AND public.normalizar_codigo_repuesto(f.cod_mercaderia) = public.normalizar_codigo_repuesto(p.codigo_fabricante)
        THEN 3
      WHEN length(descripcion.codigo_descripcion) >= 4
       AND public.normalizar_codigo_repuesto_flexible(f.codigo_fabricante) IS NOT NULL
       AND public.normalizar_codigo_repuesto_flexible(f.codigo_fabricante) = descripcion.codigo_descripcion
        THEN 4
      WHEN length(descripcion.codigo_descripcion) >= 4
       AND public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia) IS NOT NULL
       AND public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia) = descripcion.codigo_descripcion
        THEN 5
      ELSE NULL
    END AS prioridad
  ) coincidencia
  WHERE coincidencia.prioridad IS NOT NULL
    AND p.codigo_interno ILIKE 'REP%'
  ORDER BY coincidencia.prioridad, p.codigo_interno
  LIMIT 1
) producto ON true
WHERE lower(trim(coalesce(f.grupo_normalizado, f.subgrupo_original, ''))) IN (
    'repuesto',
    'repuestos',
    'repuestos diversos'
  )
  AND upper(coalesce(f.moneda, 'USD')) <> 'GS';

COMMENT ON VIEW public.v_repuestos_ventas_unificadas IS
  'Ventas legacy y actuales vinculadas por códigos exactos o, como respaldo auditable, por el código fabricante al final de la descripción del producto.';

GRANT SELECT ON public.v_repuestos_ventas_unificadas TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalizar_codigo_repuesto_flexible(text) TO authenticated;
