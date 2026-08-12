-- Ruta rapida para las fechas de ultima actividad de la vista inicial.
-- Evita reconstruir la atribucion de todas las lineas historicas.

CREATE INDEX IF NOT EXISTS idx_facturacion_cliente_fecha_reportable
  ON public.facturacion (cliente_id, fecha DESC)
  WHERE cliente_id IS NOT NULL AND excluido_de_reportes = false;

CREATE INDEX IF NOT EXISTS idx_ordenes_servicio_chasis_ultima_fecha
  ON public.ordenes_servicio_importadas (
    public.parque_normalizar_clave(nro_chasis),
    (coalesce(fecha_abierta_os, fecha_cierre_os, fecha_emision_factura)) DESC
  )
  WHERE nro_chasis IS NOT NULL;

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
      max(f.fecha) FILTER (
        WHERE lower(trim(coalesce(f.grupo_fx, ''))) IN ('repuesto', 'repuestos')
      ) AS ult_repuesto,
      max(f.fecha) FILTER (
        WHERE lower(trim(coalesce(f.grupo_fx, ''))) IN (
          'mano de obra', 'servicio', 'servicios', 'kilometraje'
        )
      ) AS ult_servicio
    FROM public.facturacion f
    WHERE f.cliente_id IS NOT NULL
      AND NOT coalesce(f.excluido_de_reportes, false)
      AND lower(trim(coalesce(f.grupo_fx, ''))) IN (
        'repuesto', 'repuestos', 'mano de obra', 'servicio', 'servicios', 'kilometraje'
      )
    GROUP BY f.cliente_id
  ),
  ult_os AS (
    SELECT
      pm.cliente_id,
      max(o.ult_servicio)::date AS ult_servicio
    FROM public.parque_maquinas pm
    CROSS JOIN LATERAL (
      SELECT coalesce(
        osi.fecha_abierta_os,
        osi.fecha_cierre_os,
        osi.fecha_emision_factura
      ) AS ult_servicio
      FROM public.ordenes_servicio_importadas osi
      WHERE public.parque_normalizar_clave(osi.nro_chasis)
        = public.parque_normalizar_clave(pm.serie)
        AND public.parque_normalizar_clave(osi.situacion_os) NOT IN (
          'ANULADA', 'ANULADO', 'CANCELADA', 'CANCELADO'
        )
      ORDER BY coalesce(
        osi.fecha_abierta_os,
        osi.fecha_cierre_os,
        osi.fecha_emision_factura
      ) DESC NULLS LAST
      LIMIT 1
    ) o
    WHERE pm.activo = true
      AND pm.cliente_id IS NOT NULL
      AND public.parque_normalizar_clave(pm.serie) <> ''
    GROUP BY pm.cliente_id
  ),
  clientes AS (
    SELECT f.cliente_id FROM ult_facturacion f
    UNION
    SELECT o.cliente_id FROM ult_os o
  )
  SELECT
    c.cliente_id,
    f.ult_repuesto,
    CASE
      WHEN f.ult_servicio IS NULL THEN o.ult_servicio
      WHEN o.ult_servicio IS NULL THEN f.ult_servicio
      ELSE greatest(f.ult_servicio, o.ult_servicio)
    END AS ult_servicio
  FROM clientes c
  LEFT JOIN ult_facturacion f ON f.cliente_id = c.cliente_id
  LEFT JOIN ult_os o ON o.cliente_id = c.cliente_id;
$$;

REVOKE ALL ON FUNCTION public.parque_ultimas_facturas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parque_ultimas_facturas() TO authenticated;

NOTIFY pgrst, 'reload schema';
