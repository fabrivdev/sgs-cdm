CREATE OR REPLACE FUNCTION public.recalcular_estado_trabajo(p_trabajo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_legacy_servicio_id uuid;
  v_realizadas int := 0;
  v_agenda_futura int := 0;
  v_agenda_vencida int := 0;
  v_nuevo public.estado_trabajo;
BEGIN
  SELECT legacy_servicio_id INTO v_legacy_servicio_id
  FROM public.trabajos WHERE id = p_trabajo_id;

  IF v_legacy_servicio_id IS NOT NULL THEN
    SELECT
      COUNT(*) FILTER (WHERE estado = 'Completado'),
      COUNT(*) FILTER (WHERE estado = 'Pendiente' AND fecha >= CURRENT_DATE),
      COUNT(*) FILTER (WHERE estado = 'Pendiente' AND fecha <  CURRENT_DATE)
    INTO v_realizadas, v_agenda_futura, v_agenda_vencida
    FROM public.servicio_jornadas
    WHERE servicio_id = v_legacy_servicio_id;
  END IF;

  -- Regla definitiva:
  -- Sin jornadas realizadas:
  --   - con agenda futura  -> Programado
  --   - sin agenda futura  -> Pendiente (aunque haya vencidas sin cargar)
  -- Con jornadas realizadas:
  --   - con alguna agenda pendiente (futura o vencida) -> Iniciado
  --   - sin agendas pendientes -> Completado
  IF v_realizadas = 0 THEN
    IF v_agenda_futura > 0 THEN
      v_nuevo := 'programado'::public.estado_trabajo;
    ELSE
      v_nuevo := 'pendiente'::public.estado_trabajo;
    END IF;
  ELSE
    IF (v_agenda_futura + v_agenda_vencida) > 0 THEN
      v_nuevo := 'iniciado'::public.estado_trabajo;
    ELSE
      v_nuevo := 'completado'::public.estado_trabajo;
    END IF;
  END IF;

  UPDATE public.trabajos
  SET estado_general = v_nuevo
  WHERE id = p_trabajo_id
    AND estado_general IS DISTINCT FROM v_nuevo;
END;
$function$;

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id FROM public.trabajos LOOP
    PERFORM public.recalcular_estado_trabajo(r.id);
  END LOOP;
END $$;