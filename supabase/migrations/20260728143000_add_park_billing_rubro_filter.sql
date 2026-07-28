-- Agrega el filtro combinado de marca y rubro a la facturacion visible
-- en Parque. El rubro limita solamente los importes del periodo; las
-- senales de actividad comercial siguen considerando todos los rubros.

CREATE OR REPLACE FUNCTION public.parque_resumen_facturacion_filtros(
  p_desde date,
  p_hasta date,
  p_prev_desde date,
  p_prev_hasta date,
  p_marca text,
  p_rubro text
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
      CASE
        WHEN lower(trim(coalesce(f.grupo_fx, ''))) IN ('repuestos', 'repuesto')
          THEN 'REPUESTOS'
        WHEN lower(trim(coalesce(f.grupo_fx, ''))) = 'kilometraje'
          THEN 'KILOMETRAJE'
        WHEN lower(trim(coalesce(f.grupo_fx, ''))) IN ('mano de obra', 'servicio', 'servicios')
          THEN 'SERVICIO'
        ELSE 'OTROS'
      END AS rubro,
      upper(trim(coalesce(
        nullif(to_jsonb(f) ->> 'marca_normalizada', ''),
        CASE upper(trim(coalesce(f.grupo, '')))
          WHEN 'SERVICE - CLAAS' THEN 'CLAAS'
          WHEN 'REPUESTOS - CLAAS' THEN 'CLAAS'
          WHEN 'REPUESTOS CLAAS - PROMOCION' THEN 'CLAAS'
          WHEN 'REPUESTOS - CABEZALES/PLATAFOR' THEN 'CLAAS'
          WHEN 'REPUESTOS TRACTOR' THEN 'CLAAS'
          WHEN 'REPUESTOS DIVERSOS --' THEN 'CLAAS'
          WHEN 'SERVICE - HORSCH' THEN 'HORSCH'
          WHEN 'REPUESTOS PLANTADORA' THEN 'HORSCH'
          WHEN 'REPUESTOS PULVERIZADORAS' THEN 'HORSCH'
          ELSE 'OTROS'
        END
      ))) AS marca
    FROM public.facturacion f
    WHERE f.cliente_id IS NOT NULL
      AND f.fecha < date '2026-07-01'
      AND NOT coalesce(
        (to_jsonb(f) ->> 'excluido_de_reportes')::boolean,
        false
      )
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
      CASE
        WHEN lower(trim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, '')))
          IN ('repuestos', 'repuesto')
          THEN 'REPUESTOS'
        WHEN lower(trim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, '')))
          = 'kilometraje'
          THEN 'KILOMETRAJE'
        WHEN lower(trim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, '')))
          IN ('mano de obra', 'servicio', 'servicios')
          THEN 'SERVICIO'
        ELSE 'OTROS'
      END AS rubro,
      upper(trim(coalesce(fl.marca_normalizada::text, 'OTROS'))) AS marca
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
  filtrada_marca AS (
    SELECT *
    FROM base
    WHERE CASE
      WHEN upper(trim(coalesce(p_marca, ''))) IN ('', 'ALL', 'TODOS') THEN true
      WHEN upper(trim(p_marca)) IN ('AMBAS', 'C/AMBAS') THEN marca IN ('CLAAS', 'HORSCH')
      ELSE marca = upper(trim(p_marca))
    END
  ),
  filtrada AS (
    SELECT
      f.*,
      CASE
        WHEN upper(trim(coalesce(p_rubro, ''))) IN ('', 'ALL', 'TODOS') THEN true
        WHEN upper(trim(p_rubro)) IN ('REPUESTO', 'REPUESTOS') THEN f.rubro = 'REPUESTOS'
        WHEN upper(trim(p_rubro)) IN ('SERVICIO', 'SERVICIOS', 'MANO DE OBRA')
          THEN f.rubro = 'SERVICIO'
        WHEN upper(trim(p_rubro)) IN ('KILOMETRAJE', 'KM') THEN f.rubro = 'KILOMETRAJE'
        ELSE false
      END AS rubro_seleccionado
    FROM filtrada_marca f
  )
  SELECT
    f.cliente_id,
    coalesce(sum(f.total_venta) FILTER (
      WHERE f.fecha BETWEEN p_desde AND p_hasta
        AND f.rubro_seleccionado
    ), 0) AS fact_actual,
    coalesce(sum(f.total_venta) FILTER (
      WHERE f.fecha BETWEEN p_prev_desde AND p_prev_hasta
        AND f.rubro_seleccionado
    ), 0) AS fact_prev,
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

GRANT EXECUTE ON FUNCTION public.parque_resumen_facturacion_filtros(
  date,
  date,
  date,
  date,
  text,
  text
) TO authenticated;
