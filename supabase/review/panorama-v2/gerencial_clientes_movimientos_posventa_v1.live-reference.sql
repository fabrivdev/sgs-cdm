CREATE OR REPLACE FUNCTION public.gerencial_clientes_movimientos_posventa_v1(p_desde date, p_hasta date)
 RETURNS TABLE(contrato text, cliente_id uuid, fecha date, sucursal text, total_venta numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
  WITH parametros AS (
    SELECT p_desde AS fecha_desde, p_hasta AS fecha_hasta
  ),
  facturacion_rango AS MATERIALIZED (
    SELECT
      f.cliente_id,
      f.fecha::date AS fecha,
      f.sucursal::text AS sucursal,
      nullif(upper(btrim(f.sucursal::text)), '') AS sucursal_clave,
      coalesce(f.total_venta, 0)::numeric AS total_venta,
      coalesce(nullif(upper(btrim(f.moneda)), ''), 'USD') AS moneda,
      lower(btrim(coalesce(f.grupo_fx, ''))) AS grupo,
      public.parque_normalizar_clave(f.cod_factura) AS documento_clave
    FROM public.facturacion f
    CROSS JOIN parametros p
    WHERE f.cliente_id IS NOT NULL
      AND NOT coalesce(f.excluido_de_reportes, false)
      AND f.fecha BETWEEN p.fecha_desde AND p.fecha_hasta
  ),
  lineas_rango AS MATERIALIZED (
    SELECT
      fl.cliente_id,
      fl.fecha_factura::date AS fecha,
      fl.sucursal::text AS sucursal,
      nullif(upper(btrim(fl.sucursal::text)), '') AS sucursal_clave,
      coalesce(fl.total_venta, 0)::numeric AS total_venta,
      coalesce(
        nullif(upper(btrim(fl.moneda)), ''),
        CASE
          WHEN nullif(btrim(coalesce(fl.raw_data ->> 'TOTALUSD', '')), '') IS NOT NULL THEN 'USD'
          ELSE 'UNKNOWN'
        END
      ) AS moneda,
      lower(btrim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, ''))) AS grupo,
      public.parque_normalizar_clave(fl.factura) AS factura_clave,
      public.parque_normalizar_clave(fl.codigo_interno_factura) AS interna_clave
    FROM public.facturacion_lineas_importadas fl
    CROSS JOIN parametros p
    WHERE fl.fecha_factura >= greatest(
        p.fecha_desde::timestamptz,
        timestamptz '2026-07-01 00:00:00+00'
      )
      AND fl.fecha_factura < (p.fecha_hasta + 1)::timestamptz
  ),
  cohortes_legacy_pre_corte AS (
    SELECT f.cliente_id, f.fecha, f.sucursal, f.total_venta
    FROM facturacion_rango f
    WHERE f.fecha < date '2026-07-01'
      AND f.moneda = 'USD'
      AND f.grupo IN (
        'repuesto', 'repuestos', 'mano de obra', 'servicio', 'servicios', 'kilometraje'
      )
  ),
  cohortes_legacy_fallback AS (
    SELECT f.cliente_id, f.fecha, f.sucursal, f.total_venta
    FROM facturacion_rango f
    WHERE f.fecha >= date '2026-07-01'
      AND f.moneda = 'USD'
      AND f.documento_clave <> ''
      AND f.grupo IN (
        'repuesto', 'repuestos', 'mano de obra', 'servicio', 'servicios', 'kilometraje'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM lineas_rango fl
        WHERE fl.fecha = f.fecha
          AND fl.sucursal_clave IS NOT DISTINCT FROM f.sucursal_clave
          AND f.documento_clave IN (fl.factura_clave, fl.interna_clave)
      )
  ),
  cohortes_nuevo_sistema AS (
    SELECT fl.cliente_id, fl.fecha, fl.sucursal, fl.total_venta
    FROM lineas_rango fl
    WHERE fl.cliente_id IS NOT NULL
      AND fl.moneda = 'USD'
      AND fl.grupo IN (
        'repuesto', 'repuestos', 'mano de obra', 'servicio', 'servicios', 'kilometraje'
      )
  ),
  cobertura_legacy_pre_corte AS (
    SELECT f.cliente_id, f.fecha, f.sucursal, f.total_venta
    FROM facturacion_rango f
    WHERE f.fecha < date '2026-07-01'
      AND f.grupo IN (
        'repuesto', 'repuestos', 'mano de obra', 'servicio', 'servicios', 'kilometraje'
      )
  ),
  cobertura_legacy_fallback AS (
    SELECT f.cliente_id, f.fecha, f.sucursal, f.total_venta
    FROM facturacion_rango f
    WHERE f.fecha >= date '2026-07-01'
      AND f.documento_clave <> ''
      AND f.grupo IN (
        'repuesto', 'repuestos', 'mano de obra', 'servicio', 'servicios', 'kilometraje'
      )
      AND NOT EXISTS (
        -- Paridad deliberada con parque_facturacion_legacy_fallback_rango:
        -- cualquier linea TOTVS poscorte con el mismo documento suprime el
        -- legacy, sin exigir coincidencia de fecha, sucursal o moneda.
        SELECT 1
        FROM public.facturacion_lineas_importadas fl
        WHERE fl.fecha_factura >= timestamptz '2026-07-01 00:00:00+00'
          AND f.documento_clave IN (
            public.parque_normalizar_clave(fl.factura),
            public.parque_normalizar_clave(fl.codigo_interno_factura)
          )
      )
  ),
  cobertura_nuevo_sistema AS (
    SELECT fl.cliente_id, fl.fecha, fl.sucursal, fl.total_venta
    FROM lineas_rango fl
    WHERE fl.cliente_id IS NOT NULL
      AND fl.grupo IN (
        'repuesto', 'repuestos', 'mano de obra', 'servicio', 'servicios', 'kilometraje'
      )
  )
  SELECT 'COHORTES'::text, c.* FROM cohortes_legacy_pre_corte c
  UNION ALL
  SELECT 'COHORTES'::text, c.* FROM cohortes_legacy_fallback c
  UNION ALL
  SELECT 'COHORTES'::text, c.* FROM cohortes_nuevo_sistema c
  UNION ALL
  SELECT 'COBERTURA'::text, c.* FROM cobertura_legacy_pre_corte c
  UNION ALL
  SELECT 'COBERTURA'::text, c.* FROM cobertura_legacy_fallback c
  UNION ALL
  SELECT 'COBERTURA'::text, c.* FROM cobertura_nuevo_sistema c;
$function$
