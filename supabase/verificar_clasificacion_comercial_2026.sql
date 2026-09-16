-- SOLO LECTURA. Ejecutar después de 20260916180000.
-- El original se conserva. Para 181925 del 05/01/2026 deben aparecer
-- dos repuestos (62,05 y 9,18) y el resumen del envío de 1 en Otros, no MO.
WITH fuente AS MATERIALIZED (
  SELECT * FROM public.dashboard_facturacion_fuente_v1(date '2026-01-01',date '2026-12-31')
)
SELECT d.fecha,d.cod_factura,d.entidad_nombre,d.sucursal,d.id,
  d.cod_mercaderia,d.mercaderia,d.concepto,d.area_calculada,d.total_venta,
  f.grupo AS grupo_original_resumen,f.grupo_fx AS grupo_fx_original,
  CASE WHEN d.area_calculada='otros' THEN 'Fuera de postventa; conservado en Otros'
    WHEN d.area_calculada='repuestos' THEN 'Ventas de Repuestos'
    WHEN d.area_calculada='servicios' THEN 'Ventas de Servicios'
    ELSE d.area_calculada END AS inclusion
FROM fuente d
LEFT JOIN public.facturacion f ON d.id='historico:'||f.id::text
WHERE ltrim(regexp_replace(d.cod_factura,'[^0-9]','','g'),'0')='181925'
ORDER BY d.fecha,d.sucursal,d.id;
