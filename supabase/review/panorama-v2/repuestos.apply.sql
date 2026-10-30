-- Propuesta local posterior a tramos/transiciones del 21/10/2026; NO aplicada.
-- Conserva ACL existentes.
BEGIN;
-- Hash de la version con tramos/transiciones aplicado el 21/10 segun la nota local.
-- Releer la definicion vigente antes de ejecutar esta propuesta nueva.
DO $guard$ BEGIN IF md5(pg_get_functiondef('public.campi_repuestos_exposicion_v1()'::regprocedure)) <> '473aaf1d27b6a51af89a06da2b18f5ac' THEN RAISE EXCEPTION 'La definición vigente cambió; detener y revisar'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION public.campi_repuestos_exposicion_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '90s'
AS $function$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_module_access(auth.uid(), 'repuestos')
 OR NOT public.has_section_access(auth.uid(), 'repuestos.analisis') THEN
 RAISE EXCEPTION 'Sin acceso al análisis de repuestos' USING ERRCODE = '42501';
 END IF;

 WITH historic AS MATERIALIZED (
 SELECT h.codigo_interno, h.descripcion, h.stock_total,
 h.unidades_anio_actual, h.unidades_anio_anterior, h.unidades_hace_dos_anios,
 h.color, h.familia, h.fecha_analisis, c.ultima_compra, c.fuente_compra,
 (current_date - c.ultima_compra) AS dias_compra
 FROM public.v_repuestos_semaforo_historico h
 LEFT JOIN public.v_repuestos_ultima_compra c ON c.producto_codigo = h.codigo_interno
 ), locations AS MATERIALIZED (
 SELECT h.*, u.sucursal, u.stock, u.saldo_kardex, u.valor_kardex_usd,
 u.kardex_cargado_en,
 CASE WHEN u.stock > 0 AND u.valor_kardex_usd > 0 THEN u.valor_kardex_usd ELSE 0 END AS valor_elegible
 FROM historic h
 JOIN public.v_repuestos_analisis_ubicaciones u ON u.producto_codigo = h.codigo_interno
 ), totals AS (
 SELECT count(DISTINCT codigo_interno) FILTER (WHERE stock > 0) AS codigos_stock,
 count(*) FILTER (WHERE stock > 0) AS ubicaciones_stock,
 count(*) FILTER (WHERE stock > 0 AND valor_kardex_usd IS NULL) AS ubicaciones_sin_valor,
 count(*) FILTER (WHERE stock > 0 AND valor_kardex_usd <= 0) AS ubicaciones_valor_no_positivo,
 count(*) FILTER (WHERE stock > 0 AND saldo_kardex IS NULL) AS ubicaciones_sin_saldo_kardex,
 count(*) FILTER (WHERE stock > 0 AND saldo_kardex IS NOT NULL AND abs(saldo_kardex - stock) >= 0.000001) AS ubicaciones_saldo_distinto,
 sum(valor_elegible) AS valor_total_usd,
 sum(valor_elegible) FILTER (WHERE color IN ('GRIS','ROJO')) AS valor_antiguo_usd,
 count(DISTINCT codigo_interno) FILTER (WHERE stock > 0 AND color IN ('GRIS','ROJO')) AS codigos_antiguos,
 sum(valor_elegible) FILTER (WHERE color = 'SIN_DATOS') AS valor_sin_fecha_usd,
 sum(valor_kardex_usd) FILTER (WHERE stock <= 0 AND valor_kardex_usd > 0) AS valor_residual_sin_stock_usd,
 max(kardex_cargado_en) FILTER (WHERE valor_elegible > 0) AS ultima_carga_kardex
 FROM locations
 ), colors AS (
 SELECT color, count(DISTINCT codigo_interno) FILTER (WHERE stock > 0) AS codigos,
 sum(valor_elegible) AS valor_usd
 FROM locations GROUP BY color
 ), alerts AS (
 SELECT 'GRIS'::text AS destino, 366 AS umbral_dias,
 count(DISTINCT codigo_interno) FILTER (WHERE stock > 0 AND color = 'LILA' AND dias_compra BETWEEN 336 AND 365) AS codigos,
 sum(valor_elegible) FILTER (WHERE color = 'LILA' AND dias_compra BETWEEN 336 AND 365) AS valor_usd
 FROM locations
 UNION ALL
 SELECT 'ROJO', 1001,
 count(DISTINCT codigo_interno) FILTER (WHERE stock > 0 AND color = 'GRIS' AND dias_compra BETWEEN 971 AND 1000),
 sum(valor_elegible) FILTER (WHERE color = 'GRIS' AND dias_compra BETWEEN 971 AND 1000)
 FROM locations
 ), age_bands AS (
    SELECT CASE WHEN dias_compra BETWEEN 366 AND 1000 THEN '366–1000 días'
                WHEN dias_compra > 1000 THEN '>1000 días' ELSE 'Sin fecha válida' END AS tramo,
           count(DISTINCT codigo_interno) FILTER (WHERE stock > 0) AS codigos,
           sum(valor_elegible) AS valor_usd
    FROM locations WHERE color IN ('GRIS','ROJO') GROUP BY 1
  ), transitions AS (
    SELECT codigo_interno, color, dias_compra,
           CASE WHEN color = 'LILA' THEN 366 - dias_compra ELSE 1001 - dias_compra END AS dias_hasta,
           CASE WHEN color = 'LILA' THEN 'GRIS' ELSE 'ROJO' END AS destino,
           sum(valor_elegible) AS valor_usd,
           max(descripcion) AS descripcion, max(stock_total) AS stock_unidades,
           max(ultima_compra) AS ultima_compra, max(fuente_compra) AS fuente_compra,
           max(unidades_anio_actual) AS unidades_anio_actual,
           max(unidades_anio_anterior) AS unidades_anio_anterior,
           max(unidades_hace_dos_anios) AS unidades_hace_dos_anios,
           max(kardex_cargado_en) FILTER (WHERE valor_elegible > 0) AS kardex_cargado_en,
           count(*) FILTER (WHERE valor_kardex_usd IS NULL) AS ubicaciones_sin_valor,
           count(*) FILTER (WHERE valor_kardex_usd <= 0) AS ubicaciones_valor_no_positivo,
           count(*) FILTER (WHERE saldo_kardex IS NOT NULL AND abs(saldo_kardex - stock) >= 0.000001) AS ubicaciones_saldo_distinto
    FROM locations WHERE stock > 0 AND ((color = 'LILA' AND dias_compra BETWEEN 336 AND 365)
      OR (color = 'GRIS' AND dias_compra BETWEEN 971 AND 1000))
    GROUP BY codigo_interno,color,dias_compra

 ), branches AS (
 SELECT sucursal AS nombre, sum(valor_elegible) AS valor_total_usd,
 sum(valor_elegible) FILTER (WHERE color IN ('GRIS','ROJO')) AS valor_antiguo_usd,
 count(DISTINCT codigo_interno) FILTER (WHERE stock > 0 AND color IN ('GRIS','ROJO')) AS codigos_antiguos
 FROM locations GROUP BY sucursal
 ), families AS (
 SELECT coalesce(nullif(familia, ''), 'Sin familia') AS nombre,
 sum(valor_elegible) AS valor_total_usd,
 sum(valor_elegible) FILTER (WHERE color IN ('GRIS','ROJO')) AS valor_antiguo_usd,
 count(DISTINCT codigo_interno) FILTER (WHERE stock > 0 AND color IN ('GRIS','ROJO')) AS codigos_antiguos
 FROM locations GROUP BY 1
 )
 SELECT jsonb_build_object(
 'fecha_analisis', current_date,
     'tramos_compra', (SELECT coalesce(jsonb_agg(jsonb_build_object('tramo',tramo,'codigos',codigos,'valor_usd',coalesce(valor_usd,0)) ORDER BY tramo),'[]'::jsonb) FROM age_bands),
    'transiciones', (SELECT coalesce(jsonb_agg(jsonb_build_object('codigo',codigo_interno,'destino',destino,'dias_hasta',dias_hasta,'valor_usd',coalesce(valor_usd,0)) ORDER BY dias_hasta,codigo_interno),'[]'::jsonb) FROM transitions),
    'candidatos_30d', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'codigo',codigo_interno,'descripcion',descripcion,'color_actual',color,'destino',destino,
      'ultima_compra',ultima_compra,'fuente_compra',fuente_compra,'dias_compra',dias_compra,'dias_hasta',dias_hasta,
      'stock_unidades',stock_unidades,'valor_usd',coalesce(valor_usd,0),'kardex_cargado_en',kardex_cargado_en,
      'ubicaciones_sin_valor',ubicaciones_sin_valor,'ubicaciones_valor_no_positivo',ubicaciones_valor_no_positivo,
      'ubicaciones_saldo_distinto',ubicaciones_saldo_distinto,
      'unidades_anio_actual',unidades_anio_actual,'unidades_anio_anterior',unidades_anio_anterior,
      'unidades_hace_dos_anios',unidades_hace_dos_anios
    ) ORDER BY dias_hasta,codigo_interno),'[]'::jsonb) FROM transitions),
 'codigos_stock', t.codigos_stock,
 'ubicaciones_stock', t.ubicaciones_stock,
 'ubicaciones_sin_valor', t.ubicaciones_sin_valor,
 'ubicaciones_valor_no_positivo', t.ubicaciones_valor_no_positivo,
 'ubicaciones_sin_saldo_kardex', t.ubicaciones_sin_saldo_kardex,
 'ubicaciones_saldo_distinto', t.ubicaciones_saldo_distinto,
 'valor_total_usd', coalesce(t.valor_total_usd, 0),
 'valor_antiguo_usd', coalesce(t.valor_antiguo_usd, 0),
 'codigos_antiguos', t.codigos_antiguos,
 'valor_sin_fecha_usd', coalesce(t.valor_sin_fecha_usd, 0),
 'valor_residual_sin_stock_usd', coalesce(t.valor_residual_sin_stock_usd, 0),
 'ultima_carga_kardex', t.ultima_carga_kardex,
 'colores', (SELECT coalesce(jsonb_agg(jsonb_build_object('color', color, 'codigos', codigos, 'valor_usd', valor_usd) ORDER BY color), '[]'::jsonb) FROM colors),
 'avisos', (SELECT coalesce(jsonb_agg(jsonb_build_object('destino', destino, 'umbral_dias', umbral_dias, 'codigos', codigos, 'valor_usd', coalesce(valor_usd,0)) ORDER BY destino DESC), '[]'::jsonb) FROM alerts),
 'sucursales', (SELECT coalesce(jsonb_agg(jsonb_build_object('nombre', nombre, 'valor_total_usd', valor_total_usd, 'valor_antiguo_usd', coalesce(valor_antiguo_usd,0), 'codigos_antiguos', codigos_antiguos) ORDER BY valor_antiguo_usd DESC NULLS LAST, nombre), '[]'::jsonb) FROM branches),
 'familias', (SELECT coalesce(jsonb_agg(jsonb_build_object('nombre', nombre, 'valor_total_usd', valor_total_usd, 'valor_antiguo_usd', coalesce(valor_antiguo_usd,0), 'codigos_antiguos', codigos_antiguos) ORDER BY valor_antiguo_usd DESC NULLS LAST, nombre), '[]'::jsonb) FROM families)
 ) INTO result FROM totals t;
 RETURN result;
END;
$function$
;
COMMIT;
