BEGIN;
DO $$ BEGIN
  IF to_regprocedure('public.ventas_area_movimientos_base(date,date,text,text)') IS NULL
    OR to_regclass('public.v_ventas_repuestos_historico_completo') IS NULL
    OR to_regprocedure('public.cliente_nombre_canonico(text)') IS NULL THEN
    RAISE EXCEPTION 'Faltan las fuentes de Ventas. Aplicá primero las migraciones de Repuestos histórico completo e identidad de clientes.';
  END IF;
END $$;
-- Fuente monetaria única para Dashboard. No borra ni modifica GRID, las OS,
-- las comisiones ni las líneas originales. GRID sólo aporta metadatos.
-- Histórico: Servicios conserva el resumen; Repuestos usa el detalle completo.
-- Actual: la clasificación es exactamente la compartida por Ventas.
CREATE OR REPLACE FUNCTION public.dashboard_facturacion_fuente_v1(p_desde date,p_hasta date)
RETURNS TABLE(id text,fecha date,sucursal text,tipo text,cliente_id uuid,
  entidad_nombre text,total_venta numeric,cantidad numeric,grupo text,grupo_fx text,
  cod_factura text,tipo_tiempo text,marca text,origen_sistema text,raw_data jsonb,
  concepto text,area_calculada text,codigo_fabricante text,cod_mercaderia text,mercaderia text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
WITH base AS MATERIALIZED (
  SELECT * FROM public.ventas_area_movimientos_base(p_desde,p_hasta,NULL,NULL)
), fuente AS MATERIALIZED (
  SELECT m.metodologia||':'||m.linea_id AS id,m.linea_id,m.fecha,m.sucursal,m.cliente,
    m.total_venta,m.cantidad,m.concepto,m.area_calculada,m.metodologia,
    m.factura,m.codigo,m.codigo_fabricante,m.descripcion,m.marca
  FROM base m
  -- Nunca sumar el resumen histórico de repuestos además del detalle completo.
  WHERE m.metodologia<>'historico' OR m.area_calculada<>'repuestos'
  UNION ALL
  SELECT 'historico:'||h.linea_id,h.linea_id,h.fecha,h.sucursal,h.cliente,h.importe,
    CASE WHEN h.es_nota_credito THEN -abs(h.cantidad) ELSE h.cantidad END,
    'Repuestos','repuestos','historico',h.factura,h.codigo,h.codigo_fabricante,h.descripcion,NULL
  FROM public.v_ventas_repuestos_historico_completo h
  WHERE h.fecha_factura>=p_desde::timestamptz
    AND h.fecha_factura<(least(p_hasta,date '2026-06-30')+1)::timestamptz
), historico AS MATERIALIZED (
  SELECT f.*,public.cliente_nombre_canonico(f.entidad_nombre) AS cliente_clave,
    upper(btrim(f.sucursal::text)) AS sucursal_clave
  FROM public.facturacion_lineas_importadas f
  JOIN fuente s ON s.linea_id=f.id::text AND s.metodologia='historico' AND s.area_calculada='repuestos'
), grid AS MATERIALIZED (
  SELECT g.*,public.cliente_nombre_canonico(g.entidad_nombre) AS cliente_clave,
    upper(btrim(g.sucursal::text)) AS sucursal_clave
  FROM public.facturacion_lineas_importadas g
  WHERE g.origen_sistema='grid_campos'
    AND g.fecha_factura>=p_desde::timestamptz
    AND g.fecha_factura<(least(p_hasta,date '2026-06-30')+1)::timestamptz
    AND upper(btrim(coalesce(g.moneda,'USD')))='USD'
), registradas AS MATERIALIZED (
  SELECT g.id AS grid_id,h.id AS historico_id,g.tipo_tiempo::text AS tipo_grid
  FROM grid g JOIN public.repuestos_ventas_duplicadas d ON d.linea_id=g.id
  JOIN historico h ON h.id=d.linea_canonica_id
  WHERE abs(g.total_venta-h.total_venta)<=0.01 AND g.cantidad=h.cantidad
    AND g.fecha_factura::date=h.fecha_factura::date
    AND g.cliente_clave=h.cliente_clave
    AND nullif(g.sucursal_clave,'')=h.sucursal_clave
), candidatos AS MATERIALIZED (
  SELECT g.id AS grid_id,h.id AS historico_id,g.tipo_tiempo::text AS tipo_grid
  FROM grid g JOIN historico h
    ON g.fecha_factura::date=h.fecha_factura::date
    AND g.cliente_clave=h.cliente_clave
    AND nullif(g.sucursal_clave,'')=h.sucursal_clave
    AND ((nullif(upper(btrim(g.cod_mercaderia)),'')=upper(btrim(h.cod_mercaderia)))
      OR (nullif(upper(btrim(g.codigo_fabricante)),'')=upper(btrim(h.codigo_fabricante))))
    AND ((nullif(upper(btrim(g.factura)),'')=upper(btrim(h.factura)))
      OR (nullif(upper(btrim(g.codigo_interno_factura)),'')=upper(btrim(h.codigo_interno_factura))))
    AND g.cantidad=h.cantidad AND abs(g.total_venta-h.total_venta)<=0.01
  WHERE NOT EXISTS(SELECT 1 FROM public.repuestos_ventas_duplicadas d WHERE d.linea_id=g.id)
), candidatos_controlados AS (
  SELECT c.*,count(*) OVER(PARTITION BY grid_id) AS destinos,
    count(*) OVER(PARTITION BY historico_id) AS origenes
  FROM candidatos c
), relaciones AS (
  SELECT * FROM registradas
  UNION ALL
  SELECT grid_id,historico_id,tipo_grid FROM candidatos_controlados c
  WHERE destinos=1 AND origenes=1
    AND NOT EXISTS(SELECT 1 FROM public.repuestos_ventas_duplicadas d
      JOIN public.facturacion_lineas_importadas g ON g.id=d.linea_id AND g.origen_sistema='grid_campos'
      WHERE d.linea_canonica_id=c.historico_id)
), metadatos AS (
  -- Una fila por destino, nunca una expansión de movimientos monetarios.
  -- Si hay conflicto de tipos, no imponer ninguno de los candidatos.
  SELECT historico_id,
    CASE WHEN count(DISTINCT nullif(btrim(tipo_grid),''))=1
      THEN min(nullif(btrim(tipo_grid),'')) END AS tipo_grid,
    count(DISTINCT nullif(btrim(tipo_grid),''))>1 AS conflicto
  FROM relaciones GROUP BY historico_id
)
SELECT s.id,s.fecha,s.sucursal,
  CASE WHEN s.concepto='Repuestos' THEN 'Repuesto' ELSE 'Servicio' END,
  CASE WHEN public.cliente_nombre_canonico(s.cliente)<>s.cliente THEN NULL ELSE l.cliente_id END,
  coalesce(public.cliente_nombre_canonico(s.cliente),'Cliente no informado'),
  s.total_venta,s.cantidad,
  coalesce(f.subgrupo_original,l.grupo,s.descripcion),s.concepto,
  coalesce(nullif(btrim(f.codigo_interno_factura),''),s.factura,'linea:'||s.id),
  CASE WHEN md.conflicto THEN NULL
    WHEN md.tipo_grid IS NOT NULL THEN md.tipo_grid
    WHEN s.metodologia='actual' THEN nullif(btrim(f.tipo_tiempo::text),'')
    -- El resumen histórico no informa el tipo de tiempo de la OS.
    WHEN s.area_calculada='repuestos' THEN nullif(btrim(f.tipo_tiempo::text),'')
    ELSE NULL END,
  coalesce(s.marca,f.marca_normalizada::text,
    CASE WHEN upper(coalesce(l.grupo,s.descripcion,'')) LIKE '%CLAAS%' THEN 'CLAAS'
      WHEN upper(coalesce(l.grupo,s.descripcion,'')) LIKE '%HORSCH%' THEN 'HORSCH' ELSE 'OTROS' END),
  coalesce(f.origen_sistema,'legacy'),
  -- No enviar el XML/Excel completo por cada fila paginada. El original
  -- permanece intacto en la tabla; códigos y descripción van en sus columnas.
  jsonb_strip_nulls(jsonb_build_object(
    'linked_service_order',f.raw_data->'linked_service_order',
    'canonical_document_kind',f.raw_data->'canonical_document_kind',
    'dashboard_time_type_source',CASE WHEN md.conflicto THEN 'conflicto_grid'
      WHEN md.tipo_grid IS NOT NULL THEN 'grid_inferido'
      WHEN f.tipo_tiempo IS NOT NULL THEN 'importado' ELSE 'no_informado' END)),
  s.concepto,s.area_calculada,s.codigo_fabricante,s.codigo,s.descripcion
FROM fuente s
LEFT JOIN public.facturacion_lineas_importadas f ON f.id::text=s.linea_id
  AND (s.metodologia='actual' OR s.area_calculada='repuestos')
LEFT JOIN public.facturacion l ON l.id::text=s.linea_id
  AND s.metodologia='historico' AND s.area_calculada<>'repuestos'
LEFT JOIN metadatos md ON md.historico_id=f.id
ORDER BY s.fecha DESC,s.id;
$$;
REVOKE ALL ON FUNCTION public.dashboard_facturacion_fuente_v1(date,date) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.dashboard_facturacion_movimientos_v1(p_desde date,p_hasta date)
RETURNS TABLE(id text,fecha date,sucursal text,tipo text,cliente_id uuid,
  entidad_nombre text,total_venta numeric,cantidad numeric,grupo text,grupo_fx text,
  cod_factura text,tipo_tiempo text,marca text,origen_sistema text,raw_data jsonb,
  concepto text,area_calculada text,codigo_fabricante text,cod_mercaderia text,mercaderia text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
SET statement_timeout='25s' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(),'servicios.dashboard') THEN
    RAISE EXCEPTION 'No tenés acceso al Dashboard' USING errcode='42501';
  END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_desde>p_hasta THEN
    RAISE EXCEPTION 'Seleccioná un rango de fechas válido.' USING errcode='22023';
  END IF;
  RETURN QUERY SELECT * FROM public.dashboard_facturacion_fuente_v1(p_desde,p_hasta);
END;
$$;
REVOKE ALL ON FUNCTION public.dashboard_facturacion_movimientos_v1(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dashboard_facturacion_movimientos_v1(date,date) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
