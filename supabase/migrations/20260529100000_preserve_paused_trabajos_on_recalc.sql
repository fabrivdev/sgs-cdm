CREATE OR REPLACE FUNCTION public.recalcular_estado_trabajo(p_trabajo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_legacy_servicio_id uuid;
  v_estado_actual public.estado_trabajo;
  v_motivo_bloqueo text;
  v_realizadas int := 0;
  v_pendientes int := 0;
  v_pendientes_vigentes int := 0;
  v_nuevo public.estado_trabajo;
BEGIN
  SELECT legacy_servicio_id, estado_general, motivo_bloqueo
  INTO v_legacy_servicio_id, v_estado_actual, v_motivo_bloqueo
  FROM public.trabajos
  WHERE id = p_trabajo_id;

  IF v_estado_actual IN ('bloqueado'::public.estado_trabajo, 'en_pausa'::public.estado_trabajo)
     OR NULLIF(btrim(COALESCE(v_motivo_bloqueo, '')), '') IS NOT NULL THEN
    RETURN;
  END IF;

  IF v_legacy_servicio_id IS NULL THEN
    v_nuevo := 'pendiente'::public.estado_trabajo;
  ELSE
    SELECT
      COUNT(*) FILTER (WHERE estado = 'Completado'),
      COUNT(*) FILTER (WHERE estado = 'Pendiente'),
      COUNT(*) FILTER (
        WHERE estado = 'Pendiente'
          AND fecha >= (CURRENT_DATE - INTERVAL '7 days')
      )
    INTO v_realizadas, v_pendientes, v_pendientes_vigentes
    FROM public.servicio_jornadas
    WHERE servicio_id = v_legacy_servicio_id;

    IF v_realizadas > 0 AND v_pendientes = 0 THEN
      v_nuevo := 'completado'::public.estado_trabajo;
    ELSIF v_realizadas > 0 AND v_pendientes > 0 THEN
      v_nuevo := 'iniciado'::public.estado_trabajo;
    ELSIF v_pendientes_vigentes > 0 THEN
      v_nuevo := 'programado'::public.estado_trabajo;
    ELSE
      v_nuevo := 'pendiente'::public.estado_trabajo;
    END IF;
  END IF;

  UPDATE public.trabajos
  SET estado_general = v_nuevo,
      cerrado_en = CASE WHEN v_nuevo = 'completado' THEN COALESCE(cerrado_en, now()) ELSE NULL END
  WHERE id = p_trabajo_id
    AND estado_general IS DISTINCT FROM v_nuevo;
END;
$function$;

NOTIFY pgrst, 'reload schema';
