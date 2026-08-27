-- Correccion autosuficiente: algunas bases no poseen la funcion historica
-- facturacion_marca_por_grupo. Esta regla local clasifica la marca del sistema
-- viejo exclusivamente desde su subgrupo.

CREATE OR REPLACE FUNCTION public.repuestos_marca_legacy_por_subgrupo(p_subgrupo text)
RETURNS public.marca
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $function$
  SELECT CASE
    WHEN upper(trim(coalesce(p_subgrupo, ''))) IN (
      'SERVICE - CLAAS',
      'REPUESTOS - CLAAS',
      'REPUESTOS CLAAS - PROMOCION',
      'REPUESTOS - CABEZALES/PLATAFOR',
      'REPUESTOS TRACTOR',
      'REPUESTOS DIVERSOS --'
    ) THEN 'CLAAS'::public.marca
    WHEN upper(trim(coalesce(p_subgrupo, ''))) IN (
      'SERVICE - HORSCH',
      'REPUESTOS PLANTADORA',
      'REPUESTOS PULVERIZADORAS'
    ) THEN 'HORSCH'::public.marca
    ELSE 'OTROS'::public.marca
  END;
$function$;

-- Reporte puntual solicitado por CLAAS. Para datos del sistema anterior la
-- marca se deriva del subgrupo mediante la regla local autosuficiente definida
-- arriba, sin depender de funciones historicas ausentes en algunas bases.

