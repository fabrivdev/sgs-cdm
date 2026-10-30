-- NUEVA función de cinco argumentos. No reemplaza el resumen ni cambia permisos de su fuente.
-- CREATE (sin OR REPLACE) falla si la firma ya existe. Frontend permanece desactivado.
BEGIN;
DO $guard$ BEGIN IF to_regprocedure('public.campi_clientes_cohortes_v1(date,date,date,date)') IS NOT NULL THEN RAISE EXCEPTION 'Existe candidato anterior: detener y revisar'; END IF; END $guard$;
CREATE FUNCTION public.campi_clientes_cohortes_v1(p_desde date,p_hasta date,p_prev_desde date,p_prev_hasta date,p_sucursal text DEFAULT 'TODAS')
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public,pg_temp SET plan_cache_mode TO force_custom_plan AS $function$
 WITH contexto_autorizacion AS MATERIALIZED (
 SELECT
 auth.uid() AS user_id,
 public.has_role(auth.uid(), 'superadmin'::public.app_role) AS es_superadmin,
 public.has_role(auth.uid(), 'admin'::public.app_role) AS es_admin,
 public.has_role(auth.uid(), 'gerencia'::public.app_role) AS es_gerencia
 WHERE auth.uid() IS NOT NULL
 ),
 autorizado AS (
 SELECT 1
 FROM contexto_autorizacion a
 WHERE (a.es_superadmin OR a.es_admin OR a.es_gerencia)
 AND (a.es_superadmin OR public.has_module_access(a.user_id, 'parque'))
 AND public.has_section_access(a.user_id, 'parque.maquinas')
 ),
 parametros AS (
 SELECT
 least(
 p_desde,
 p_prev_desde,
 (p_hasta - interval '36 months')::date
 ) AS fuente_desde,
 greatest(p_hasta, p_prev_hasta) AS fuente_hasta,
 nullif(upper(btrim(coalesce(p_sucursal, 'TODAS'))), '') AS sucursal_compra
 ),
 movimientos AS MATERIALIZED (
 SELECT m.*
 FROM parametros p
 CROSS JOIN LATERAL public.gerencial_clientes_movimientos_posventa_v1(
 p.fuente_desde,
 p.fuente_hasta
 ) m
 ),
 movimientos_sucursal_compra AS MATERIALIZED (
 SELECT m.*
 FROM movimientos m
 CROSS JOIN parametros p
 WHERE m.contrato = 'COHORTES'
 AND (
 p.sucursal_compra IN ('TODAS', 'ALL')
 OR upper(btrim(coalesce(m.sucursal, ''))) = p.sucursal_compra
 )
 ),
 ventas_cliente AS (
 SELECT
 cliente_id,
 coalesce(sum(total_venta) FILTER (
 WHERE fecha BETWEEN p_desde AND p_hasta
 ), 0) AS neto_actual,
 coalesce(sum(total_venta) FILTER (
 WHERE fecha BETWEEN p_prev_desde AND p_prev_hasta
 ), 0) AS neto_base
 FROM movimientos_sucursal_compra
 GROUP BY cliente_id
 ),
 propietarios AS MATERIALIZED (
 SELECT DISTINCT pm.cliente_id
 FROM public.parque_maquinas pm
 CROSS JOIN parametros p
 WHERE (pm.activo IS TRUE OR pm.activo IS NULL)
 AND pm.cliente_id IS NOT NULL
 AND (
 p.sucursal_compra IN ('TODAS', 'ALL')
 OR pm.sucursal::text = p_sucursal
 )
 ),
 ventas_actuales_cobertura AS (
 -- La sucursal no se aplica a la factura: define propietarios del parque.
 SELECT m.cliente_id
 FROM movimientos m
 WHERE m.contrato = 'COBERTURA'
 AND m.fecha BETWEEN p_desde AND p_hasta
 GROUP BY m.cliente_id
 HAVING sum(m.total_venta) > 0
 ),

 resultado AS (
 SELECT jsonb_build_object('version',2,'desde',p_desde,'hasta',p_hasta,'prev_desde',p_prev_desde,'prev_hasta',p_prev_hasta,
 'cohorte_base',coalesce((SELECT jsonb_agg(cliente_id ORDER BY cliente_id) FROM ventas_cliente WHERE neto_base>0),'[]'::jsonb),
 'cohorte_actual',coalesce((SELECT jsonb_agg(cliente_id ORDER BY cliente_id) FROM ventas_cliente WHERE neto_actual>0),'[]'::jsonb),
 'retenidos',coalesce((SELECT jsonb_agg(cliente_id ORDER BY cliente_id) FROM ventas_cliente WHERE neto_base>0 AND neto_actual>0),'[]'::jsonb),
 'propietarios',coalesce((SELECT jsonb_agg(cliente_id ORDER BY cliente_id) FROM propietarios),'[]'::jsonb),
 'propietarios_con_compra',coalesce((SELECT jsonb_agg(p.cliente_id ORDER BY p.cliente_id) FROM propietarios p JOIN ventas_actuales_cobertura v USING(cliente_id)),'[]'::jsonb),
 'desglose_lineas',NULL,'desglose_estado','pendiente_definicion_no_aditiva') AS datos
 ) SELECT datos FROM autorizado CROSS JOIN resultado;
$function$;

REVOKE ALL ON FUNCTION public.campi_clientes_cohortes_v1(date,date,date,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.campi_clientes_cohortes_v1(date,date,date,date,text) TO authenticated,service_role;
COMMIT;
