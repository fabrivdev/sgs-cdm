-- SOLO LECTURA: identificar conceptos ajenos a Servicios/Repuestos antes de
-- cambiar importes. No asumir que tipo de tiempo "No informado" = Otros.
WITH lineas AS MATERIALIZED (
  SELECT f.id::text AS linea_id,f.fecha_factura::date AS fecha,f.factura,
    f.entidad_nombre AS cliente,f.total_venta AS importe,f.origen_sistema,
    f.tipo_tiempo::text AS tipo_tiempo,f.cod_mercaderia AS codigo,
    f.mercaderia AS descripcion,f.subgrupo_original AS grupo,
    f.raw_data->>'linked_service_order' AS os,
    upper(translate(concat_ws(' ',f.mercaderia,f.subgrupo_original,f.cod_mercaderia),
      'áéíóúÁÉÍÓÚ','aeiouAEIOU')) AS texto
  FROM public.facturacion_lineas_importadas f
  WHERE f.fecha_factura>=timestamptz '2026-01-01 00:00:00+00'
    AND f.fecha_factura<timestamptz '2027-01-01 00:00:00+00'
    AND f.origen_sistema<>'grid_campos'
    AND upper(btrim(coalesce(f.moneda,'USD')))='USD'
), candidatos AS (
  SELECT *,CASE
    WHEN texto ~ '(COSTOS?|GASTOS?|CARGOS?|TASAS?)[[:space:]]+(DE[[:space:]]+)?ENVIOS?|COSTOENVIO' THEN 'Envío'
    WHEN texto ~ '(^|[^A-Z])INTERES(ES)?([^A-Z]|$)|MORA[[:space:]]+FINANCIERA' THEN 'Intereses'
    WHEN texto ~ 'MERCHAND|MERCHAD|(^|[^A-Z])(TERMO|TERMOS|REMERA|REMERAS|CAMISETA|CAMISETAS)([^A-Z]|$)' THEN 'Merchandising: revisar artículo'
    END AS motivo
  FROM lineas
), fuente AS MATERIALIZED (
  SELECT * FROM public.dashboard_facturacion_fuente_v1(date '2026-01-01',date '2026-12-31')
)
SELECT c.linea_id,c.fecha,c.factura,c.cliente,c.codigo,c.descripcion,c.grupo,
  c.importe,c.origen_sistema,c.tipo_tiempo,c.os,c.motivo,
  d.area_calculada AS area_dashboard,d.concepto AS concepto_dashboard,
  CASE WHEN d.area_calculada='servicios' THEN 'Servicios'
    WHEN d.area_calculada='repuestos' THEN 'Repuestos'
    WHEN d.id IS NULL THEN 'Fuera de la fuente Dashboard'
    ELSE 'Fuera de postventa' END AS inclusion_actual
FROM candidatos c LEFT JOIN fuente d
  ON d.id=(CASE WHEN c.origen_sistema='legacy_historico_detallado' THEN 'historico:' ELSE 'actual:' END)||c.linea_id
WHERE c.motivo IS NOT NULL ORDER BY c.fecha,c.factura,c.linea_id;
