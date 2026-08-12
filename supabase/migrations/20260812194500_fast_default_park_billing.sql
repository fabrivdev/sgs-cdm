-- Ruta rapida para la vista inicial del Parque (Marca=Todos, Rubro=Todos).
-- Usa el resumen de facturacion que ya contiene cliente_id y evita reconstruir
-- todas las lineas y atribuciones por chasis en cada apertura de pantalla.

CREATE INDEX IF NOT EXISTS idx_facturacion_fecha_cliente_reportable
  ON public.facturacion (fecha, cliente_id)
  WHERE cliente_id IS NOT NULL AND excluido_de_reportes = false;

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
  WITH facturacion AS (
    SELECT
      f.cliente_id,
      coalesce(sum(f.total_venta) FILTER (
        WHERE f.fecha BETWEEN p_desde AND p_hasta
      ), 0) AS fact_actual,
      coalesce(sum(f.total_venta) FILTER (
        WHERE f.fecha BETWEEN p_prev_desde AND p_prev_hasta
      ), 0) AS fact_prev,
      coalesce(bool_or(
        f.fecha BETWEEN p_desde AND p_hasta
        AND lower(trim(coalesce(f.grupo_fx, ''))) IN ('repuesto', 'repuestos')
      ), false) AS tiene_rep_rango,
      coalesce(bool_or(
        f.fecha BETWEEN p_desde AND p_hasta
        AND lower(trim(coalesce(f.grupo_fx, ''))) IN (
          'mano de obra', 'servicio', 'servicios', 'kilometraje'
        )
      ), false) AS tiene_srv_facturado
    FROM public.facturacion f
    WHERE f.cliente_id IS NOT NULL
      AND NOT coalesce(f.excluido_de_reportes, false)
      AND (
        f.fecha BETWEEN p_desde AND p_hasta
        OR f.fecha BETWEEN p_prev_desde AND p_prev_hasta
      )
      AND lower(trim(coalesce(f.grupo_fx, ''))) IN (
        'repuesto', 'repuestos', 'mano de obra', 'servicio', 'servicios', 'kilometraje'
      )
    GROUP BY f.cliente_id
  ),
  actividad_os AS (
    SELECT DISTINCT a.cliente_id
    FROM public.parque_actividad_os_chasis_rango(p_desde, p_hasta) a
  ),
  clientes AS (
    SELECT f.cliente_id FROM facturacion f
    UNION
    SELECT a.cliente_id FROM actividad_os a
  )
  SELECT
    c.cliente_id,
    coalesce(f.fact_actual, 0),
    coalesce(f.fact_prev, 0),
    coalesce(f.tiene_rep_rango, false),
    coalesce(f.tiene_srv_facturado, false) OR a.cliente_id IS NOT NULL
  FROM clientes c
  LEFT JOIN facturacion f ON f.cliente_id = c.cliente_id
  LEFT JOIN actividad_os a ON a.cliente_id = c.cliente_id;
$$;

REVOKE ALL ON FUNCTION public.parque_resumen_facturacion(
  date, date, date, date
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parque_resumen_facturacion(
  date, date, date, date
) TO authenticated;

NOTIFY pgrst, 'reload schema';
