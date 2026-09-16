-- SOLO LECTURA. Incluye el resumen clásico que la consulta anterior omitía.
-- No asumir que tipo de tiempo "No informado" = Otros.
-- Sin descripción conservada en el resumen, mostrar la falta de GRUPO FX;
-- no inventar el artículo ni vincular una OS sólo por cliente/importe.
WITH lineas AS MATERIALIZED (
  SELECT (CASE WHEN f.origen_sistema='legacy_historico_detallado' THEN 'historico:' ELSE 'actual:' END)
      ||f.id::text AS id_fuente,f.id::text AS linea_id,
    f.fecha_factura::date AS fecha,f.factura,f.codigo_interno_factura,
    f.entidad_nombre AS cliente,f.total_venta AS importe,f.origen_sistema,
    f.tipo_tiempo::text AS tipo_tiempo,f.cod_mercaderia AS codigo,
    coalesce(nullif(btrim(f.mercaderia),''),f.observacion) AS descripcion,
    f.observacion,f.subgrupo_original AS grupo,f.grupo_normalizado AS grupo_fx,
    f.raw_data->>'linked_service_order' AS os,false AS resumen_sin_fx,
    upper(translate(concat_ws(' ',f.mercaderia,f.observacion,f.subgrupo_original,
      f.grupo_normalizado,f.cod_mercaderia,f.raw_data->>'grupo_original'),
      'áéíóúÁÉÍÓÚ','aeiouAEIOU')) AS texto
  FROM public.facturacion_lineas_importadas f
  WHERE f.fecha_factura>=timestamptz '2026-01-01 00:00:00+00'
    AND f.fecha_factura<timestamptz '2027-01-01 00:00:00+00'
    AND f.origen_sistema<>'grid_campos'
    AND upper(btrim(coalesce(f.moneda,'USD')))='USD'
  UNION ALL
  SELECT 'historico:'||f.id::text,f.id::text,f.fecha::date,f.cod_factura,NULL,
    f.entidad_nombre,f.total_venta,'legacy_resumen',NULL,NULL,
    NULL,NULL,f.grupo,f.grupo_fx,NULL,
    f.tipo::text='Servicio' AND nullif(btrim(f.grupo_fx),'') IS NULL,
    upper(translate(concat_ws(' ',f.grupo,f.grupo_fx),
      'áéíóúÁÉÍÓÚ','aeiouAEIOU'))
  FROM public.facturacion f
  WHERE f.fecha>=timestamptz '2026-01-01 00:00:00+00'
    AND f.fecha<timestamptz '2026-07-01 00:00:00+00'
    AND NOT coalesce(f.excluido_de_reportes,false)
    AND upper(btrim(coalesce(f.moneda,'USD')))='USD'
), candidatos AS (
  SELECT *,CASE
    WHEN texto ~ '(COSTOS?|GASTOS?|CARGOS?|TASAS?)[[:space:]]+(DE[[:space:]]+)?ENVIOS?|COSTOENVIO' THEN 'Envío'
    WHEN texto ~ '(^|[^A-Z])INTERES(ES)?([^A-Z]|$)' THEN 'Intereses'
    WHEN texto ~ 'MERCHAND|MERCHAD' THEN 'Merchandising'
    WHEN resumen_sin_fx THEN 'Resumen de hoja Servicios sin GRUPO FX; revisar descripción en Excel'
    END AS motivo
  FROM lineas
), fuente AS MATERIALIZED (
  SELECT * FROM public.dashboard_facturacion_fuente_v1(date '2026-01-01',date '2026-12-31')
)
SELECT c.linea_id,c.fecha,c.factura,c.codigo_interno_factura,c.cliente,c.codigo,
  c.descripcion,c.observacion,c.grupo,c.grupo_fx,c.importe,c.origen_sistema,
  c.tipo_tiempo,c.os,c.motivo,d.area_calculada AS area_dashboard,d.concepto AS concepto_dashboard,
  CASE WHEN d.area_calculada='servicios' THEN 'Servicios'
    WHEN d.area_calculada='repuestos' THEN 'Repuestos'
    WHEN d.id IS NULL AND c.origen_sistema='legacy_resumen'
      THEN 'Resumen fuera de fuente canónica; no sumar al detalle'
    WHEN d.id IS NULL THEN 'Fuera de la fuente Dashboard'
    ELSE 'Fuera de postventa; conservado en Otros' END AS inclusion_actual
FROM candidatos c LEFT JOIN fuente d ON d.id=c.id_fuente
WHERE c.motivo IS NOT NULL ORDER BY c.fecha,c.factura,c.linea_id;
