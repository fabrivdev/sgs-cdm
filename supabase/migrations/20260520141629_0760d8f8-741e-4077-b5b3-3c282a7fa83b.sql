CREATE OR REPLACE FUNCTION public.recalcular_estado_trabajo(p_trabajo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cnt_jornadas int;
  v_cnt_incompletas int;
  v_cnt_agendas_futuras int;
  v_cerrado_manual boolean;
  v_nuevo public.estado_trabajo;
  v_actual public.estado_trabajo;
BEGIN
  SELECT estado_general, (cerrado_en IS NOT NULL)
    INTO v_actual, v_cerrado_manual
  FROM public.trabajos WHERE id = p_trabajo_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COUNT(*) INTO v_cnt_jornadas FROM public.jornadas WHERE trabajo_id = p_trabajo_id;

  SELECT COUNT(*) INTO v_cnt_incompletas
  FROM public.jornadas
  WHERE trabajo_id = p_trabajo_id AND estado_jornada = 'incompleta';

  SELECT COUNT(*) INTO v_cnt_agendas_futuras
  FROM public.programaciones p
  WHERE p.trabajo_id = p_trabajo_id
    AND p.fecha_programada >= CURRENT_DATE
    AND NOT EXISTS (SELECT 1 FROM public.jornadas j WHERE j.programacion_id = p.id);

  IF v_cerrado_manual THEN
    v_nuevo := 'completado';
  ELSIF v_cnt_jornadas = 0 THEN
    v_nuevo := CASE WHEN v_cnt_agendas_futuras = 0
                    THEN 'pendiente'::public.estado_trabajo
                    ELSE 'programado'::public.estado_trabajo END;
  ELSIF v_cnt_incompletas > 0 AND v_cnt_agendas_futuras = 0 THEN
    v_nuevo := 'en_pausa';
  ELSE
    v_nuevo := 'iniciado';
  END IF;

  IF v_nuevo IS DISTINCT FROM v_actual THEN
    UPDATE public.trabajos
    SET estado_general = v_nuevo
    WHERE id = p_trabajo_id;
  END IF;
END;
$function$;

-- Recalcular todos los trabajos existentes con la nueva lógica
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.trabajos LOOP
    PERFORM public.recalcular_estado_trabajo(r.id);
  END LOOP;
END $$;