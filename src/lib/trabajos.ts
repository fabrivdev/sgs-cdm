-- 1) Normalizar estados viejos

UPDATE public.jornadas
SET estado_jornada = 'completada'::public.estado_jornada
WHERE estado_jornada::text IN ('en_curso', 'incompleta');

UPDATE public.trabajos
SET estado_general = 'iniciado'::public.estado_trabajo
WHERE estado_general::text = 'en_pausa';



-- 2) Reemplazar función de recalculo

CREATE OR REPLACE FUNCTION public.recalcular_estado_trabajo(p_trabajo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_cnt_jornadas int;
  v_cnt_agendas_pendientes int;
  v_nuevo public.estado_trabajo;
BEGIN

  SELECT COUNT(*) INTO v_cnt_jornadas
  FROM public.jornadas
  WHERE trabajo_id = p_trabajo_id;

  SELECT COUNT(*) INTO v_cnt_agendas_pendientes
  FROM public.programaciones p
  WHERE p.trabajo_id = p_trabajo_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.jornadas j
      WHERE j.programacion_id = p.id
    );

  IF v_cnt_jornadas = 0 AND v_cnt_agendas_pendientes = 0 THEN
    v_nuevo := 'pendiente'::public.estado_trabajo;

  ELSIF v_cnt_jornadas = 0 AND v_cnt_agendas_pendientes > 0 THEN
    v_nuevo := 'programado'::public.estado_trabajo;

  ELSIF v_cnt_jornadas > 0 AND v_cnt_agendas_pendientes > 0 THEN
    v_nuevo := 'iniciado'::public.estado_trabajo;

  ELSE
    v_nuevo := 'completado'::public.estado_trabajo;
  END IF;

  UPDATE public.trabajos
  SET estado_general = v_nuevo
  WHERE id = p_trabajo_id;

END;
$$;



-- 3) Recalcular todos los trabajos

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.trabajos LOOP
    PERFORM public.recalcular_estado_trabajo(r.id);
  END LOOP;
END $$;
