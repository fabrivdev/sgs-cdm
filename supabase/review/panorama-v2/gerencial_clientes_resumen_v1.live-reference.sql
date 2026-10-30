CREATE OR REPLACE FUNCTION public.gerencial_clientes_resumen_v1(p_desde date, p_hasta date, p_prev_desde date, p_prev_hasta date, p_sucursal text DEFAULT 'TODAS'::text)
 RETURNS TABLE(compradores_actual bigint, compradores_base bigint, compradores_retenidos bigint, compradores_base_sin_recompra bigint, clientes_alerta bigint, clientes_evaluables bigint, clientes_historial_insuficiente bigint, clientes_revision_ritmo bigint, propietarios_elegibles bigint, propietarios_con_compra_actual bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
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
  retencion AS (
    SELECT
      count(*) FILTER (WHERE neto_actual > 0)::bigint AS compradores_actual,
      count(*) FILTER (WHERE neto_base > 0)::bigint AS compradores_base,
      count(*) FILTER (WHERE neto_base > 0 AND neto_actual > 0)::bigint AS compradores_retenidos,
      count(*) FILTER (WHERE neto_base > 0 AND neto_actual <= 0)::bigint AS compradores_base_sin_recompra
    FROM ventas_cliente
  ),
  compras_diarias AS (
    SELECT cliente_id, fecha
    FROM movimientos_sucursal_compra
    WHERE fecha BETWEEN (p_hasta - interval '36 months')::date AND p_hasta
    GROUP BY cliente_id, fecha
    HAVING sum(total_venta) > 0
  ),
  secuencia AS (
    SELECT
      cliente_id,
      fecha,
      fecha - lag(fecha) OVER (PARTITION BY cliente_id ORDER BY fecha) AS intervalo_dias
    FROM compras_diarias
  ),
  estadisticas AS (
    SELECT
      cliente_id,
      count(*)::integer AS fechas_compra,
      max(fecha) AS ultima_compra,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY intervalo_dias)
        FILTER (WHERE intervalo_dias IS NOT NULL) AS intervalo_mediano,
      count(DISTINCT extract(year FROM fecha)) AS anios_compra,
      count(DISTINCT extract(month FROM fecha)) AS meses_compra
    FROM secuencia
    GROUP BY cliente_id
  ),
  evaluacion_inactividad AS (
    SELECT
      fechas_compra >= 3 AS evaluable,
      fechas_compra >= 3
        AND (p_hasta - ultima_compra)::numeric > 1.5 * intervalo_mediano AS en_alerta,
      fechas_compra >= 3
        AND anios_compra >= 2
        AND meses_compra = 1 AS revisar_ritmo
    FROM estadisticas
  ),
  inactividad AS (
    SELECT
      count(*) FILTER (WHERE en_alerta)::bigint AS clientes_alerta,
      count(*) FILTER (WHERE evaluable)::bigint AS clientes_evaluables,
      count(*) FILTER (WHERE NOT evaluable)::bigint AS clientes_historial_insuficiente,
      count(*) FILTER (WHERE revisar_ritmo)::bigint AS clientes_revision_ritmo
    FROM evaluacion_inactividad
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
  cobertura AS (
    SELECT
      count(*)::bigint AS propietarios_elegibles,
      count(v.cliente_id)::bigint AS propietarios_con_compra_actual
    FROM propietarios p
    LEFT JOIN ventas_actuales_cobertura v USING (cliente_id)
  )
  SELECT
    r.compradores_actual,
    r.compradores_base,
    r.compradores_retenidos,
    r.compradores_base_sin_recompra,
    i.clientes_alerta,
    i.clientes_evaluables,
    i.clientes_historial_insuficiente,
    i.clientes_revision_ritmo,
    c.propietarios_elegibles,
    c.propietarios_con_compra_actual
  FROM autorizado
  CROSS JOIN retencion r
  CROSS JOIN inactividad i
  CROSS JOIN cobertura c;
$function$
