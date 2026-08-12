-- Limita la actividad de OS al periodo solicitado antes de vincular chasis.
-- Mantiene SECURITY INVOKER y, por tanto, las politicas RLS existentes.

CREATE INDEX IF NOT EXISTS idx_ordenes_servicio_fecha_abierta
  ON public.ordenes_servicio_importadas (fecha_abierta_os);

CREATE INDEX IF NOT EXISTS idx_ordenes_servicio_fecha_cierre
  ON public.ordenes_servicio_importadas (fecha_cierre_os);

CREATE INDEX IF NOT EXISTS idx_ordenes_servicio_fecha_factura
  ON public.ordenes_servicio_importadas (fecha_emision_factura);

CREATE OR REPLACE FUNCTION public.parque_actividad_os_chasis_rango(
  p_desde date,
  p_hasta date
)
RETURNS TABLE (
  cliente_id uuid,
  fecha date,
  marca text,
  os_numero text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH os_rango AS MATERIALIZED (
    SELECT
      osi.os_numero,
      osi.nro_chasis,
      osi.situacion_os,
      coalesce(
        osi.fecha_abierta_os::date,
        osi.fecha_cierre_os::date,
        osi.fecha_emision_factura::date
      ) AS fecha
    FROM public.ordenes_servicio_importadas osi
    WHERE (
      osi.fecha_abierta_os >= p_desde::timestamptz
      AND osi.fecha_abierta_os < (p_hasta + 1)::timestamptz
    ) OR (
      osi.fecha_abierta_os IS NULL
      AND osi.fecha_cierre_os >= p_desde::timestamptz
      AND osi.fecha_cierre_os < (p_hasta + 1)::timestamptz
    ) OR (
      osi.fecha_abierta_os IS NULL
      AND osi.fecha_cierre_os IS NULL
      AND osi.fecha_emision_factura >= p_desde::timestamptz
      AND osi.fecha_emision_factura < (p_hasta + 1)::timestamptz
    )
  ),
  candidatos AS (
    SELECT DISTINCT
      osi.os_numero,
      pm.cliente_id,
      osi.fecha,
      nullif(upper(trim(pm.marca::text)), '') AS marca
    FROM os_rango osi
    JOIN public.parque_maquinas pm
      ON public.parque_normalizar_clave(pm.serie)
        = public.parque_normalizar_clave(osi.nro_chasis)
    WHERE pm.activo = true
      AND pm.cliente_id IS NOT NULL
      AND public.parque_normalizar_clave(pm.serie) <> ''
      AND public.parque_normalizar_clave(osi.nro_chasis) <> ''
      AND osi.fecha BETWEEN p_desde AND p_hasta
      AND public.parque_normalizar_clave(osi.situacion_os) NOT IN (
        'ANULADA', 'ANULADO', 'CANCELADA', 'CANCELADO'
      )
  ),
  atribuciones_unicas AS (
    SELECT
      c.os_numero,
      min(c.cliente_id::text)::uuid AS cliente_id,
      max(c.fecha) AS fecha,
      CASE
        WHEN count(DISTINCT c.marca) FILTER (WHERE c.marca IS NOT NULL) = 1
          THEN min(c.marca) FILTER (WHERE c.marca IS NOT NULL)
        ELSE NULL
      END AS marca
    FROM candidatos c
    GROUP BY c.os_numero
    HAVING count(DISTINCT c.cliente_id) = 1
  )
  SELECT
    a.cliente_id,
    a.fecha,
    coalesce(a.marca, 'OTROS'),
    a.os_numero
  FROM atribuciones_unicas a;
$$;

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
  WITH base AS MATERIALIZED (
    SELECT *
    FROM public.parque_facturacion_atribuida_rango(
      least(p_desde, p_prev_desde),
      greatest(p_hasta, p_prev_hasta)
    ) f
    WHERE CASE
      WHEN upper(trim(coalesce(p_marca, ''))) IN ('', 'ALL', 'TODOS') THEN true
      WHEN upper(trim(p_marca)) IN ('AMBAS', 'C/AMBAS') THEN f.marca IN ('CLAAS', 'HORSCH')
      ELSE f.marca = upper(trim(p_marca))
    END
  ),
  facturacion AS (
    SELECT
      f.cliente_id,
      coalesce(sum(f.total_venta) FILTER (
        WHERE f.fecha BETWEEN p_desde AND p_hasta
          AND CASE
            WHEN upper(trim(coalesce(p_rubro, ''))) IN ('', 'ALL', 'TODOS') THEN true
            WHEN upper(trim(p_rubro)) IN ('REPUESTO', 'REPUESTOS') THEN f.rubro = 'REPUESTOS'
            WHEN upper(trim(p_rubro)) IN ('SERVICIO', 'SERVICIOS', 'MANO DE OBRA') THEN f.rubro = 'SERVICIO'
            WHEN upper(trim(p_rubro)) IN ('KILOMETRAJE', 'KM') THEN f.rubro = 'KILOMETRAJE'
            ELSE false
          END
      ), 0) AS fact_actual,
      coalesce(sum(f.total_venta) FILTER (
        WHERE f.fecha BETWEEN p_prev_desde AND p_prev_hasta
          AND CASE
            WHEN upper(trim(coalesce(p_rubro, ''))) IN ('', 'ALL', 'TODOS') THEN true
            WHEN upper(trim(p_rubro)) IN ('REPUESTO', 'REPUESTOS') THEN f.rubro = 'REPUESTOS'
            WHEN upper(trim(p_rubro)) IN ('SERVICIO', 'SERVICIOS', 'MANO DE OBRA') THEN f.rubro = 'SERVICIO'
            WHEN upper(trim(p_rubro)) IN ('KILOMETRAJE', 'KM') THEN f.rubro = 'KILOMETRAJE'
            ELSE false
          END
      ), 0) AS fact_prev,
      coalesce(bool_or(
        f.fecha BETWEEN p_desde AND p_hasta AND f.rubro = 'REPUESTOS'
      ), false) AS tiene_rep_rango,
      coalesce(bool_or(
        f.fecha BETWEEN p_desde AND p_hasta
        AND f.rubro IN ('SERVICIO', 'KILOMETRAJE')
      ), false) AS tiene_srv_facturado
    FROM base f
    GROUP BY f.cliente_id
  ),
  actividad_os AS (
    SELECT DISTINCT a.cliente_id
    FROM public.parque_actividad_os_chasis_rango(p_desde, p_hasta) a
    WHERE CASE
      WHEN upper(trim(coalesce(p_marca, ''))) IN ('', 'ALL', 'TODOS') THEN true
      WHEN upper(trim(p_marca)) IN ('AMBAS', 'C/AMBAS') THEN a.marca IN ('CLAAS', 'HORSCH')
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
    coalesce(f.fact_actual, 0),
    coalesce(f.fact_prev, 0),
    coalesce(f.tiene_rep_rango, false),
    coalesce(f.tiene_srv_facturado, false) OR a.cliente_id IS NOT NULL
  FROM clientes c
  LEFT JOIN facturacion f ON f.cliente_id = c.cliente_id
  LEFT JOIN actividad_os a ON a.cliente_id = c.cliente_id;
$$;

REVOKE ALL ON FUNCTION public.parque_actividad_os_chasis_rango(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parque_actividad_os_chasis_rango(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.parque_resumen_facturacion_filtros(
  date, date, date, date, text, text
) TO authenticated;

NOTIFY pgrst, 'reload schema';
