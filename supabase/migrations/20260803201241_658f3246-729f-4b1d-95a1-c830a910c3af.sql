-- Treat a service order linked to a machine chassis as service activity for the
-- machine's current owner. Monetary amounts remain sourced only from billing.

CREATE OR REPLACE FUNCTION public.parque_actividad_os_chasis()
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
  WITH candidatos AS (
    SELECT DISTINCT
      osi.os_numero,
      pm.cliente_id,
      coalesce(
        osi.fecha_abierta_os::date,
        osi.fecha_cierre_os::date,
        osi.fecha_emision_factura::date
      ) AS fecha,
      nullif(upper(trim(pm.marca::text)), '') AS marca
    FROM public.ordenes_servicio_importadas osi
    JOIN public.parque_maquinas pm
      ON public.parque_normalizar_clave(pm.serie)
        = public.parque_normalizar_clave(osi.nro_chasis)
    WHERE pm.activo = true
      AND pm.cliente_id IS NOT NULL
      AND public.parque_normalizar_clave(pm.serie) <> ''
      AND public.parque_normalizar_clave(osi.nro_chasis) <> ''
      AND coalesce(
        osi.fecha_abierta_os::date,
        osi.fecha_cierre_os::date,
        osi.fecha_emision_factura::date
      ) IS NOT NULL
      AND public.parque_normalizar_clave(osi.situacion_os) NOT IN (
        'ANULADA',
        'ANULADO',
        'CANCELADA',
        'CANCELADO'
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
    coalesce(a.marca, 'OTROS') AS marca,
    a.os_numero
  FROM atribuciones_unicas a;
$$;

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
        f.fecha BETWEEN p_desde AND p_hasta AND f.rubro = 'REPUESTOS'
      ), false) AS tiene_rep_rango,
      coalesce(bool_or(
        f.fecha BETWEEN p_desde AND p_hasta
        AND f.rubro IN ('SERVICIO', 'KILOMETRAJE')
      ), false) AS tiene_srv_facturado
    FROM public.parque_facturacion_atribuida() f
    WHERE f.fecha BETWEEN p_desde AND p_hasta
      OR f.fecha BETWEEN p_prev_desde AND p_prev_hasta
    GROUP BY f.cliente_id
  ),
  actividad_os AS (
    SELECT DISTINCT a.cliente_id
    FROM public.parque_actividad_os_chasis() a
    WHERE a.fecha BETWEEN p_desde AND p_hasta
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
  WITH ult_facturacion AS (
    SELECT
      f.cliente_id,
      max(f.fecha) FILTER (WHERE f.rubro = 'REPUESTOS') AS ult_repuesto,
      max(f.fecha) FILTER (
        WHERE f.rubro IN ('SERVICIO', 'KILOMETRAJE')
      ) AS ult_servicio
    FROM public.parque_facturacion_atribuida() f
    GROUP BY f.cliente_id
  ),
  ult_os AS (
    SELECT a.cliente_id, max(a.fecha) AS ult_servicio
    FROM public.parque_actividad_os_chasis() a
    GROUP BY a.cliente_id
  )
  SELECT
    coalesce(f.cliente_id, o.cliente_id) AS cliente_id,
    f.ult_repuesto,
    greatest(f.ult_servicio, o.ult_servicio) AS ult_servicio
  FROM ult_facturacion f
  FULL OUTER JOIN ult_os o ON o.cliente_id = f.cliente_id;
$$;

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
  WITH facturacion_filtrada AS (
    SELECT *
    FROM public.parque_facturacion_atribuida() f
    WHERE CASE
      WHEN upper(trim(coalesce(p_marca, ''))) IN ('', 'ALL', 'TODOS') THEN true
      WHEN upper(trim(p_marca)) IN ('AMBAS', 'C/AMBAS')
        THEN f.marca IN ('CLAAS', 'HORSCH')
      ELSE f.marca = upper(trim(p_marca))
    END
  ),
  facturacion AS (
    SELECT
      f.cliente_id,
      coalesce(sum(f.total_venta) FILTER (
        WHERE f.fecha BETWEEN p_desde AND p_hasta
      ), 0) AS fact_actual,
      coalesce(sum(f.total_venta) FILTER (
        WHERE f.fecha BETWEEN p_prev_desde AND p_prev_hasta
      ), 0) AS fact_prev,
      coalesce(bool_or(
        f.fecha BETWEEN p_desde AND p_hasta AND f.rubro = 'REPUESTOS'
      ), false) AS tiene_rep_rango,
      coalesce(bool_or(
        f.fecha BETWEEN p_desde AND p_hasta
        AND f.rubro IN ('SERVICIO', 'KILOMETRAJE')
      ), false) AS tiene_srv_facturado
    FROM facturacion_filtrada f
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

CREATE OR REPLACE FUNCTION public.parque_ultimas_facturas_marca(p_marca text)
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
  WITH ult_facturacion AS (
    SELECT
      f.cliente_id,
      max(f.fecha) FILTER (WHERE f.rubro = 'REPUESTOS') AS ult_repuesto,
      max(f.fecha) FILTER (
        WHERE f.rubro IN ('SERVICIO', 'KILOMETRAJE')
      ) AS ult_servicio
    FROM public.parque_facturacion_atribuida() f
    WHERE CASE
      WHEN upper(trim(coalesce(p_marca, ''))) IN ('', 'ALL', 'TODOS') THEN true
      WHEN upper(trim(p_marca)) IN ('AMBAS', 'C/AMBAS')
        THEN f.marca IN ('CLAAS', 'HORSCH')
      ELSE f.marca = upper(trim(p_marca))
    END
    GROUP BY f.cliente_id
  ),
  ult_os AS (
    SELECT a.cliente_id, max(a.fecha) AS ult_servicio
    FROM public.parque_actividad_os_chasis() a
    WHERE CASE
      WHEN upper(trim(coalesce(p_marca, ''))) IN ('', 'ALL', 'TODOS') THEN true
      WHEN upper(trim(p_marca)) IN ('AMBAS', 'C/AMBAS')
        THEN a.marca IN ('CLAAS', 'HORSCH')
      ELSE a.marca = upper(trim(p_marca))
    END
    GROUP BY a.cliente_id
  )
  SELECT
    coalesce(f.cliente_id, o.cliente_id) AS cliente_id,
    f.ult_repuesto,
    greatest(f.ult_servicio, o.ult_servicio) AS ult_servicio
  FROM ult_facturacion f
  FULL OUTER JOIN ult_os o ON o.cliente_id = f.cliente_id;
$$;
