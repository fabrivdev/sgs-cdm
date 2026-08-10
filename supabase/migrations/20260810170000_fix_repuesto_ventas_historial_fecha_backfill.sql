-- Bug confirmado: en el historial de ventas de un repuesto aparecian
-- lineas "Sin fecha" que correspondian a la MISMA factura que otra linea
-- con fecha si tenia. fecha_factura es una columna plana por linea (no
-- se hereda de ninguna cabecera) que se carga 1:1 desde la columna EMISION
-- del XML de ventas de TOTVS durante el import (mapFacturaVentasSheet,
-- src/lib/imports/newSystemXml.ts) -- sin ningun forward-fill. El export
-- de TOTVS trae EMISION poblada solo en algunas lineas de una factura
-- multi-linea, dejando las demas lineas de esa misma factura sin fecha.
--
-- Se corrige en el RPC (no en el importador) para que el historial ya
-- cargado se vea bien de inmediato, sin reimportar nada: si una linea
-- matcheada no tiene fecha_factura, se completa con la de otra linea
-- de la MISMA factura (por codigo_interno_factura/factura) que si la
-- tenga.

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
      coalesce(f.fecha_factura, hermana.fecha_factura) AS fecha_factura,
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
    LEFT JOIN LATERAL (
      SELECT f2.fecha_factura
      FROM public.facturacion_lineas_importadas f2
      WHERE f.fecha_factura IS NULL
        AND coalesce(f.codigo_interno_factura, f.factura) IS NOT NULL
        AND coalesce(f2.codigo_interno_factura, f2.factura) = coalesce(f.codigo_interno_factura, f.factura)
        AND f2.fecha_factura IS NOT NULL
      ORDER BY f2.fecha_factura
      LIMIT 1
    ) hermana ON true
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
  'Historial unificado de ventas de un repuesto por codigos formales o codigo al final de la descripcion. fecha_factura se completa con una linea hermana de la misma factura cuando falta.';

NOTIFY pgrst, 'reload schema';
