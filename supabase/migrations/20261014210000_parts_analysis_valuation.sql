-- Only reporting objects. No imported rows, invoices or stock are changed.
BEGIN;
CREATE OR REPLACE FUNCTION public.repuestos_analisis_sucursal(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
 SELECT CASE upper(btrim(p))
   WHEN '01' THEN 'Santa Rita' WHEN '02' THEN 'Katuete'
   WHEN '03' THEN 'Campo 9' WHEN '04' THEN 'Misiones'
   WHEN '05' THEN 'Loma Plata' WHEN '06' THEN 'Santa Rosa'
   ELSE coalesce(nullif(btrim(p),''),'Sin sucursal') END
$$;
CREATE OR REPLACE FUNCTION public.repuestos_analisis_deposito(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
 SELECT coalesce(nullif(upper(btrim(split_part(p,' - ',1))),''),'Sin depósito')
$$;

-- Aggregate each source BEFORE joining. Multiple chassis cannot multiply stock.
CREATE OR REPLACE VIEW public.v_repuestos_analisis_ubicaciones
WITH (security_invoker = true) AS
WITH s AS (
 SELECT producto_codigo, public.repuestos_analisis_sucursal(sucursal::text) sucursal,
   public.repuestos_analisis_deposito(deposito) deposito, sum(saldo_actual) stock
 FROM public.repuestos_stock GROUP BY 1,2,3
), k AS (
 SELECT producto_codigo, public.repuestos_analisis_sucursal(sucursal) sucursal,
   public.repuestos_analisis_deposito(deposito) deposito,
   sum(saldo) saldo_kardex, sum(valor_2) valor_kardex_usd,
   max(actualizado_en) kardex_cargado_en,
   CASE WHEN count(DISTINCT archivo_origen)=1 THEN min(archivo_origen) ELSE 'Varios archivos' END kardex_archivo
 FROM public.totvs_kardex_sintetico GROUP BY 1,2,3
)
SELECT coalesce(s.producto_codigo,k.producto_codigo) producto_codigo,
 coalesce(s.sucursal,k.sucursal) sucursal, coalesce(s.deposito,k.deposito) deposito,
 coalesce(s.stock,0) stock, k.saldo_kardex, k.valor_kardex_usd,
 k.kardex_cargado_en,k.kardex_archivo
FROM s FULL JOIN k USING (producto_codigo,sucursal,deposito);
GRANT SELECT ON public.v_repuestos_analisis_ubicaciones TO authenticated;

CREATE OR REPLACE FUNCTION public.repuestos_analisis_valorizado(
 p_filtros jsonb DEFAULT '{}', p_agrupacion text DEFAULT 'marca',
 p_limite integer DEFAULT 50, p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp SET statement_timeout = '90s' AS $function$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_module_access(auth.uid(),'repuestos') THEN
   RAISE EXCEPTION 'Sin acceso al modulo de repuestos' USING ERRCODE='42501';
 END IF;
 IF p_agrupacion NOT IN ('marca','familia','sucursal','deposito') THEN
   RAISE EXCEPTION 'Agrupación inválida' USING ERRCODE='22023';
 END IF;
 WITH historico AS MATERIALIZED (
   SELECT h.*, CASE WHEN color IN ('VERDE_OSCURO','VERDE_CLARO') THEN 'RECIENTE'
    WHEN color IN ('ROJO','SIN_DATOS') THEN 'SIN_VENTA' ELSE 'ANTIGUA' END franja
   FROM public.v_repuestos_semaforo_historico h
 ), ubicaciones AS MATERIALIZED (
   SELECT u.*,h.marca::text marca,coalesce(nullif(h.familia,''),'Sin familia') familia,h.color,h.franja
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
   SELECT sucursal nombre,count(DISTINCT producto_codigo) lineas,sum(stock) unidades,sum(valor_kardex_usd) valor_kardex_usd
   FROM finales GROUP BY sucursal
 ), grupos AS (
   SELECT CASE p_agrupacion WHEN 'marca' THEN marca WHEN 'familia' THEN familia WHEN 'sucursal' THEN sucursal ELSE deposito END nombre,
    count(DISTINCT producto_codigo) lineas,sum(stock) unidades,sum(valor_kardex_usd) valor_kardex_usd,
    count(*) FILTER (WHERE stock<>0 AND valor_kardex_usd IS NULL) ubicaciones_sin_valor,
    null::numeric rotacion
   FROM finales GROUP BY 1
 ), pagina AS (
   SELECT * FROM filtrado ORDER BY valor_kardex_usd DESC NULLS LAST,producto_codigo
   LIMIT greatest(1,least(coalesce(p_limite,50),200)) OFFSET greatest(0,coalesce(p_offset,0))
 )
 SELECT jsonb_build_object(
  'fecha_analisis',current_date,'lineas',count(*),'unidades_stock',coalesce(sum(stock_total),0),
  'valor_kardex_usd',sum(valor_kardex_usd),'lineas_valorizadas',count(valor_kardex_usd),
  'ubicaciones_sin_valor',coalesce(sum(ubicaciones_sin_valor),0),
  'saldos_coincidentes',count(*) FILTER (WHERE saldo_coincide),'kardex_cargado_en',max(kardex_cargado_en),
  'version',md5(coalesce(string_agg(datos::text,'|' ORDER BY producto_codigo),'')),
  'por_color',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY color) FROM colores c),'[]'),
  'franjas',coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY franja) FROM franjas f),'[]'),
  'sucursales',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY valor_kardex_usd DESC NULLS LAST,nombre) FROM sucursales s),'[]'),
  'grupos',coalesce((SELECT jsonb_agg(to_jsonb(g) ORDER BY valor_kardex_usd DESC NULLS LAST,nombre) FROM grupos g),'[]'),
  'facetas',jsonb_build_object(
    'familias',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]') FROM (SELECT DISTINCT familia v FROM ubicaciones) x),
    'depositos',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]') FROM (SELECT DISTINCT deposito v FROM ubicaciones) x),
    'sucursales',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]') FROM (SELECT DISTINCT sucursal v FROM ubicaciones) x)),
  'rotacion',jsonb_build_object('valor',null,'estado','SIN_BASE_COMPARABLE'),
  'rows',coalesce((SELECT jsonb_agg(datos ORDER BY valor_kardex_usd DESC NULLS LAST,producto_codigo) FROM pagina),'[]')
 ) INTO result FROM filtrado;
 RETURN result;
END;
$function$;
REVOKE ALL ON FUNCTION public.repuestos_analisis_valorizado(jsonb,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repuestos_analisis_valorizado(jsonb,text,integer,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
