-- Two independent group indicators; preserve purchase weighting, sources and access.
BEGIN;
CREATE OR REPLACE FUNCTION public.repuestos_analisis_valorizado(
 p_filtros jsonb DEFAULT '{}', p_agrupacion text DEFAULT 'marca',
 p_limite integer DEFAULT 50, p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp SET statement_timeout = '90s' AS $function$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_module_access(auth.uid(),'repuestos') AND public.has_section_access(auth.uid(),'repuestos.analisis')) THEN
   RAISE EXCEPTION 'Sin acceso al modulo de repuestos' USING ERRCODE='42501';
 END IF;
 IF p_agrupacion NOT IN ('marca','familia','sucursal','deposito') THEN
   RAISE EXCEPTION 'Agrupación inválida' USING ERRCODE='22023';
 END IF;
 WITH historico AS MATERIALIZED (
   SELECT h.*, c.ultima_compra, c.fuente_compra,
    current_date-c.ultima_compra dias_ultima_compra,
    CASE WHEN c.ultima_compra IS NULL THEN 'SIN_FECHA'
      WHEN current_date-c.ultima_compra <=365 THEN 'HASTA_365'
      WHEN current_date-c.ultima_compra <=730 THEN 'DE_366_A_730'
      ELSE 'MAS_730' END franja
   FROM public.v_repuestos_semaforo_historico h
   LEFT JOIN public.v_repuestos_ultima_compra c ON c.producto_codigo=h.codigo_interno
 ), ubicaciones AS MATERIALIZED (
   SELECT u.*,h.marca::text marca,coalesce(nullif(h.familia,''),'Sin familia') familia,h.color,h.franja,h.dias_ultima_compra
   FROM public.v_repuestos_analisis_ubicaciones u JOIN historico h ON h.codigo_interno=u.producto_codigo
 ), elegidas AS MATERIALIZED (
   SELECT u.* FROM ubicaciones u JOIN historico h ON h.codigo_interno=u.producto_codigo
   WHERE (nullif(p_filtros->>'busqueda','') IS NULL OR concat_ws(' ',h.codigo_interno,h.descripcion,h.codigo_fabricante,h.codigo_anterior_ejemplo) ILIKE '%'||(p_filtros->>'busqueda')||'%')
    AND (nullif(p_filtros->>'marca','') IS NULL OR u.marca=p_filtros->>'marca')
    AND (nullif(p_filtros->>'familia','') IS NULL OR u.familia=p_filtros->>'familia')
    AND (nullif(p_filtros->>'sucursal','') IS NULL OR u.sucursal=p_filtros->>'sucursal')
    AND (nullif(p_filtros->>'deposito','') IS NULL OR u.deposito=p_filtros->>'deposito')
    AND (nullif(p_filtros->>'color','') IS NULL OR u.color=p_filtros->>'color')
    AND (nullif(p_filtros->>'franja','') IS NULL OR u.franja=p_filtros->>'franja')
    AND (nullif(p_filtros->>'compra_dias_min','') IS NULL OR h.dias_ultima_compra >= (p_filtros->>'compra_dias_min')::numeric)
    AND (nullif(p_filtros->>'compra_dias_max','') IS NULL OR h.dias_ultima_compra <= (p_filtros->>'compra_dias_max')::numeric)
    AND (nullif(p_filtros->>'dias_min','') IS NULL OR h.dias_ultima_venta >= (p_filtros->>'dias_min')::numeric)
    AND (nullif(p_filtros->>'dias_max','') IS NULL OR h.dias_ultima_venta <= (p_filtros->>'dias_max')::numeric)
 ), productos AS MATERIALIZED (
   SELECT producto_codigo,sum(stock) stock_total,sum(saldo_kardex) saldo_kardex,
    sum(valor_kardex_usd) valor_kardex_usd,max(kardex_cargado_en) kardex_cargado_en,
    CASE WHEN count(DISTINCT kardex_archivo)=1 THEN min(kardex_archivo) ELSE 'Varios archivos' END kardex_archivo,
    count(*) FILTER (WHERE stock<>0 AND valor_kardex_usd IS NULL) ubicaciones_sin_valor,
    coalesce(sum(stock) FILTER (WHERE sucursal='Santa Rita'),0) santa_rita,
    coalesce(sum(stock) FILTER (WHERE sucursal='Santa Rosa'),0) santa_rosa,
    coalesce(sum(stock) FILTER (WHERE sucursal='Campo 9'),0) campo_9,
    coalesce(sum(stock) FILTER (WHERE sucursal='Misiones'),0) misiones,
    coalesce(sum(stock) FILTER (WHERE sucursal='Loma Plata'),0) loma_plata,
    coalesce(sum(stock) FILTER (WHERE sucursal='Katuete'),0) katuete
   FROM elegidas GROUP BY producto_codigo
 ), filtrado AS MATERIALIZED (
   SELECT p.*,h.color,h.franja,
    p.saldo_kardex IS NOT NULL AND abs(p.saldo_kardex-p.stock_total)<0.000001 saldo_coincide,
    (to_jsonb(h)||to_jsonb(p)||jsonb_build_object('saldo_coincide',p.saldo_kardex IS NOT NULL AND abs(p.saldo_kardex-p.stock_total)<0.000001)) - 'producto_codigo' datos
   FROM productos p JOIN historico h ON h.codigo_interno=p.producto_codigo
   WHERE (nullif(p_filtros->>'usd_min','') IS NULL OR p.valor_kardex_usd >= (p_filtros->>'usd_min')::numeric)
    AND (nullif(p_filtros->>'usd_max','') IS NULL OR p.valor_kardex_usd <= (p_filtros->>'usd_max')::numeric)
    AND (nullif(p_filtros->>'valorizacion','') IS NULL
      OR (p_filtros->>'valorizacion'='COMPLETA' AND p.valor_kardex_usd IS NOT NULL AND p.ubicaciones_sin_valor=0)
      OR (p_filtros->>'valorizacion'='INCOMPLETA' AND (p.valor_kardex_usd IS NULL OR p.ubicaciones_sin_valor>0)))
 ), finales AS MATERIALIZED (
   SELECT e.* FROM elegidas e JOIN filtrado f USING (producto_codigo)
 ), colores AS (
   SELECT color,count(*) lineas,sum(stock_total) unidades_stock,sum(valor_kardex_usd) valor_kardex_usd,
    count(valor_kardex_usd) lineas_valorizadas,count(*) FILTER (WHERE saldo_coincide) saldos_coincidentes
   FROM filtrado GROUP BY color
 ), franjas AS (
   SELECT franja,count(*) lineas,sum(valor_kardex_usd) valor_kardex_usd FROM filtrado GROUP BY franja
 ), sucursales AS (
   SELECT sucursal nombre,count(DISTINCT producto_codigo) lineas,sum(stock) unidades,sum(valor_kardex_usd) valor_kardex_usd,
sum(dias_ultima_compra*valor_kardex_usd) FILTER (WHERE dias_ultima_compra IS NOT NULL AND valor_kardex_usd>0)
    / nullif(sum(valor_kardex_usd) FILTER (WHERE dias_ultima_compra IS NOT NULL AND valor_kardex_usd>0),0) dias_compra_promedio,
   coalesce(sum(valor_kardex_usd) FILTER (WHERE dias_ultima_compra IS NOT NULL AND valor_kardex_usd>0),0) valor_compra_con_fecha_usd,
   coalesce(sum(valor_kardex_usd) FILTER (WHERE valor_kardex_usd>0),0) valor_positivo_usd,
   count(*) FILTER (WHERE dias_ultima_compra IS NULL OR valor_kardex_usd IS NULL OR valor_kardex_usd<=0) ubicaciones_fuera_promedio
   FROM finales GROUP BY sucursal
 ), grupos AS (
   SELECT CASE p_agrupacion WHEN 'marca' THEN marca WHEN 'familia' THEN familia WHEN 'sucursal' THEN sucursal ELSE deposito END nombre,
    count(DISTINCT producto_codigo) lineas,sum(stock) unidades,sum(valor_kardex_usd) valor_kardex_usd,
    count(*) FILTER (WHERE stock<>0 AND valor_kardex_usd IS NULL) ubicaciones_sin_valor,
    null::numeric rotacion,
sum(dias_ultima_compra*valor_kardex_usd) FILTER (WHERE dias_ultima_compra IS NOT NULL AND valor_kardex_usd>0)
    / nullif(sum(valor_kardex_usd) FILTER (WHERE dias_ultima_compra IS NOT NULL AND valor_kardex_usd>0),0) dias_compra_promedio,
   coalesce(sum(valor_kardex_usd) FILTER (WHERE dias_ultima_compra IS NOT NULL AND valor_kardex_usd>0),0) valor_compra_con_fecha_usd,
   coalesce(sum(valor_kardex_usd) FILTER (WHERE valor_kardex_usd>0),0) valor_positivo_usd,
   count(*) FILTER (WHERE dias_ultima_compra IS NULL OR valor_kardex_usd IS NULL OR valor_kardex_usd<=0) ubicaciones_fuera_promedio
   FROM finales GROUP BY 1
 ), indicadores_color AS (
   SELECT sucursal, CASE p_agrupacion WHEN 'marca' THEN marca WHEN 'familia' THEN familia WHEN 'sucursal' THEN sucursal ELSE deposito END nombre,
    color,valor_kardex_usd FROM finales
 ), color_sucursal AS (
   SELECT DISTINCT ON (sucursal) sucursal,color color_historico FROM indicadores_color
   GROUP BY sucursal,color HAVING sum(valor_kardex_usd)>0
   ORDER BY sucursal,sum(valor_kardex_usd) DESC,color
 ), color_grupo AS (
   SELECT DISTINCT ON (nombre) nombre,color color_historico FROM indicadores_color
   GROUP BY nombre,color HAVING sum(valor_kardex_usd)>0
   ORDER BY nombre,sum(valor_kardex_usd) DESC,color
 ), ordenado AS (
   SELECT *,row_number() OVER (ORDER BY
    CASE WHEN coalesce(p_filtros->>'direccion','desc')='asc' THEN CASE WHEN coalesce(p_filtros->>'orden','usd') IN ('stock','usd','dias','ventas','compra','unidades_anio_actual','unidades_anio_anterior','unidades_hace_dos_anios') THEN
      CASE coalesce(p_filtros->>'orden','usd') WHEN 'stock' THEN stock_total WHEN 'usd' THEN valor_kardex_usd
      WHEN 'dias' THEN (datos->>'dias_ultima_venta')::numeric WHEN 'ventas' THEN (datos->>'unidades_365d')::numeric
      WHEN 'compra' THEN (datos->>'dias_ultima_compra')::numeric WHEN 'unidades_anio_actual' THEN (datos->>'unidades_anio_actual')::numeric WHEN 'unidades_anio_anterior' THEN (datos->>'unidades_anio_anterior')::numeric WHEN 'unidades_hace_dos_anios' THEN (datos->>'unidades_hace_dos_anios')::numeric END END END ASC NULLS LAST,
    CASE WHEN coalesce(p_filtros->>'direccion','desc')<>'asc' THEN CASE WHEN coalesce(p_filtros->>'orden','usd') IN ('stock','usd','dias','ventas','compra','unidades_anio_actual','unidades_anio_anterior','unidades_hace_dos_anios') THEN
      CASE coalesce(p_filtros->>'orden','usd') WHEN 'stock' THEN stock_total WHEN 'usd' THEN valor_kardex_usd
      WHEN 'dias' THEN (datos->>'dias_ultima_venta')::numeric WHEN 'ventas' THEN (datos->>'unidades_365d')::numeric
      WHEN 'compra' THEN (datos->>'dias_ultima_compra')::numeric WHEN 'unidades_anio_actual' THEN (datos->>'unidades_anio_actual')::numeric WHEN 'unidades_anio_anterior' THEN (datos->>'unidades_anio_anterior')::numeric WHEN 'unidades_hace_dos_anios' THEN (datos->>'unidades_hace_dos_anios')::numeric END END END DESC NULLS LAST,
    CASE WHEN coalesce(p_filtros->>'direccion','desc')='asc' THEN CASE p_filtros->>'orden' WHEN 'codigo' THEN producto_codigo WHEN 'descripcion' THEN datos->>'descripcion'
      WHEN 'marca' THEN datos->>'marca' WHEN 'color' THEN color END END ASC NULLS LAST,
    CASE WHEN coalesce(p_filtros->>'direccion','desc')<>'asc' THEN CASE p_filtros->>'orden' WHEN 'codigo' THEN producto_codigo WHEN 'descripcion' THEN datos->>'descripcion'
      WHEN 'marca' THEN datos->>'marca' WHEN 'color' THEN color END END DESC NULLS LAST,
    producto_codigo) posicion FROM filtrado
 ), pagina AS (
   SELECT * FROM ordenado ORDER BY posicion
   LIMIT greatest(1,least(coalesce(p_limite,50),200)) OFFSET greatest(0,coalesce(p_offset,0))
 )
 SELECT jsonb_build_object(
  'base_antiguedad','ULTIMA_COMPRA_V1','fecha_analisis',current_date,'lineas',count(*),'unidades_stock',coalesce(sum(stock_total),0),
  'valor_kardex_usd',sum(valor_kardex_usd),'lineas_valorizadas',count(valor_kardex_usd),
  'ubicaciones_sin_valor',coalesce(sum(ubicaciones_sin_valor),0),
  'saldos_coincidentes',count(*) FILTER (WHERE saldo_coincide),'kardex_cargado_en',max(kardex_cargado_en),
  'version',md5(coalesce(string_agg(datos::text,'|' ORDER BY producto_codigo),'')),
  'por_color',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY color) FROM colores c),'[]'),
  'franjas',coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY franja) FROM franjas f),'[]'),
  'sucursales',coalesce((SELECT jsonb_agg(to_jsonb(s)||jsonb_build_object('color_historico',c.color_historico) ORDER BY s.valor_kardex_usd DESC NULLS LAST,s.nombre) FROM sucursales s LEFT JOIN color_sucursal c ON c.sucursal=s.nombre),'[]'),
  'grupos',coalesce((SELECT jsonb_agg(to_jsonb(g)||jsonb_build_object('color_historico',c.color_historico) ORDER BY g.valor_kardex_usd DESC NULLS LAST,g.nombre) FROM grupos g LEFT JOIN color_grupo c ON c.nombre=g.nombre),'[]'),
  'facetas',jsonb_build_object(
    'familias',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]') FROM (SELECT DISTINCT familia v FROM ubicaciones) x),
    'depositos',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]') FROM (SELECT DISTINCT deposito v FROM ubicaciones) x),
    'sucursales',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]') FROM (SELECT DISTINCT sucursal v FROM ubicaciones) x)),
  'rotacion',jsonb_build_object('valor',null,'estado','SIN_BASE_COMPARABLE'),
  'rows',coalesce((SELECT jsonb_agg(datos ORDER BY posicion) FROM pagina),'[]')
 ) INTO result FROM filtrado;
 RETURN result;
END;
$function$;
REVOKE ALL ON FUNCTION public.repuestos_analisis_valorizado(jsonb,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repuestos_analisis_valorizado(jsonb,text,integer,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
