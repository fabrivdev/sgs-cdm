-- Permite que el filtro de marca del Parque limite tambien la actividad
-- facturada del cliente. El historico conserva su fuente resumida y, desde
-- el cambio de sistema, se usan las lineas detalladas para no perder la marca.

CREATE OR REPLACE FUNCTION public.parque_resumen_facturacion_marca(
  p_desde date,
  p_hasta date,
  p_prev_desde date,
  p_prev_hasta date,
  p_marca text
)
RETURNS TABLE (
  cliente_id uuid,
  fact_actual numeric,
  fact_prev numeric,
  tiene_rep_rango boolean,
  tiene_srv_rango boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH historico AS (
    SELECT
      f.cliente_id,
      f.fecha,
      f.total_venta,
      lower(trim(coalesce(f.grupo_fx, ''))) AS grupo_fx,
      coalesce(
        f.marca_normalizada::text,
        public.facturacion_marca_por_grupo(f.grupo)::text
      ) AS marca
    FROM public.facturacion f
    WHERE f.cliente_id IS NOT NULL
      AND f.fecha < date '2026-07-01'
      AND NOT f.excluido_de_reportes
      AND lower(trim(coalesce(f.grupo_fx, ''))) IN (
        'repuestos',
        'mano de obra',
        'servicio',
        'servicios',
        'kilometraje'
      )
  ),
  nuevo_sistema AS (
    SELECT
      coalesce(cliente_factura.cliente_id, cliente_nombre.cliente_id) AS cliente_id,
      fl.fecha_factura::date AS fecha,
      fl.total_venta,
      lower(trim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, ''))) AS grupo_fx,
      fl.marca_normalizada::text AS marca
    FROM public.facturacion_lineas_importadas fl
    LEFT JOIN LATERAL (
      SELECT f.cliente_id
      FROM public.facturacion f
      WHERE f.cliente_id IS NOT NULL
        AND f.fecha = fl.fecha_factura::date
        AND (
          upper(trim(f.cod_factura)) = upper(trim(coalesce(fl.factura, '')))
          OR upper(trim(f.cod_factura)) = upper(trim(coalesce(fl.codigo_interno_factura, '')))
        )
        AND (fl.sucursal IS NULL OR f.sucursal IS NULL OR f.sucursal = fl.sucursal)
      ORDER BY
        CASE
          WHEN upper(trim(f.cod_factura)) = upper(trim(coalesce(fl.factura, ''))) THEN 0
          ELSE 1
        END,
        f.importado_en DESC
      LIMIT 1
    ) cliente_factura ON true
    LEFT JOIN LATERAL (
      SELECT c.id AS cliente_id
      FROM public.clientes c
      WHERE lower(trim(c.nombre)) = lower(trim(fl.entidad_nombre))
      ORDER BY c.creado_en
      LIMIT 1
    ) cliente_nombre ON cliente_factura.cliente_id IS NULL
    WHERE fl.fecha_factura::date >= date '2026-07-01'
      AND lower(trim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, ''))) IN (
        'repuestos',
        'repuesto',
        'mano de obra',
        'servicio',
        'servicios',
        'kilometraje'
      )
  ),
  base AS (
    SELECT * FROM historico
    UNION ALL
    SELECT * FROM nuevo_sistema WHERE cliente_id IS NOT NULL
  ),
  filtrada AS (
    SELECT *
    FROM base
    WHERE CASE
      WHEN upper(trim(coalesce(p_marca, ''))) IN ('', 'ALL', 'TODOS') THEN true
      WHEN upper(trim(p_marca)) IN ('AMBAS', 'C/AMBAS') THEN marca IN ('CLAAS', 'HORSCH')
      ELSE marca = upper(trim(p_marca))
    END
  )
  SELECT
    f.cliente_id,
    coalesce(sum(f.total_venta) FILTER (WHERE f.fecha BETWEEN p_desde AND p_hasta), 0) AS fact_actual,
    coalesce(sum(f.total_venta) FILTER (WHERE f.fecha BETWEEN p_prev_desde AND p_prev_hasta), 0) AS fact_prev,
    coalesce(bool_or(
      f.fecha BETWEEN p_desde AND p_hasta
      AND f.grupo_fx IN ('repuestos', 'repuesto')
    ), false) AS tiene_rep_rango,
    coalesce(bool_or(
      f.fecha BETWEEN p_desde AND p_hasta
      AND f.grupo_fx IN ('mano de obra', 'servicio', 'servicios', 'kilometraje')
    ), false) AS tiene_srv_rango
  FROM filtrada f
  WHERE (
    f.fecha BETWEEN p_desde AND p_hasta
    OR f.fecha BETWEEN p_prev_desde AND p_prev_hasta
  )
  GROUP BY f.cliente_id;
