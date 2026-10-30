-- PREPARADO LOCALMENTE. NO INSTALADO. Requiere revisión/aprobación de esta función y ACL.
-- Sin escrituras de negocio, índices, cambios de RLS ni reemplazo de funciones existentes.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.campi_facturacion_adicional_v1(date,date)') IS NOT NULL THEN
  RAISE EXCEPTION 'La función ya existe: revisar definición antes de instalar';
 END IF;
END $$;
CREATE FUNCTION public.campi_facturacion_adicional_v1(p_desde date,p_hasta date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET statement_timeout='20s'
AS $$
DECLARE resultado jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(),'servicios.dashboard') THEN
  RAISE EXCEPTION 'Sin acceso al Dashboard de facturación' USING ERRCODE='42501';
 END IF;
 IF p_desde IS NULL OR p_hasta IS NULL OR p_desde>p_hasta OR p_hasta-p_desde>366 THEN
  RAISE EXCEPTION 'Rango inválido: máximo 367 días' USING ERRCODE='22023';
 END IF;
 WITH base AS MATERIALIZED (
  SELECT m.metodologia||':'||m.linea_id AS id,m.fecha,m.total_venta AS importe,
   m.es_nota_credito OR m.total_venta<0 AS nc,m.area_calculada AS area,m.descripcion,
   m.concepto AS grupo
  FROM public.ventas_area_movimientos_base(p_desde,p_hasta,NULL,NULL) m
  WHERE coalesce(m.area_calculada,'') NOT IN ('repuestos','servicios','maquinas')
   AND NOT (m.metodologia='historico' AND EXISTS (
    SELECT 1 FROM public.facturacion r WHERE r.id::text=m.linea_id AND r.tipo::text='Repuesto'))
  UNION ALL
  SELECT 'historico:'||h.linea_id,h.fecha,h.importe,h.es_nota_credito,'otros',h.descripcion,h.concepto
  FROM public.v_ventas_repuestos_historico_completo h
  WHERE coalesce(h.concepto,'')<>'Repuestos'
   AND h.fecha_factura>=p_desde::timestamptz
   AND h.fecha_factura<(least(p_hasta,date '2026-06-30')+1)::timestamptz
 ), clasificados AS MATERIALIZED (
  SELECT *,CASE WHEN area='revision' THEN 'revision'
   WHEN area='otros' AND public.ventas_es_otro_comercial(descripcion,grupo) THEN 'otros'
   ELSE 'sin_clasificar' END AS categoria
  FROM base
 ), categorias AS (SELECT unnest(ARRAY['otros','sin_clasificar','revision']) categoria),
 meses AS (SELECT generate_series(date_trunc('month',p_desde::timestamp),date_trunc('month',p_hasta::timestamp),interval '1 month')::date periodo),
 agregado AS (
  SELECT categoria,date_trunc('month',fecha)::date periodo,count(*) lineas,
   coalesce(sum(importe) FILTER(WHERE NOT nc),0) ventas,
   coalesce(sum(importe) FILTER(WHERE nc),0) notas_credito,coalesce(sum(importe),0) facturado
  FROM clasificados GROUP BY categoria,date_trunc('month',fecha)
 ), totales AS (
  SELECT c.categoria,coalesce(sum(a.lineas),0) lineas,coalesce(sum(a.ventas),0) ventas,
   coalesce(sum(a.notas_credito),0) notas_credito,coalesce(sum(a.facturado),0) facturado
  FROM categorias c LEFT JOIN agregado a USING(categoria) GROUP BY c.categoria
 ), controles AS (
  SELECT count(*) filas,count(DISTINCT id) identidades,
   count(*) FILTER(WHERE id IS NULL OR fecha IS NULL OR importe IS NULL OR fecha<p_desde OR fecha>p_hasta) invalidas,
   count(*) FILTER(WHERE (nc AND importe>0) OR (NOT nc AND importe<0)) signos_invalidos,
   coalesce(sum(importe),0) neto FROM clasificados
 )
 SELECT jsonb_build_object('version',1,'desde',p_desde,'hasta',p_hasta,
  'coverage','observed-canonical','controls',to_jsonb(k),
  'categories',(SELECT jsonb_agg(jsonb_build_object('id',t.categoria,'resumen',to_jsonb(t)-'categoria',
   'periodos',(SELECT jsonb_agg(jsonb_build_object('periodo',m.periodo,'lineas',coalesce(a.lineas,0),
    'ventas',coalesce(a.ventas,0),'notas_credito',coalesce(a.notas_credito,0),'facturado',coalesce(a.facturado,0)) ORDER BY m.periodo)
    FROM meses m LEFT JOIN agregado a ON a.categoria=t.categoria AND a.periodo=m.periodo)) ORDER BY t.categoria) FROM totales t))
 INTO resultado FROM controles k;
 RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION public.campi_facturacion_adicional_v1(date,date) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.campi_facturacion_adicional_v1(date,date) TO authenticated;
COMMIT;
