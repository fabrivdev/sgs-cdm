-- Índice para acelerar agregaciones por cliente y rango de fechas
CREATE INDEX IF NOT EXISTS idx_facturacion_cliente_fecha
  ON public.facturacion (cliente_id, fecha);

-- Función: agregados de facturación por rango actual y rango previo
CREATE OR REPLACE FUNCTION public.parque_resumen_facturacion(
  p_desde date,
  p_hasta date,
  p_prev_desde date,
  p_prev_hasta date
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
  SELECT
    f.cliente_id,
    COALESCE(SUM(CASE WHEN f.fecha BETWEEN p_desde AND p_hasta THEN f.total_venta ELSE 0 END), 0) AS fact_actual,
    COALESCE(SUM(CASE WHEN f.fecha BETWEEN p_prev_desde AND p_prev_hasta THEN f.total_venta ELSE 0 END), 0) AS fact_prev,
    BOOL_OR(
      f.fecha BETWEEN p_desde AND p_hasta
      AND LOWER(TRIM(COALESCE(f.grupo_fx, ''))) = 'repuestos'
    ) AS tiene_rep_rango,
    BOOL_OR(
      f.fecha BETWEEN p_desde AND p_hasta
      AND LOWER(TRIM(COALESCE(f.grupo_fx, ''))) IN ('mano de obra', 'kilometraje')
    ) AS tiene_srv_rango
  FROM public.facturacion f
  WHERE f.cliente_id IS NOT NULL
    AND LOWER(TRIM(COALESCE(f.grupo_fx, ''))) IN ('repuestos', 'mano de obra', 'kilometraje')
    AND (
      f.fecha BETWEEN p_desde AND p_hasta
      OR f.fecha BETWEEN p_prev_desde AND p_prev_hasta
    )
  GROUP BY f.cliente_id;
$$;

-- Función: última fecha de repuesto y de servicio por cliente
CREATE OR REPLACE FUNCTION public.parque_ultimas_facturas()
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
  SELECT
    f.cliente_id,
    MAX(CASE WHEN LOWER(TRIM(COALESCE(f.grupo_fx, ''))) = 'repuestos' THEN f.fecha END) AS ult_repuesto,
    MAX(CASE WHEN LOWER(TRIM(COALESCE(f.grupo_fx, ''))) IN ('mano de obra', 'kilometraje') THEN f.fecha END) AS ult_servicio
  FROM public.facturacion f
  WHERE f.cliente_id IS NOT NULL
    AND LOWER(TRIM(COALESCE(f.grupo_fx, ''))) IN ('repuestos', 'mano de obra', 'kilometraje')
  GROUP BY f.cliente_id;
$$;

-- Función: KPIs del parque (clientes con servicio último año, contactados este mes, sin contacto +60d)
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
  v_hoy date := CURRENT_DATE;
  v_inicio_mes date := date_trunc('month', CURRENT_DATE)::date;
  v_hace_anio date := (CURRENT_DATE - INTERVAL '1 year')::date;
  v_hace_60d date := (CURRENT_DATE - INTERVAL '60 days')::date;
BEGIN
  RETURN QUERY
  WITH clientes_maq AS (
    SELECT DISTINCT pm.cliente_id
    FROM public.parque_maquinas pm
    WHERE pm.activo = true AND pm.cliente_id IS NOT NULL
  ),
  servicio_anio AS (
    SELECT DISTINCT f.cliente_id
    FROM public.facturacion f
    WHERE f.cliente_id IS NOT NULL
      AND f.tipo = 'Servicio'
      AND f.fecha >= v_hace_anio
  ),
  servicio_60d AS (
    SELECT DISTINCT f.cliente_id
    FROM public.facturacion f
    WHERE f.cliente_id IS NOT NULL
      AND f.tipo = 'Servicio'
      AND f.fecha >= v_hace_60d
  ),
  ult_seg AS (
    SELECT s.cliente_id, MAX(s.fecha) AS ult_fecha
    FROM public.seguimiento_comercial s
    GROUP BY s.cliente_id
  ),
  total_m AS (
    SELECT COUNT(*)::int AS n FROM public.parque_maquinas WHERE activo = true
  )
  SELECT
    (SELECT n FROM total_m) AS total_maquinas,
    (SELECT COUNT(*)::int FROM clientes_maq) AS total_clientes,
    (SELECT COUNT(*)::int FROM clientes_maq cm WHERE cm.cliente_id IN (SELECT cliente_id FROM servicio_anio)) AS con_servicio_anio,
    (SELECT COUNT(*)::int FROM clientes_maq cm
       JOIN ult_seg us ON us.cliente_id = cm.cliente_id
       WHERE us.ult_fecha >= v_inicio_mes) AS contactados_mes,
    (SELECT COUNT(*)::int FROM clientes_maq cm
       WHERE cm.cliente_id NOT IN (SELECT cliente_id FROM servicio_60d)
       AND NOT EXISTS (
         SELECT 1 FROM ult_seg us WHERE us.cliente_id = cm.cliente_id AND us.ult_fecha >= v_hace_60d
       )) AS sin_contacto_60d;
END;
$$;