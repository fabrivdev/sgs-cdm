-- Historial de ventas acotado al repuesto abierto.
-- Esta migracion es autocontenida para que pueda aplicarse aunque la reparacion
-- previa del normalizador no haya sido desplegada.

CREATE OR REPLACE FUNCTION public.normalizar_codigo_repuesto_flexible(p_codigo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
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
SET search_path = public, pg_temp
AS $$
  SELECT public.normalizar_codigo_repuesto_flexible(
    substring(
      upper(trim(coalesce(p_descripcion, '')))
      from '([A-Z0-9][A-Z0-9./-]*[0-9])$'
    )
  );
$$;

-- Los indices de expresion deben reconstruirse porque su valor depende de la
-- implementacion del normalizador. 237947.0 debe indexarse como 2379470.
DROP INDEX IF EXISTS public.idx_fact_lineas_rep_codigo_fabricante_flexible;
DROP INDEX IF EXISTS public.idx_fact_lineas_rep_cod_mercaderia_flexible;
DROP INDEX IF EXISTS public.idx_fact_lineas_rep_descripcion_codigo;
DROP INDEX IF EXISTS public.idx_productos_rep_descripcion_codigo;

CREATE INDEX idx_fact_lineas_rep_codigo_fabricante_flexible
  ON public.facturacion_lineas_importadas (
    public.normalizar_codigo_repuesto_flexible(codigo_fabricante)
  );

CREATE INDEX idx_fact_lineas_rep_cod_mercaderia_flexible
  ON public.facturacion_lineas_importadas (
    public.normalizar_codigo_repuesto_flexible(cod_mercaderia)
  );

CREATE INDEX idx_fact_lineas_rep_descripcion_codigo
  ON public.facturacion_lineas_importadas (
    public.extraer_codigo_repuesto_descripcion(mercaderia)
  );

CREATE INDEX idx_productos_rep_descripcion_codigo
  ON public.productos (
    public.extraer_codigo_repuesto_descripcion(descripcion)
  )
  WHERE codigo_interno ILIKE 'REP%';

CREATE OR REPLACE FUNCTION public.repuesto_ventas_historial(p_producto_codigo text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH producto AS MATERIALIZED (
    SELECT
      p.codigo_interno,
      p.codigo_fabricante,
      p.descripcion,
      public.normalizar_codigo_repuesto_flexible(p.codigo_interno) AS codigo_interno_norm,
      public.normalizar_codigo_repuesto_flexible(p.codigo_fabricante) AS codigo_fabricante_norm,
      public.extraer_codigo_repuesto_descripcion(p.descripcion) AS codigo_descripcion_norm
    FROM public.productos p
    WHERE p.codigo_interno = p_producto_codigo
      AND p.codigo_interno ILIKE 'REP%'
    LIMIT 1
  ),
  candidatos AS (
    SELECT f.id AS linea_id, 1 AS prioridad, 'codigo_fabricante'::text AS metodo_vinculo
    FROM producto p
    JOIN public.facturacion_lineas_importadas f
      ON public.normalizar_codigo_repuesto_flexible(f.codigo_fabricante) = p.codigo_fabricante_norm
    WHERE p.codigo_fabricante_norm IS NOT NULL

    UNION ALL

    SELECT f.id, 2, 'codigo_interno'
    FROM producto p
    JOIN public.facturacion_lineas_importadas f
      ON public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia) = p.codigo_interno_norm
    WHERE p.codigo_interno_norm IS NOT NULL

    UNION ALL

    SELECT f.id, 3, 'codigo_facturado_fabricante'
    FROM producto p
    JOIN public.facturacion_lineas_importadas f
      ON public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia) = p.codigo_fabricante_norm
    WHERE p.codigo_fabricante_norm IS NOT NULL

    UNION ALL

    SELECT f.id, 4, 'descripcion_facturada_codigo_fabricante'
    FROM producto p
    JOIN public.facturacion_lineas_importadas f
      ON public.extraer_codigo_repuesto_descripcion(f.mercaderia) = p.codigo_fabricante_norm
    WHERE p.codigo_fabricante_norm IS NOT NULL

    UNION ALL

    SELECT f.id, 5, 'descripcion_descripcion'
    FROM producto p
    JOIN public.facturacion_lineas_importadas f
      ON public.extraer_codigo_repuesto_descripcion(f.mercaderia) = p.codigo_descripcion_norm
    WHERE p.codigo_descripcion_norm IS NOT NULL

    UNION ALL

    SELECT f.id, 6, 'descripcion_codigo_fabricante'
    FROM producto p
    JOIN public.facturacion_lineas_importadas f
      ON public.normalizar_codigo_repuesto_flexible(f.codigo_fabricante) = p.codigo_descripcion_norm
    WHERE p.codigo_descripcion_norm IS NOT NULL

    UNION ALL

    SELECT f.id, 7, 'descripcion_codigo_facturado'
    FROM producto p
    JOIN public.facturacion_lineas_importadas f
      ON public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia) = p.codigo_descripcion_norm
    WHERE p.codigo_descripcion_norm IS NOT NULL
  ),
  unicos AS (
    SELECT DISTINCT ON (linea_id) linea_id, metodo_vinculo
    FROM candidatos
    ORDER BY linea_id, prioridad
  ),
  ventas AS (
    SELECT
      f.id AS linea_id,
      p.codigo_interno AS producto_codigo,
      p.codigo_fabricante AS producto_codigo_fabricante,
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
      u.metodo_vinculo
    FROM unicos u
    JOIN public.facturacion_lineas_importadas f ON f.id = u.linea_id
    CROSS JOIN producto p
    WHERE lower(trim(coalesce(f.grupo_normalizado, f.subgrupo_original, ''))) IN (
        'repuesto', 'repuestos', 'repuestos diversos'
      )
      AND upper(coalesce(f.moneda, 'USD')) <> 'GS'
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'linea_id', linea_id,
        'producto_codigo', producto_codigo,
        'producto_codigo_fabricante', producto_codigo_fabricante,
        'fecha_factura', fecha_factura,
        'cantidad', cantidad,
        'total_venta_usd', total_venta_usd,
        'cliente', cliente,
        'sucursal', sucursal,
        'factura', factura,
        'codigo_facturado', codigo_facturado,
        'codigo_fabricante_facturado', codigo_fabricante_facturado,
        'descripcion_facturada', descripcion_facturada,
        'origen_sistema', origen_sistema,
        'metodo_vinculo', metodo_vinculo
      )
      ORDER BY fecha_factura DESC, factura DESC
    ),
    '[]'::jsonb
  )
  FROM ventas;
$$;

COMMENT ON FUNCTION public.repuesto_ventas_historial(text) IS
  'Historial unificado de ventas de un repuesto por codigos formales o codigo al final de la descripcion.';

REVOKE ALL ON FUNCTION public.repuesto_ventas_historial(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repuesto_ventas_historial(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalizar_codigo_repuesto_flexible(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.extraer_codigo_repuesto_descripcion(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
