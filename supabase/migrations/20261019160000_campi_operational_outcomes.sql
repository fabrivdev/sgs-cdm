-- Read-only, section-scoped summaries for the two operational Panorama outcomes.
CREATE OR REPLACE FUNCTION public.campi_pedidos_abastecimiento_v1()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp SET statement_timeout = '45s' AS $function$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_module_access(auth.uid(), 'parque')
     OR NOT public.has_section_access(auth.uid(), 'parque.operaciones') THEN
    RAISE EXCEPTION 'Sin acceso a operaciones de máquinas' USING ERRCODE = '42501';
  END IF;

  WITH active AS MATERIALIZED (
    SELECT p.id, p.operacion_id, p.np_numero, p.unidad_id, p.cantidad,
           upper(btrim(coalesce(p.estado_operacion, ''))) AS estado,
           coalesce(u.estado, '') AS estado_unidad
    FROM public.maquinaria_pedidos_lineas_estado_actual p
    LEFT JOIN public.maquinaria_unidades_operacion u ON u.id = p.unidad_id
    WHERE upper(btrim(coalesce(p.estado_operacion, ''))) NOT IN ('CERRADA', 'FACTURADA', 'CANCELADA')
      AND upper(btrim(coalesce(p.estado_fuente, ''))) NOT LIKE '%CANCEL%'
      AND upper(btrim(coalesce(u.estado, ''))) <> 'CANCELADA'
  ), linked AS MATERIALIZED (
    SELECT a.*,
           (SELECT count(*) FROM public.maquinaria_importacion_unidades i WHERE i.unidad_id = a.unidad_id AND i.activa) AS importaciones,
           (SELECT count(*) FROM public.maquinaria_importacion_unidades i WHERE i.unidad_id = a.unidad_id AND i.activa AND i.ata IS NOT NULL) AS importaciones_arribadas,
           (SELECT count(*) FROM public.parque_stock_maquinas s WHERE s.unidad_operacion_id = a.unidad_id AND s.saldo_actual > 0) AS stock
    FROM active a
  ), classified AS MATERIALIZED (
    SELECT *, CASE
      WHEN unidad_id IS NULL THEN 'SIN_UNIDAD'
      WHEN importaciones > 1 OR stock > 1 THEN 'CONFLICTO'
      WHEN stock = 1 THEN 'STOCK'
      WHEN importaciones = 1 AND importaciones_arribadas = 1 THEN 'IMPORTACION_ARRIBADA'
      WHEN importaciones = 1 THEN 'IMPORTACION_TRANSITO'
      ELSE 'SIN_VINCULO'
    END AS clase
    FROM linked
  ), totals AS (
    SELECT count(*) AS filas, count(DISTINCT id) AS identidades,
           count(DISTINCT unidad_id) FILTER (WHERE unidad_id IS NOT NULL) AS unidades_identificadas,
           count(*) FILTER (WHERE estado NOT IN ('ABASTECIMIENTO','EN_IMPORTACION','DISPONIBLE')) AS estados_desconocidos,
           count(*) FILTER (WHERE cantidad IS NULL OR cantidad <= 0) AS cantidades_invalidas,
           coalesce(sum(cantidad),0) AS unidades,
           coalesce(sum(cantidad) FILTER (WHERE clase = 'SIN_UNIDAD'),0) AS sin_unidad,
           coalesce(sum(cantidad) FILTER (WHERE clase = 'CONFLICTO'),0) AS conflicto,
           coalesce(sum(cantidad) FILTER (WHERE clase = 'SIN_VINCULO'),0) AS sin_vinculo,
           coalesce(sum(cantidad) FILTER (WHERE clase = 'STOCK'),0) AS stock,
           coalesce(sum(cantidad) FILTER (WHERE clase = 'IMPORTACION_ARRIBADA'),0) AS importacion_arribada,
           coalesce(sum(cantidad) FILTER (WHERE clase = 'IMPORTACION_TRANSITO'),0) AS importacion_transito,
           count(DISTINCT operacion_id) AS pedidos
    FROM classified
  ), pending AS (
    SELECT operacion_id, max(np_numero) AS np_numero, sum(cantidad) AS unidades,
           sum(cantidad) FILTER (WHERE clase = 'SIN_VINCULO') AS sin_vinculo,
           sum(cantidad) FILTER (WHERE clase IN ('SIN_UNIDAD','CONFLICTO')) AS sin_identidad_o_conflicto
    FROM classified WHERE clase IN ('SIN_VINCULO','SIN_UNIDAD','CONFLICTO')
    GROUP BY operacion_id
  )
  SELECT jsonb_build_object(
    'fecha_analisis', (now() AT TIME ZONE 'America/Asuncion')::date, 'filas', t.filas, 'identidades', t.identidades,
    'unidades_identificadas', t.unidades_identificadas,
    'estados_desconocidos', t.estados_desconocidos, 'cantidades_invalidas', t.cantidades_invalidas,
    'unidades', t.unidades, 'sin_unidad', t.sin_unidad, 'conflicto', t.conflicto,
    'sin_vinculo', t.sin_vinculo, 'stock', t.stock,
    'importacion_arribada', t.importacion_arribada, 'importacion_transito', t.importacion_transito,
    'pedidos', t.pedidos,
    'pendientes', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'operacion_id', operacion_id, 'np_numero', np_numero, 'unidades', unidades,
      'sin_vinculo', coalesce(sin_vinculo,0), 'sin_identidad_o_conflicto', coalesce(sin_identidad_o_conflicto,0))
      ORDER BY unidades DESC, operacion_id), '[]'::jsonb) FROM pending)
  ) INTO result FROM totals t;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.campi_resolucion_os_v1()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp SET statement_timeout = '30s' AS $function$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_module_access(auth.uid(), 'servicios')
     OR NOT public.has_section_access(auth.uid(), 'servicios.ordenes') THEN
    RAISE EXCEPTION 'Sin acceso a órdenes de servicio' USING ERRCODE = '42501';
  END IF;

  WITH periods AS (
    SELECT (date_trunc('month', (now() AT TIME ZONE 'America/Asuncion')::date) - interval '1 month')::date AS ultimo_mes,
           (date_trunc('month', (now() AT TIME ZONE 'America/Asuncion')::date) - interval '2 months')::date AS mes_anterior
  ), closed AS MATERIALIZED (
    SELECT o.os_numero, o.fecha_abierta_os::date AS apertura, o.fecha_cierre_os::date AS cierre,
           (o.fecha_cierre_os::date - o.fecha_abierta_os::date) AS dias
    FROM public.ordenes_servicio_importadas o
    WHERE o.situacion_os ILIKE '%cerrad%'
  ), period_stats AS (
    SELECT p.ultimo_mes, p.mes_anterior,
      count(*) FILTER (WHERE c.cierre >= p.ultimo_mes AND c.cierre < p.ultimo_mes + interval '1 month') AS cierres_ultimo_mes,
      count(*) FILTER (WHERE c.cierre >= p.mes_anterior AND c.cierre < p.ultimo_mes) AS cierres_mes_anterior,
      count(*) FILTER (WHERE c.cierre >= p.ultimo_mes AND c.cierre < p.ultimo_mes + interval '1 month' AND (c.apertura IS NULL OR c.dias < 0)) AS invalidas_ultimo_mes,
      count(*) FILTER (WHERE c.cierre >= p.mes_anterior AND c.cierre < p.ultimo_mes AND (c.apertura IS NULL OR c.dias < 0)) AS invalidas_mes_anterior,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY c.dias) FILTER (WHERE c.cierre >= p.ultimo_mes AND c.cierre < p.ultimo_mes + interval '1 month' AND c.dias >= 0) AS mediana_ultimo_mes,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY c.dias) FILTER (WHERE c.cierre >= p.mes_anterior AND c.cierre < p.ultimo_mes AND c.dias >= 0) AS mediana_mes_anterior,
      count(c.os_numero) FILTER (WHERE c.cierre IS NULL) AS historicas_sin_cierre
    FROM periods p LEFT JOIN closed c ON true GROUP BY p.ultimo_mes, p.mes_anterior
  ), open_stats AS (
    SELECT count(*) AS abiertas,
           count(*) FILTER (WHERE fecha_abierta_os IS NULL OR fecha_abierta_os::date > (now() AT TIME ZONE 'America/Asuncion')::date) AS apertura_invalida,
           percentile_cont(0.9) WITHIN GROUP (ORDER BY (now() AT TIME ZONE 'America/Asuncion')::date - fecha_abierta_os::date)
             FILTER (WHERE fecha_abierta_os IS NOT NULL AND fecha_abierta_os::date <= (now() AT TIME ZONE 'America/Asuncion')::date) AS p90_edad_abiertas
    FROM public.ordenes_servicio_importadas WHERE situacion_os ILIKE '%abiert%'
  )
  SELECT jsonb_build_object(
    'fecha_analisis', (now() AT TIME ZONE 'America/Asuncion')::date, 'ultimo_mes', p.ultimo_mes, 'mes_anterior', p.mes_anterior,
    'cierres_ultimo_mes', p.cierres_ultimo_mes, 'cierres_mes_anterior', p.cierres_mes_anterior,
    'invalidas_ultimo_mes', p.invalidas_ultimo_mes, 'invalidas_mes_anterior', p.invalidas_mes_anterior,
    'mediana_ultimo_mes', p.mediana_ultimo_mes, 'mediana_mes_anterior', p.mediana_mes_anterior,
    'historicas_sin_cierre', p.historicas_sin_cierre,
    'abiertas', o.abiertas, 'apertura_invalida', o.apertura_invalida, 'p90_edad_abiertas', o.p90_edad_abiertas
  ) INTO result FROM period_stats p CROSS JOIN open_stats o;
  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.campi_pedidos_abastecimiento_v1() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.campi_resolucion_os_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.campi_pedidos_abastecimiento_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.campi_resolucion_os_v1() TO authenticated;
NOTIFY pgrst, 'reload schema';
