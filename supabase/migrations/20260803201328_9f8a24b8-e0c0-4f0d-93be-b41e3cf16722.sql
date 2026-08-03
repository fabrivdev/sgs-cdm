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
  WITH facturacion_marca AS (
    SELECT *
    FROM public.parque_facturacion_atribuida() f
    WHERE CASE
      WHEN upper(trim(coalesce(p_marca, ''))) IN ('', 'ALL', 'TODOS') THEN true
      WHEN upper(trim(p_marca)) IN ('AMBAS', 'C/AMBAS')
        THEN f.marca IN ('CLAAS', 'HORSCH')
      ELSE f.marca = upper(trim(p_marca))
    END
  ),
  facturacion_rubro AS (
    SELECT
      f.*,
      CASE
        WHEN upper(trim(coalesce(p_rubro, ''))) IN ('', 'ALL', 'TODOS') THEN true
        WHEN upper(trim(p_rubro)) IN ('REPUESTO', 'REPUESTOS')
          THEN f.rubro = 'REPUESTOS'
        WHEN upper(trim(p_rubro)) IN ('SERVICIO', 'SERVICIOS', 'MANO DE OBRA')
          THEN f.rubro = 'SERVICIO'
        WHEN upper(trim(p_rubro)) IN ('KILOMETRAJE', 'KM')
          THEN f.rubro = 'KILOMETRAJE'
        ELSE false
      END AS rubro_seleccionado
    FROM facturacion_marca f
  ),
  facturacion AS (
    SELECT
      f.cliente_id,
      coalesce(sum(f.total_venta) FILTER (
        WHERE f.fecha BETWEEN p_desde AND p_hasta AND f.rubro_seleccionado
      ), 0) AS fact_actual,
      coalesce(sum(f.total_venta) FILTER (
        WHERE f.fecha BETWEEN p_prev_desde AND p_prev_hasta AND f.rubro_seleccionado
      ), 0) AS fact_prev,
      coalesce(bool_or(
        f.fecha BETWEEN p_desde AND p_hasta AND f.rubro = 'REPUESTOS'
      ), false) AS tiene_rep_rango,
      coalesce(bool_or(
        f.fecha BETWEEN p_desde AND p_hasta
        AND f.rubro IN ('SERVICIO', 'KILOMETRAJE')
      ), false) AS tiene_srv_facturado
    FROM facturacion_rubro f
    WHERE f.fecha BETWEEN p_desde AND p_hasta
      OR f.fecha BETWEEN p_prev_desde AND p_prev_hasta
    GROUP BY f.cliente_id
  ),
  actividad_os AS (
    SELECT DISTINCT a.cliente_id
    FROM public.parque_actividad_os_chasis() a
    WHERE a.fecha BETWEEN p_desde AND p_hasta
      AND CASE
        WHEN upper(trim(coalesce(p_marca, ''))) IN ('', 'ALL', 'TODOS') THEN true
        WHEN upper(trim(p_marca)) IN ('AMBAS', 'C/AMBAS')
          THEN a.marca IN ('CLAAS', 'HORSCH')
        ELSE a.marca = upper(trim(p_marca))
      END
  ),
  clientes AS (
    SELECT f.cliente_id FROM facturacion f
    UNION
    SELECT a.cliente_id FROM actividad_os a
  )
  SELECT
    c.cliente_id,
    coalesce(f.fact_actual, 0) AS fact_actual,
    coalesce(f.fact_prev, 0) AS fact_prev,
    coalesce(f.tiene_rep_rango, false) AS tiene_rep_rango,
    coalesce(f.tiene_srv_facturado, false) OR a.cliente_id IS NOT NULL
      AS tiene_srv_rango
  FROM clientes c
  LEFT JOIN facturacion f ON f.cliente_id = c.cliente_id
  LEFT JOIN actividad_os a ON a.cliente_id = c.cliente_id;
$$;

CREATE OR REPLACE FUNCTION public.parque_kpis()
RETURNS TABLE (
  total_maquinas integer,
  total_clientes integer,
  con_servicio_anio integer,
  contactados_mes integer,
  sin_contacto_60d integer
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_inicio_mes date := date_trunc('month', CURRENT_DATE)::date;
  v_hace_anio date := (CURRENT_DATE - interval '1 year')::date;
  v_hace_60d date := (CURRENT_DATE - interval '60 days')::date;
BEGIN
  RETURN QUERY
  WITH clientes_maq AS (
    SELECT DISTINCT pm.cliente_id
    FROM public.parque_maquinas pm
    WHERE pm.activo = true AND pm.cliente_id IS NOT NULL
  ),
  servicio_actividad AS MATERIALIZED (
    SELECT f.cliente_id, f.fecha
    FROM public.parque_facturacion_atribuida() f
    WHERE f.rubro IN ('SERVICIO', 'KILOMETRAJE')
    UNION
    SELECT a.cliente_id, a.fecha
    FROM public.parque_actividad_os_chasis() a
  ),
  servicio_anio AS (
    SELECT DISTINCT s.cliente_id
    FROM servicio_actividad s
    WHERE s.fecha >= v_hace_anio
  ),
  servicio_60d AS (
    SELECT DISTINCT s.cliente_id
    FROM servicio_actividad s
    WHERE s.fecha >= v_hace_60d
  ),
  ult_seg AS (
    SELECT s.cliente_id, max(s.fecha) AS ult_fecha
    FROM public.seguimiento_comercial s
    GROUP BY s.cliente_id
  )
  SELECT
    (SELECT count(*)::int FROM public.parque_maquinas WHERE activo = true),
    (SELECT count(*)::int FROM clientes_maq),
    (SELECT count(*)::int
      FROM clientes_maq cm
      WHERE cm.cliente_id IN (SELECT cliente_id FROM servicio_anio)),
    (SELECT count(*)::int
      FROM clientes_maq cm
      JOIN ult_seg us ON us.cliente_id = cm.cliente_id
      WHERE us.ult_fecha >= v_inicio_mes),
    (SELECT count(*)::int
      FROM clientes_maq cm
      WHERE cm.cliente_id NOT IN (SELECT cliente_id FROM servicio_60d)
        AND NOT EXISTS (
          SELECT 1
          FROM ult_seg us
          WHERE us.cliente_id = cm.cliente_id
            AND us.ult_fecha >= v_hace_60d
        ));
END;
$$;

REVOKE ALL ON FUNCTION public.parque_actividad_os_chasis() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parque_actividad_os_chasis() TO authenticated;
GRANT EXECUTE ON FUNCTION public.parque_resumen_facturacion(date, date, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.parque_ultimas_facturas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.parque_resumen_facturacion_marca(date, date, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.parque_ultimas_facturas_marca(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.parque_resumen_facturacion_filtros(date, date, date, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.parque_kpis() TO authenticated;