CREATE OR REPLACE VIEW public.v_repuestos_reporte_claas
WITH (security_invoker = true)
AS
WITH stock AS (
  SELECT
    rs.producto_codigo,
    max(rs.codigo_fabricante) AS codigo_fabricante,
    coalesce(sum(rs.saldo_actual), 0)::numeric AS stock
  FROM public.repuestos_stock rs
  GROUP BY rs.producto_codigo
), ventas AS (
  SELECT
    d.producto_codigo,
    coalesce(sum(d.unidades_netas) FILTER (
      WHERE d.mes >= (date_trunc('month', current_date) - interval '11 months')::date
    ), 0)::numeric AS ventas_12m,
    coalesce(sum(d.unidades_netas) FILTER (
      WHERE d.mes >= (date_trunc('month', current_date) - interval '23 months')::date
    ), 0)::numeric AS ventas_24m,
    coalesce(sum(d.unidades_netas) FILTER (
      WHERE d.mes >= (date_trunc('month', current_date) - interval '35 months')::date
    ), 0)::numeric AS ventas_36m
  FROM public.repuestos_demanda_mensual d
  GROUP BY d.producto_codigo
), maestro_anterior AS (
  SELECT m.*
  FROM public.repuestos_maestro_legacy m
  JOIN public.repuestos_maestro_legacy_cargas c ON c.id = m.carga_id
  WHERE c.activo AND c.estado = 'COMPLETADO'
), maestro_claas AS (
  SELECT m.*
  FROM maestro_anterior m
  WHERE public.repuestos_marca_legacy_por_subgrupo(m.tipo) = 'CLAAS'::public.marca
), ventas_claas_confirmadas AS (
  SELECT DISTINCT v.producto_codigo
  FROM public.repuestos_ventas_vinculacion v
  JOIN public.facturacion_lineas_importadas f ON f.id = v.linea_id
  WHERE v.estado_vinculo = 'CONFIRMADA'
    AND v.producto_codigo IS NOT NULL
    AND public.repuestos_marca_legacy_por_subgrupo(f.subgrupo_original) = 'CLAAS'::public.marca
), productos_claas AS (
  SELECT p.*
  FROM public.productos p
  WHERE p.marca = 'CLAAS'::public.marca
     OR EXISTS (
       SELECT 1 FROM maestro_claas m
       WHERE m.producto_codigo = p.codigo_interno
         AND m.estado_vinculo IN ('CONFIRMADA', 'CONFIRMADA_CANONICA')
     )
     OR EXISTS (
       SELECT 1 FROM ventas_claas_confirmadas vc
       WHERE vc.producto_codigo = p.codigo_interno
     )
), ventas_claas_sin_vincular_base AS (
  SELECT
    public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia) AS codigo_norm,
    nullif(trim(f.cod_mercaderia), '') AS codigo_interno,
    coalesce(
      nullif(trim(f.codigo_fabricante), ''),
      public.extraer_codigo_repuesto_descripcion(f.mercaderia)
    ) AS codigo_fabricante,
    nullif(trim(f.mercaderia), '') AS descripcion,
    coalesce(f.fecha_factura::date, v.fecha_efectiva) AS fecha,
    (
      coalesce(f.cantidad, v.cantidad, 0)
      * coalesce(conv.factor_cantidad, 1)
    )::numeric AS cantidad
  FROM public.repuestos_ventas_vinculacion v
  JOIN public.facturacion_lineas_importadas f ON f.id = v.linea_id
  LEFT JOIN LATERAL (
    SELECT regla.factor_cantidad
    FROM public.repuestos_conversiones_unidad_historica regla
    WHERE regla.activa
      AND regla.codigo_legacy_norm = public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia)
      AND (regla.fecha_desde IS NULL OR coalesce(f.fecha_factura::date, v.fecha_efectiva) >= regla.fecha_desde)
      AND (regla.fecha_hasta_exclusiva IS NULL OR coalesce(f.fecha_factura::date, v.fecha_efectiva) < regla.fecha_hasta_exclusiva)
      AND (
        regla.precio_unitario_min IS NULL
        OR abs(coalesce(f.total_venta, 0) / nullif(coalesce(f.cantidad, v.cantidad, 0), 0)) >= regla.precio_unitario_min
      )
      AND (
        regla.precio_unitario_max IS NULL
        OR abs(coalesce(f.total_venta, 0) / nullif(coalesce(f.cantidad, v.cantidad, 0), 0)) <= regla.precio_unitario_max
      )
    ORDER BY regla.id
    LIMIT 1
  ) conv ON true
  WHERE v.estado_vinculo <> 'CONFIRMADA'
    AND nullif(trim(f.cod_mercaderia), '') IS NOT NULL
    AND coalesce(f.fecha_factura::date, v.fecha_efectiva) IS NOT NULL
    AND public.repuestos_marca_legacy_por_subgrupo(f.subgrupo_original) = 'CLAAS'::public.marca
), ventas_claas_sin_vincular AS (
  SELECT
    b.codigo_norm,
    min(b.codigo_interno) AS codigo_interno,
    max(b.codigo_fabricante) AS codigo_fabricante,
    max(b.descripcion) AS descripcion,
    coalesce(sum(b.cantidad) FILTER (
      WHERE b.fecha >= (date_trunc('month', current_date) - interval '11 months')::date
    ), 0)::numeric AS ventas_12m,
    coalesce(sum(b.cantidad) FILTER (
      WHERE b.fecha >= (date_trunc('month', current_date) - interval '23 months')::date
    ), 0)::numeric AS ventas_24m,
    coalesce(sum(b.cantidad) FILTER (
      WHERE b.fecha >= (date_trunc('month', current_date) - interval '35 months')::date
    ), 0)::numeric AS ventas_36m
  FROM ventas_claas_sin_vincular_base b
  WHERE b.codigo_norm IS NOT NULL
  GROUP BY b.codigo_norm
), actuales AS (
  SELECT
    p.codigo_interno,
    coalesce(p.codigo_fabricante, s.codigo_fabricante) AS codigo_fabricante,
    'CLAAS'::text AS marca,
    coalesce(s.stock, 0)::numeric AS stock,
    coalesce(v.ventas_12m, 0)::numeric AS ventas_12m,
    coalesce(v.ventas_24m, 0)::numeric AS ventas_24m,
    coalesce(v.ventas_36m, 0)::numeric AS ventas_36m,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM maestro_claas m
        WHERE m.producto_codigo = p.codigo_interno
          AND m.estado_vinculo IN ('CONFIRMADA', 'CONFIRMADA_CANONICA')
      ) OR EXISTS (
        SELECT 1 FROM ventas_claas_confirmadas vc
        WHERE vc.producto_codigo = p.codigo_interno
      ) THEN 'SISTEMA NUEVO + SISTEMA VIEJO'
      ELSE 'SISTEMA NUEVO'
    END AS origen_sistema,
    p.descripcion
  FROM productos_claas p
  LEFT JOIN stock s ON s.producto_codigo = p.codigo_interno
  LEFT JOIN ventas v ON v.producto_codigo = p.codigo_interno
), historicos_maestro AS (
  SELECT
    m.codigo_legacy AS codigo_interno,
    coalesce(
      nullif(trim(m.codigo_fabricante), ''),
      nullif(trim(sv.codigo_fabricante), ''),
      nullif(trim(s.codigo_fabricante), '')
    ) AS codigo_fabricante,
    'CLAAS'::text AS marca,
    coalesce(s.stock, 0)::numeric AS stock,
    coalesce(sv.ventas_12m, 0)::numeric AS ventas_12m,
    coalesce(sv.ventas_24m, 0)::numeric AS ventas_24m,
    coalesce(sv.ventas_36m, 0)::numeric AS ventas_36m,
    'SISTEMA VIEJO'::text AS origen_sistema,
    coalesce(nullif(trim(m.descripcion), ''), sv.descripcion, 'SIN DESCRIPCION') AS descripcion
  FROM maestro_claas m
  LEFT JOIN stock s
    ON public.normalizar_codigo_repuesto_flexible(s.producto_codigo) = m.codigo_legacy_norm
  LEFT JOIN ventas_claas_sin_vincular sv ON sv.codigo_norm = m.codigo_legacy_norm
  WHERE m.producto_codigo IS NULL
     OR m.estado_vinculo NOT IN ('CONFIRMADA', 'CONFIRMADA_CANONICA')
), historicos_sin_maestro AS (
  SELECT
    sv.codigo_interno,
    sv.codigo_fabricante,
    'CLAAS'::text AS marca,
    0::numeric AS stock,
    sv.ventas_12m,
    sv.ventas_24m,
    sv.ventas_36m,
    'SISTEMA VIEJO'::text AS origen_sistema,
    coalesce(sv.descripcion, 'SIN DESCRIPCION') AS descripcion
  FROM ventas_claas_sin_vincular sv
  WHERE NOT EXISTS (
    SELECT 1 FROM maestro_anterior m WHERE m.codigo_legacy_norm = sv.codigo_norm
  )
    AND NOT EXISTS (
      SELECT 1 FROM productos_claas p
      WHERE public.normalizar_codigo_repuesto_flexible(p.codigo_interno) = sv.codigo_norm
    )
)
SELECT * FROM actuales
UNION ALL SELECT * FROM historicos_maestro
UNION ALL SELECT * FROM historicos_sin_maestro;

GRANT SELECT ON public.v_repuestos_reporte_claas TO authenticated;

CREATE OR REPLACE FUNCTION public.repuestos_exportar_reporte_claas()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
SET statement_timeout = '180s'
AS $function$
  SELECT coalesce(
    jsonb_agg(to_jsonb(fila) ORDER BY fila.codigo_interno),
    '[]'::jsonb
  )
  FROM public.v_repuestos_reporte_claas fila;
$function$;

REVOKE ALL ON FUNCTION public.repuestos_exportar_reporte_claas()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repuestos_exportar_reporte_claas()
  TO authenticated;

COMMENT ON VIEW public.v_repuestos_reporte_claas IS
  'Reporte especifico CLAAS de codigo, fabricante, descripcion, stock y ventas; la marca historica se deriva del subgrupo.';

NOTIFY pgrst, 'reload schema';
