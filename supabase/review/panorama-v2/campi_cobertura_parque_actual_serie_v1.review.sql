-- Aplicado solo en SIG CDM el 22/10/2026 tras cotejar fuentes, firma y permisos.
-- El guard impide volver a ejecutar este CREATE si la firma ya existe.
-- Misma cohorte actual y mismo contrato COBERTURA de gerencial_clientes_resumen_v1.
-- No reconstruye propietarios históricos: fija el parque elegible actual en todas las barras.
BEGIN;
DO $guard$ BEGIN
  IF to_regprocedure('public.campi_cobertura_parque_actual_serie_v1(date,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'La función de serie ya existe: detener y cotejar definición';
  END IF;
END $guard$;

CREATE FUNCTION public.campi_cobertura_parque_actual_serie_v1(p_hasta date, p_modo text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public, pg_temp
SET plan_cache_mode TO force_custom_plan
AS $function$
WITH contexto_autorizacion AS MATERIALIZED (
  SELECT auth.uid() AS user_id,
    public.has_role(auth.uid(), 'superadmin'::public.app_role) AS es_superadmin,
    public.has_role(auth.uid(), 'admin'::public.app_role) AS es_admin,
    public.has_role(auth.uid(), 'gerencia'::public.app_role) AS es_gerencia
  WHERE auth.uid() IS NOT NULL
), autorizado AS (
  SELECT 1 FROM contexto_autorizacion a
  WHERE (a.es_superadmin OR a.es_admin OR a.es_gerencia)
    AND (a.es_superadmin OR public.has_module_access(a.user_id, 'parque'))
    AND public.has_section_access(a.user_id, 'parque.maquinas')
), parametros AS (
  SELECT date_trunc('month', p_hasta)::date AS primer_dia,
    CASE WHEN p_modo = 'ytd' THEN date_trunc('year', p_hasta)::date
         ELSE (date_trunc('month', p_hasta) - interval '5 months')::date END AS fuente_desde
  WHERE p_hasta IS NOT NULL AND p_modo IN ('month', 'ytd')
), meses AS (
  SELECT g.mes::date AS mes
  FROM parametros p
  CROSS JOIN LATERAL generate_series(p.fuente_desde, p.primer_dia, interval '1 month') AS g(mes)
), ventanas AS (
  SELECT CASE WHEN p_modo = 'ytd' THEN date_trunc('year', m.mes)::date ELSE m.mes END AS desde,
    least((m.mes + interval '1 month' - interval '1 day')::date, p_hasta) AS hasta,
    m.mes
  FROM meses m
), propietarios AS MATERIALIZED (
  SELECT DISTINCT pm.cliente_id
  FROM public.parque_maquinas pm
  WHERE (pm.activo IS TRUE OR pm.activo IS NULL) AND pm.cliente_id IS NOT NULL
), movimientos AS MATERIALIZED (
  SELECT m.cliente_id, m.fecha, m.total_venta
  FROM parametros p
  CROSS JOIN LATERAL public.gerencial_clientes_movimientos_posventa_v1(p.fuente_desde, p_hasta) m
  WHERE m.contrato = 'COBERTURA'
), netos AS (
  SELECT v.mes, m.cliente_id, sum(m.total_venta) AS neto
  FROM ventanas v
  JOIN movimientos m ON m.fecha BETWEEN v.desde AND v.hasta
  JOIN propietarios p ON p.cliente_id = m.cliente_id
  GROUP BY v.mes, m.cliente_id
), conteos AS (
  SELECT v.mes, v.desde, v.hasta,
    count(n.cliente_id) FILTER (WHERE n.neto > 0)::bigint AS numerator,
    (SELECT count(*)::bigint FROM propietarios) AS denominator
  FROM ventanas v LEFT JOIN netos n ON n.mes = v.mes
  GROUP BY v.mes, v.desde, v.hasta
)
SELECT jsonb_build_object('version', 1, 'cohort', 'current_park', 'mode', p_modo,
  'as_of', p_hasta, 'rows', (SELECT coalesce(jsonb_agg(jsonb_build_object(
    'from', c.desde, 'to', c.hasta, 'numerator', c.numerator,
    'denominator', c.denominator) ORDER BY c.mes), '[]'::jsonb) FROM conteos c))
FROM autorizado CROSS JOIN parametros;
$function$;

REVOKE ALL ON FUNCTION public.campi_cobertura_parque_actual_serie_v1(date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.campi_cobertura_parque_actual_serie_v1(date,text) TO authenticated, service_role;
COMMIT;
