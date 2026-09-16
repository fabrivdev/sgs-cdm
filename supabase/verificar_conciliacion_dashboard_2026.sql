-- SOLO LECTURA. Ejecutar DESPUÉS de 20260916160000.
-- Todas las sucursales, todo 2026, sin filtros de marca/tipo/búsqueda.
-- Control de la fuente real del Dashboard, incluyendo sus uniones GRID.
WITH dashboard AS MATERIALIZED (
  SELECT * FROM public.dashboard_facturacion_fuente_v1(date '2026-01-01',date '2026-12-31')
), ventas AS MATERIALIZED (
  SELECT m.metodologia||':'||m.linea_id AS id,m.fecha,m.area_calculada AS modulo,
    m.concepto,m.total_venta AS importe
  FROM public.ventas_area_movimientos_base(date '2026-01-01',date '2026-12-31',NULL,NULL) m
  WHERE m.area_calculada='servicios' AND m.concepto IN ('Servicio','Kilometraje','Repuestos','Terceros')
  UNION ALL
  SELECT r.id,r.fecha,'repuestos','Repuestos',r.importe
  FROM public.ventas_repuestos_movimientos_v1(date '2026-01-01',date '2026-12-31',NULL,NULL) r
), d AS (
  SELECT date_trunc('month',fecha)::date AS mes,area_calculada AS modulo,concepto,id,
    sum(total_venta) AS importe,count(*) AS filas FROM dashboard
  WHERE (area_calculada='servicios' AND concepto IN ('Servicio','Kilometraje','Repuestos','Terceros'))
    OR area_calculada='repuestos'
  GROUP BY 1,2,3,4
), v AS (
  SELECT date_trunc('month',fecha)::date AS mes,modulo,concepto,id,
    sum(importe) AS importe,count(*) AS filas FROM ventas GROUP BY 1,2,3,4
), control AS (
  SELECT coalesce(d.mes,v.mes) AS mes,coalesce(d.modulo,v.modulo) AS modulo,
    coalesce(d.concepto,v.concepto) AS concepto,coalesce(d.importe,0) AS dashboard,
    coalesce(v.importe,0) AS ventas,coalesce(d.filas,0) AS filas_dashboard,
    coalesce(v.filas,0) AS filas_ventas,
    (d.id IS NULL OR v.id IS NULL OR d.filas<>v.filas
      OR abs(coalesce(d.importe,0)-coalesce(v.importe,0))>0.000001) AS diferente
  FROM d FULL JOIN v USING(mes,modulo,concepto,id)
), dimensiones(modulo,concepto) AS (
  VALUES ('servicios','Servicio'),('servicios','Kilometraje'),('servicios','Repuestos'),
    ('servicios','Terceros'),('repuestos','Repuestos')
), mensual AS (
  SELECT m::date AS mes,x.modulo,x.concepto,coalesce(sum(c.ventas),0) AS ventas,
    coalesce(sum(c.dashboard),0) AS dashboard,coalesce(sum(c.filas_ventas),0) AS filas_ventas,
    coalesce(sum(c.filas_dashboard),0) AS filas_dashboard,
    count(*) FILTER(WHERE c.diferente) AS registros_diferentes
  FROM generate_series(date '2026-01-01',date '2026-12-01',interval '1 month') m
  CROSS JOIN dimensiones x LEFT JOIN control c ON c.mes=m::date
    AND c.modulo=x.modulo AND c.concepto=x.concepto GROUP BY 1,2,3
), salida AS (
  SELECT to_char(mes,'YYYY-MM') AS periodo,modulo,concepto,ventas,dashboard,
    filas_ventas,filas_dashboard,registros_diferentes FROM mensual
  UNION ALL SELECT 'TOTAL 2026',modulo,concepto,sum(ventas),sum(dashboard),
    sum(filas_ventas),sum(filas_dashboard),sum(registros_diferentes)
    FROM mensual GROUP BY modulo,concepto
  UNION ALL SELECT 'TOTAL POSTVENTA 2026','Servicios + Repuestos','Todos',sum(ventas),sum(dashboard),
    sum(filas_ventas),sum(filas_dashboard),sum(registros_diferentes) FROM mensual
)
SELECT periodo,modulo,concepto,round(ventas,2) AS importe_ventas_actual,
  round(dashboard,2) AS importe_dashboard,round(dashboard-ventas,2) AS diferencia,
  filas_ventas,filas_dashboard,registros_diferentes,
  CASE WHEN registros_diferentes=0 AND abs(dashboard-ventas)<=0.000001 THEN 'COINCIDE'
    ELSE 'REVISAR' END AS resultado
FROM salida ORDER BY periodo,modulo,concepto;
