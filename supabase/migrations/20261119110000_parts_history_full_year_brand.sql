BEGIN;
CREATE OR REPLACE FUNCTION public.repuestos_historico_v2(
 p_corte date,p_vista text DEFAULT 'clientes',p_sucursal text DEFAULT NULL,p_marca text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp SET statement_timeout='60s' AS $$
DECLARE y integer := extract(year FROM p_corte); result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(),'repuestos.historico') THEN
  RAISE EXCEPTION 'Sin acceso a Histórico de Repuestos' USING ERRCODE='42501';
 END IF;
 IF p_corte IS NULL OR p_corte < date '2002-01-01'
  OR p_corte > make_date(extract(year FROM now() AT TIME ZONE 'America/Asuncion')::integer,12,31)
  OR p_vista IS NULL OR p_vista NOT IN ('clientes','repuestos') THEN
  RAISE EXCEPTION 'Seleccioná una fecha de corte y una vista válidas' USING ERRCODE='22023';
 END IF;
 WITH movimientos AS MATERIALIZED (
  SELECT m.*,extract(year FROM fecha)::integer AS anio
  FROM public.ventas_repuestos_movimientos_v2(make_date(y-2,1,1),p_corte,p_sucursal,NULL) m
  WHERE (nullif(btrim(p_marca),'') IS NULL OR m.marca=upper(btrim(p_marca)))
   AND fecha <= (p_corte-make_interval(years => y-extract(year FROM fecha)::integer))::date
 ), cobertura AS (
  SELECT array_agg(DISTINCT anio) AS anios FROM movimientos
 ), identificados AS (
  SELECT *,CASE WHEN p_vista='clientes' THEN upper(btrim(cliente))
   ELSE coalesce(nullif(btrim(codigo),''),'sin_codigo:'||id) END AS clave FROM movimientos
 ), agregado AS (
  SELECT clave,CASE WHEN p_vista='clientes' THEN min(cliente) ELSE min(codigo) END AS nombre,
   CASE WHEN p_vista='repuestos' THEN min(descripcion) END AS descripcion,
   sum(importe) FILTER(WHERE anio=y) AS actual,
   sum(importe) FILTER(WHERE anio=y-1) AS anterior,
   sum(importe) FILTER(WHERE anio=y-2) AS antiguo
  FROM identificados GROUP BY clave
 ), filas AS (
  SELECT a.clave,a.nombre,a.descripcion,
   CASE WHEN y=ANY(c.anios) THEN coalesce(a.actual,0) END AS actual,
   CASE WHEN y-1=ANY(c.anios) THEN coalesce(a.anterior,0) END AS anterior,
   CASE WHEN y-2=ANY(c.anios) THEN coalesce(a.antiguo,0) END AS antiguo
  FROM agregado a CROSS JOIN cobertura c
 ) SELECT jsonb_build_object('anio',y,
  'anios_con_datos',coalesce((SELECT anios FROM cobertura),'{}'::integer[]),
  'filas',coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.actual DESC NULLS LAST,f.clave),'[]'::jsonb))
 INTO result FROM filas f;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.repuestos_historico_v2(date,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.repuestos_historico_v2(date,text,text,text) TO authenticated;

-- Preserve clients using the previous three-argument RPC.
CREATE OR REPLACE FUNCTION public.repuestos_historico_v1(p_corte date,p_vista text DEFAULT 'clientes',p_sucursal text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.repuestos_historico_v2(p_corte,p_vista,p_sucursal,NULL)
$$;
REVOKE ALL ON FUNCTION public.repuestos_historico_v1(date,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.repuestos_historico_v1(date,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
