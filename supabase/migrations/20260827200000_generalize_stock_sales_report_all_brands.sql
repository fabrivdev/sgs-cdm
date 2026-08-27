-- Generaliza el reporte de stock y ventas para todas las marcas. Los registros
-- historicos se clasifican por el subgrupo del sistema viejo, igual que el
-- reporte puntual de CLAAS.

CREATE OR REPLACE VIEW public.v_repuestos_stock_ventas_exportacion
WITH (security_invoker = true)
AS
WITH stock AS (
  SELECT
    rs.producto_codigo,
    max(rs.descripcion) AS descripcion,
    max(rs.codigo_fabricante) AS codigo_fabricante,
    max(rs.unidad) AS unidad,
    coalesce(sum(rs.saldo_actual) FILTER (WHERE rs.sucursal = 'Santa Rita'), 0)::numeric AS santa_rita,
    coalesce(sum(rs.saldo_actual) FILTER (WHERE rs.sucursal = 'Santa Rosa'), 0)::numeric AS santa_rosa,
    coalesce(sum(rs.saldo_actual) FILTER (WHERE rs.sucursal = 'Campo 9'), 0)::numeric AS campo_9,
    coalesce(sum(rs.saldo_actual) FILTER (WHERE rs.sucursal = 'Misiones'), 0)::numeric AS misiones,
    coalesce(sum(rs.saldo_actual) FILTER (WHERE rs.sucursal = 'Loma Plata'), 0)::numeric AS loma_plata,
    coalesce(sum(rs.saldo_actual) FILTER (WHERE rs.sucursal = 'Katuete'), 0)::numeric AS katuete,
    coalesce(sum(rs.saldo_actual), 0)::numeric AS stock_total
  FROM public.repuestos_stock rs
  GROUP BY rs.producto_codigo
), demanda AS (
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
), codigos_anteriores AS (
  SELECT
    m.producto_codigo,
    string_agg(DISTINCT m.codigo_legacy, ', ' ORDER BY m.codigo_legacy) AS codigos_anteriores
  FROM maestro_anterior m
  WHERE m.producto_codigo IS NOT NULL
    AND m.estado_vinculo IN ('CONFIRMADA', 'CONFIRMADA_CANONICA')
  GROUP BY m.producto_codigo
), productos_con_ventas_historicas AS (
  SELECT DISTINCT v.producto_codigo
  FROM public.repuestos_ventas_vinculacion v
  WHERE v.estado_vinculo = 'CONFIRMADA'
    AND v.producto_codigo IS NOT NULL
), ventas_sin_vincular_base AS (
  SELECT
    public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia) AS codigo_norm,
    nullif(trim(f.cod_mercaderia), '') AS codigo_legacy,
    coalesce(
      nullif(trim(f.codigo_fabricante), ''),
      public.extraer_codigo_repuesto_descripcion(f.mercaderia)
    ) AS codigo_fabricante,
    nullif(trim(f.mercaderia), '') AS descripcion,
    public.repuestos_marca_legacy_por_subgrupo(f.subgrupo_original)::text AS marca,
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
    AND public.es_linea_facturacion_repuesto(
      f.tipo_facturacion,
      f.grupo_normalizado,
      f.subgrupo_original
    )
), ventas_sin_vincular AS (
  SELECT
    b.codigo_norm,
    min(b.codigo_legacy) AS codigo_legacy,
    max(b.codigo_fabricante) AS codigo_fabricante,
    max(b.descripcion) AS descripcion,
    b.marca,
    coalesce(sum(b.cantidad) FILTER (
      WHERE b.fecha >= (date_trunc('month', current_date) - interval '11 months')::date
    ), 0)::numeric AS ventas_12m,
    coalesce(sum(b.cantidad) FILTER (
      WHERE b.fecha >= (date_trunc('month', current_date) - interval '23 months')::date
    ), 0)::numeric AS ventas_24m,
    coalesce(sum(b.cantidad) FILTER (
      WHERE b.fecha >= (date_trunc('month', current_date) - interval '35 months')::date
    ), 0)::numeric AS ventas_36m
  FROM ventas_sin_vincular_base b
  WHERE b.codigo_norm IS NOT NULL
  GROUP BY b.codigo_norm, b.marca
), catalogo AS (
  SELECT
    p.codigo_interno AS codigo,
    ca.codigos_anteriores,
    p.codigo_fabricante,
    p.descripcion,
    p.marca::text AS marca,
    p.familia,
    p.unidad,
    coalesce(s.santa_rita, 0) AS santa_rita,
    coalesce(s.santa_rosa, 0) AS santa_rosa,
    coalesce(s.campo_9, 0) AS campo_9,
    coalesce(s.misiones, 0) AS misiones,
    coalesce(s.loma_plata, 0) AS loma_plata,
    coalesce(s.katuete, 0) AS katuete,
    coalesce(s.stock_total, 0) AS stock_total,
    coalesce(d.ventas_12m, 0) AS ventas_12m,
    coalesce(d.ventas_24m, 0) AS ventas_24m,
    coalesce(d.ventas_36m, 0) AS ventas_36m,
    CASE
      WHEN ca.codigos_anteriores IS NOT NULL OR vh.producto_codigo IS NOT NULL THEN 'CATALOGO_MIXTO'
      WHEN p.grupo = 'HISTORICO' THEN 'HISTORICO'
      ELSE 'CATALOGO'
    END AS origen,
    CASE WHEN p.activo THEN 'ACTIVO' ELSE 'INACTIVO' END AS estado_producto,
    CASE WHEN ca.codigos_anteriores IS NOT NULL THEN 'CONSOLIDADO' ELSE 'NO_APLICA' END AS estado_vinculo
  FROM public.productos p
  LEFT JOIN stock s ON s.producto_codigo = p.codigo_interno
  LEFT JOIN demanda d ON d.producto_codigo = p.codigo_interno
  LEFT JOIN codigos_anteriores ca ON ca.producto_codigo = p.codigo_interno
  LEFT JOIN productos_con_ventas_historicas vh ON vh.producto_codigo = p.codigo_interno
  WHERE p.codigo_interno ILIKE 'REP%'
     OR s.producto_codigo IS NOT NULL
     OR d.producto_codigo IS NOT NULL
), stock_sin_catalogo AS (
  SELECT
    s.producto_codigo AS codigo,
    NULL::text AS codigos_anteriores,
    s.codigo_fabricante,
    coalesce(s.descripcion, 'Producto sin catalogar') AS descripcion,
    'OTROS'::text AS marca,
    NULL::text AS familia,
    s.unidad,
    s.santa_rita, s.santa_rosa, s.campo_9, s.misiones, s.loma_plata, s.katuete,
    s.stock_total,
    0::numeric AS ventas_12m,
    0::numeric AS ventas_24m,
    0::numeric AS ventas_36m,
    'SOLO_STOCK'::text AS origen,
    'SIN_CATALOGO'::text AS estado_producto,
    'PENDIENTE_REVISION'::text AS estado_vinculo
  FROM stock s
  WHERE NOT EXISTS (SELECT 1 FROM public.productos p WHERE p.codigo_interno = s.producto_codigo)
    AND NOT EXISTS (
      SELECT 1 FROM maestro_anterior m
      WHERE m.codigo_legacy_norm = public.normalizar_codigo_repuesto_flexible(s.producto_codigo)
    )
), legacy_sin_catalogo AS (
  SELECT
    m.codigo_legacy AS codigo,
    NULL::text AS codigos_anteriores,
    coalesce(
      nullif(trim(m.codigo_fabricante), ''),
      nullif(trim(vs.codigo_fabricante), ''),
      nullif(trim(s.codigo_fabricante), '')
    ) AS codigo_fabricante,
    coalesce(nullif(m.descripcion, ''), vs.descripcion, 'Producto historico ' || m.codigo_legacy) AS descripcion,
    public.repuestos_marca_legacy_por_subgrupo(m.tipo)::text AS marca,
    m.tipo AS familia,
    NULL::text AS unidad,
    coalesce(s.santa_rita, 0) AS santa_rita,
    coalesce(s.santa_rosa, 0) AS santa_rosa,
    coalesce(s.campo_9, 0) AS campo_9,
    coalesce(s.misiones, 0) AS misiones,
    coalesce(s.loma_plata, 0) AS loma_plata,
    coalesce(s.katuete, 0) AS katuete,
    coalesce(s.stock_total, 0) AS stock_total,
    coalesce(vs.ventas_12m, 0) AS ventas_12m,
    coalesce(vs.ventas_24m, 0) AS ventas_24m,
    coalesce(vs.ventas_36m, 0) AS ventas_36m,
    'MAESTRO_ANTERIOR'::text AS origen,
    coalesce(nullif(m.situacion, ''), 'HISTORICO') AS estado_producto,
    m.estado_vinculo AS estado_vinculo
  FROM maestro_anterior m
  LEFT JOIN stock s
    ON public.normalizar_codigo_repuesto_flexible(s.producto_codigo) = m.codigo_legacy_norm
  LEFT JOIN ventas_sin_vincular vs
    ON vs.codigo_norm = m.codigo_legacy_norm
   AND vs.marca = public.repuestos_marca_legacy_por_subgrupo(m.tipo)::text
  WHERE m.producto_codigo IS NULL
     OR m.estado_vinculo NOT IN ('CONFIRMADA', 'CONFIRMADA_CANONICA')
), venta_historica_sin_maestro AS (
  SELECT
    vs.codigo_legacy AS codigo,
    NULL::text AS codigos_anteriores,
    vs.codigo_fabricante,
    coalesce(vs.descripcion, 'Producto historico ' || vs.codigo_legacy) AS descripcion,
    vs.marca,
    NULL::text AS familia,
    NULL::text AS unidad,
    0::numeric AS santa_rita,
    0::numeric AS santa_rosa,
    0::numeric AS campo_9,
    0::numeric AS misiones,
    0::numeric AS loma_plata,
    0::numeric AS katuete,
    0::numeric AS stock_total,
    vs.ventas_12m,
    vs.ventas_24m,
    vs.ventas_36m,
    'VENTA_HISTORICA'::text AS origen,
    'HISTORICO'::text AS estado_producto,
    'SIN_COINCIDENCIA'::text AS estado_vinculo
  FROM ventas_sin_vincular vs
  WHERE NOT EXISTS (
    SELECT 1
    FROM maestro_anterior m
    WHERE m.codigo_legacy_norm = vs.codigo_norm
      AND public.repuestos_marca_legacy_por_subgrupo(m.tipo)::text = vs.marca
  )
    AND NOT EXISTS (
      SELECT 1 FROM public.productos p
      WHERE public.normalizar_codigo_repuesto_flexible(p.codigo_interno) = vs.codigo_norm
    )
), universo AS (
  SELECT * FROM catalogo
  UNION ALL SELECT * FROM stock_sin_catalogo
  UNION ALL SELECT * FROM legacy_sin_catalogo
  UNION ALL SELECT * FROM venta_historica_sin_maestro
)
SELECT
  u.*,
  current_date AS fecha_corte
FROM universo u;

GRANT SELECT ON public.v_repuestos_stock_ventas_exportacion TO authenticated;

COMMENT ON VIEW public.v_repuestos_stock_ventas_exportacion IS
  'Reporte completo de todas las marcas: catalogo, stock cero, maestro anterior y ventas historicas clasificadas por subgrupo.';

NOTIFY pgrst, 'reload schema';
