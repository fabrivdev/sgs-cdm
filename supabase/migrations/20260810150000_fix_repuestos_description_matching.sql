-- Repair spare-parts sales matching when the manufacturer code is printed at
-- the end of a description. Punctuation is formatting, so "239388.0" maps to
-- manufacturer code "2393880" instead of the unrelated code "239388".
CREATE OR REPLACE FUNCTION public.normalizar_codigo_repuesto_flexible(p_codigo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(
    regexp_replace(upper(trim(coalesce(p_codigo, ''))), '[^A-Z0-9]', '', 'g'),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.extraer_codigo_repuesto_descripcion(p_descripcion text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT public.normalizar_codigo_repuesto_flexible(
    substring(
      upper(trim(coalesce(p_descripcion, '')))
      from '([A-Z0-9][A-Z0-9./-]*[0-9])$'
    )
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
      WHEN 4 THEN 'descripcion_facturada_codigo_fabricante'
      WHEN 5 THEN 'descripcion_descripcion'
      ELSE 'descripcion_codigo_fabricante'
    END AS metodo_vinculo
  FROM public.productos p
  CROSS JOIN LATERAL (
    SELECT
      public.extraer_codigo_repuesto_descripcion(p.descripcion) AS codigo_producto_descripcion,
      public.extraer_codigo_repuesto_descripcion(f.mercaderia) AS codigo_factura_descripcion
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
      WHEN length(descripcion.codigo_factura_descripcion) >= 4
       AND descripcion.codigo_factura_descripcion = public.normalizar_codigo_repuesto_flexible(p.codigo_fabricante)
        THEN 4
      WHEN length(descripcion.codigo_factura_descripcion) >= 4
       AND length(descripcion.codigo_producto_descripcion) >= 4
       AND descripcion.codigo_factura_descripcion = descripcion.codigo_producto_descripcion
        THEN 5
      WHEN length(descripcion.codigo_producto_descripcion) >= 4
       AND public.normalizar_codigo_repuesto_flexible(f.codigo_fabricante) IS NOT NULL
       AND public.normalizar_codigo_repuesto_flexible(f.codigo_fabricante) = descripcion.codigo_producto_descripcion
        THEN 6
      WHEN length(descripcion.codigo_producto_descripcion) >= 4
       AND public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia) IS NOT NULL
       AND public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia) = descripcion.codigo_producto_descripcion
        THEN 7
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
  'Ventas de repuestos vinculadas primero por codigos formales y, como respaldo auditable, por el codigo fabricante impreso al final de las descripciones.';

GRANT SELECT ON public.v_repuestos_ventas_unificadas TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalizar_codigo_repuesto_flexible(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.extraer_codigo_repuesto_descripcion(text) TO authenticated;