$$;

CREATE OR REPLACE FUNCTION public.parque_ultimas_facturas_marca(
  p_marca text
)
RETURNS TABLE (
  cliente_id uuid,
  ult_repuesto date,
  ult_servicio date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH historico AS (
    SELECT
      f.cliente_id,
      f.fecha,
      lower(trim(coalesce(f.grupo_fx, ''))) AS grupo_fx,
      coalesce(
        f.marca_normalizada::text,
        public.facturacion_marca_por_grupo(f.grupo)::text
      ) AS marca
    FROM public.facturacion f
    WHERE f.cliente_id IS NOT NULL
      AND f.fecha < date '2026-07-01'
      AND NOT f.excluido_de_reportes
      AND lower(trim(coalesce(f.grupo_fx, ''))) IN (
        'repuestos',
        'mano de obra',
        'servicio',
        'servicios',
        'kilometraje'
      )
  ),
  nuevo_sistema AS (
    SELECT
      coalesce(cliente_factura.cliente_id, cliente_nombre.cliente_id) AS cliente_id,
      fl.fecha_factura::date AS fecha,
      lower(trim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, ''))) AS grupo_fx,
      fl.marca_normalizada::text AS marca
    FROM public.facturacion_lineas_importadas fl
    LEFT JOIN LATERAL (
      SELECT f.cliente_id
      FROM public.facturacion f
      WHERE f.cliente_id IS NOT NULL
        AND f.fecha = fl.fecha_factura::date
        AND (
          upper(trim(f.cod_factura)) = upper(trim(coalesce(fl.factura, '')))
          OR upper(trim(f.cod_factura)) = upper(trim(coalesce(fl.codigo_interno_factura, '')))
        )
        AND (fl.sucursal IS NULL OR f.sucursal IS NULL OR f.sucursal = fl.sucursal)
      ORDER BY
        CASE
          WHEN upper(trim(f.cod_factura)) = upper(trim(coalesce(fl.factura, ''))) THEN 0
          ELSE 1
        END,
        f.importado_en DESC
      LIMIT 1
    ) cliente_factura ON true
    LEFT JOIN LATERAL (
      SELECT c.id AS cliente_id
      FROM public.clientes c
      WHERE lower(trim(c.nombre)) = lower(trim(fl.entidad_nombre))
      ORDER BY c.creado_en
      LIMIT 1
    ) cliente_nombre ON cliente_factura.cliente_id IS NULL
    WHERE fl.fecha_factura::date >= date '2026-07-01'
      AND lower(trim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, ''))) IN (
        'repuestos',
        'repuesto',
        'mano de obra',
        'servicio',
        'servicios',
        'kilometraje'
      )
  ),
  base AS (
    SELECT * FROM historico
    UNION ALL
    SELECT * FROM nuevo_sistema WHERE cliente_id IS NOT NULL
  )
  SELECT
    f.cliente_id,
    max(f.fecha) FILTER (WHERE f.grupo_fx IN ('repuestos', 'repuesto')) AS ult_repuesto,
    max(f.fecha) FILTER (
      WHERE f.grupo_fx IN ('mano de obra', 'servicio', 'servicios', 'kilometraje')
    ) AS ult_servicio
  FROM base f
  WHERE CASE
    WHEN upper(trim(coalesce(p_marca, ''))) IN ('', 'ALL', 'TODOS') THEN true
    WHEN upper(trim(p_marca)) IN ('AMBAS', 'C/AMBAS') THEN f.marca IN ('CLAAS', 'HORSCH')
    ELSE f.marca = upper(trim(p_marca))
  END
  GROUP BY f.cliente_id;
$$;

GRANT EXECUTE ON FUNCTION public.parque_resumen_facturacion_marca(date, date, date, date, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.parque_ultimas_facturas_marca(text)
  TO authenticated;
