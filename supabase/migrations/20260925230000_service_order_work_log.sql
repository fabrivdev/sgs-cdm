-- Lectura de horas por fecha de trabajo. No modifica jornadas ni liquidaciones.
BEGIN;
CREATE INDEX IF NOT EXISTS comisiones_jornadas_trabajo_vigente_idx
  ON public.comisiones_jornadas(fecha_inicio, fecha_fin, os_numero) WHERE vigente;

CREATE OR REPLACE FUNCTION public.service_orders_work_log_v1(p_desde date, p_hasta date, p_os text DEFAULT NULL)
RETURNS TABLE(os text, order_data jsonb, entries jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '25s'
SET plan_cache_mode = 'force_custom_plan'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(), 'servicios.ordenes') THEN
    RAISE EXCEPTION 'Sin acceso a jornadas de OS' USING ERRCODE = '42501';
  END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_desde > p_hasta
     OR (p_os IS NOT NULL AND (btrim(p_os) = '' OR length(p_os) > 100)) THEN
    RAISE EXCEPTION 'Periodo de trabajo invalido' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH candidates AS (
    -- Include all work in the period, even for an OS opened/closed outside it.
    -- One previous day covers the importer's inferred midnight crossing.
    SELECT DISTINCT j.os_numero
    FROM public.comisiones_jornadas j
    WHERE j.vigente AND (p_os IS NULL OR j.os_numero = p_os)
      AND (p_os IS NOT NULL OR j.fecha_inicio IS NULL OR j.fecha_fin IS NULL
        OR (j.fecha_inicio <= p_hasta AND j.fecha_fin >= p_desde - 1))
    UNION
    -- Do not silently turn a missing ledger into zero worked hours.
    SELECT o.os_numero FROM public.ordenes_servicio_importadas o
    WHERE (p_os IS NOT NULL AND o.os_numero = p_os)
      OR (p_os IS NULL AND coalesce(o.servicios_cantidad,0) > 0
        AND (o.fecha_abierta_os::date BETWEEN p_desde AND p_hasta
          OR o.fecha_cierre_os::date BETWEEN p_desde AND p_hasta)
        AND NOT EXISTS (SELECT 1 FROM public.comisiones_jornadas j WHERE j.os_numero=o.os_numero AND j.vigente))
  )
  SELECT c.os_numero,
    CASE WHEN o.os_numero IS NOT NULL THEN jsonb_build_object(
      'os_numero',o.os_numero,'trabajo_id',o.trabajo_id,'cliente_nombre',o.cliente_nombre,
      'nro_chasis',o.nro_chasis,'marca',o.marca,'problema',o.problema,'factura',o.factura,
      'situacion_os',o.situacion_os,'tipo_tiempo',o.tipo_tiempo,'servicios_cantidad',o.servicios_cantidad,
      'servicios_valor',o.servicios_valor,'repuesto_valor',o.repuesto_valor,
      'km_cantidad',o.km_cantidad,'kilometro_valor',o.kilometro_valor,
      'raw_data',jsonb_build_object(
        'canonical_model',coalesce(o.raw_data->>'canonical_model',o.raw_data->>'MODELO',o.raw_data->>'Modelo',o.raw_data->>'modelo'),
        'canonical_branch',o.raw_data->>'canonical_branch','source_branch_code',o.raw_data->>'source_branch_code',
        'Sucursal',o.raw_data->>'Sucursal','tipos_tiempo',o.raw_data->'tipos_tiempo'
      )) END,
    coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',j.id,'fecha_inicio',j.fecha_inicio,'hora_inicio',j.hora_inicio,
      'fecha_fin',j.fecha_fin,'hora_fin',j.hora_fin,
      'tecnico_nombre',j.tecnico_nombre,'tecnico_profile_id',j.tecnico_profile_id,
      'sucursal',j.sucursal,'tipo_tiempo',j.tipo_tiempo,
      'estado_validacion',j.estado_validacion,
      'heredado',coalesce((j.raw_data->>'inherited_from_ma01')='true',false)
    ) ORDER BY j.fecha_inicio,j.hora_inicio,j.id)
      FROM public.comisiones_jornadas j WHERE j.os_numero=c.os_numero AND j.vigente),'[]'::jsonb)
  FROM candidates c LEFT JOIN public.ordenes_servicio_importadas o ON o.os_numero=c.os_numero
  ORDER BY c.os_numero;
END;
$$;
REVOKE ALL ON FUNCTION public.service_orders_work_log_v1(date,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.service_orders_work_log_v1(date,date,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
