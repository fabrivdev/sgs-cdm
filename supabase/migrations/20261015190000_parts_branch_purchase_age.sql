-- Extend the installed report without replacing its permissions or purchase sources.
BEGIN;
DO $migration$
DECLARE definition text;
DECLARE old_branch text := 'SELECT sucursal nombre,count(DISTINCT producto_codigo) lineas,sum(stock) unidades,sum(valor_kardex_usd) valor_kardex_usd
   FROM finales GROUP BY sucursal';
BEGIN
 definition := pg_get_functiondef('public.repuestos_analisis_valorizado(jsonb,text,integer,integer)'::regprocedure);
 IF position('dias_compra_promedio' IN definition)>0 THEN RETURN; END IF;
 IF position('familia,h.color,h.franja' IN definition)=0 OR position(old_branch IN definition)=0 THEN
  RAISE EXCEPTION 'El reporte cambió: revisar las anclas antes de ampliar la antigüedad por sucursal';
 END IF;
 definition := replace(definition,'familia,h.color,h.franja','familia,h.color,h.franja,h.dias_ultima_compra');
 definition := replace(definition,old_branch,$branch$
 SELECT sucursal nombre,count(DISTINCT producto_codigo) lineas,sum(stock) unidades,sum(valor_kardex_usd) valor_kardex_usd,
   sum(dias_ultima_compra*valor_kardex_usd) FILTER (WHERE dias_ultima_compra IS NOT NULL AND valor_kardex_usd>0)
    / nullif(sum(valor_kardex_usd) FILTER (WHERE dias_ultima_compra IS NOT NULL AND valor_kardex_usd>0),0) dias_compra_promedio,
   coalesce(sum(valor_kardex_usd) FILTER (WHERE dias_ultima_compra IS NOT NULL AND valor_kardex_usd>0),0) valor_compra_con_fecha_usd,
   coalesce(sum(valor_kardex_usd) FILTER (WHERE valor_kardex_usd>0),0) valor_positivo_usd,
   count(*) FILTER (WHERE dias_ultima_compra IS NULL OR valor_kardex_usd IS NULL OR valor_kardex_usd<=0) ubicaciones_fuera_promedio
 FROM finales GROUP BY sucursal
 $branch$);
 EXECUTE definition;
END;
$migration$;
NOTIFY pgrst,'reload schema';
COMMIT;
