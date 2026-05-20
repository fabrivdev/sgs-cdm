
-- Trigger automático: el estado del trabajo se calcula desde agendas y jornadas.
CREATE OR REPLACE FUNCTION public.recalcular_estado_trabajo(p_trabajo_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_cnt_jornadas int;
  v_cnt_agendas_futuras int;
  v_ultima_incompleta boolean;
  v_nuevo public.estado_trabajo;
  v_actual public.estado_trabajo;
BEGIN
  SELECT estado_general INTO v_actual FROM public.trabajos WHERE id = p_trabajo_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COUNT(*) INTO v_cnt_jornadas FROM public.jornadas WHERE trabajo_id = p_trabajo_id;

  SELECT COUNT(*) INTO v_cnt_agendas_futuras
  FROM public.programaciones p
  WHERE p.trabajo_id = p_trabajo_id
    AND p.fecha_programada >= CURRENT_DATE
    AND NOT EXISTS (SELECT 1 FROM public.jornadas j WHERE j.programacion_id = p.id);

  SELECT (estado_jornada = 'incompleta') INTO v_ultima_incompleta
  FROM public.jornadas
  WHERE trabajo_id = p_trabajo_id
  ORDER BY fecha_real DESC, creado_en DESC
  LIMIT 1;

  IF v_cnt_jornadas = 0 THEN
    v_nuevo := CASE WHEN v_cnt_agendas_futuras = 0
                    THEN 'pendiente'::public.estado_trabajo
                    ELSE 'programado'::public.estado_trabajo END;
  ELSIF COALESCE(v_ultima_incompleta, false) AND v_cnt_agendas_futuras = 0 THEN
    v_nuevo := 'en_pausa';
  ELSIF v_cnt_agendas_futuras > 0 THEN
    v_nuevo := 'iniciado';
  ELSE
    v_nuevo := 'completado';
  END IF;

  IF v_nuevo IS DISTINCT FROM v_actual THEN
    UPDATE public.trabajos
    SET estado_general = v_nuevo,
        cerrado_en = CASE WHEN v_nuevo = 'completado' THEN COALESCE(cerrado_en, now()) ELSE NULL END
    WHERE id = p_trabajo_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_recalc_trabajo_from_child() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalcular_estado_trabajo(OLD.trabajo_id);
    RETURN OLD;
  END IF;
  PERFORM public.recalcular_estado_trabajo(NEW.trabajo_id);
  IF TG_OP = 'UPDATE' AND OLD.trabajo_id IS DISTINCT FROM NEW.trabajo_id THEN
    PERFORM public.recalcular_estado_trabajo(OLD.trabajo_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS recalc_trabajo_on_programaciones ON public.programaciones;
CREATE TRIGGER recalc_trabajo_on_programaciones
AFTER INSERT OR UPDATE OR DELETE ON public.programaciones
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_trabajo_from_child();

DROP TRIGGER IF EXISTS recalc_trabajo_on_jornadas ON public.jornadas;
CREATE TRIGGER recalc_trabajo_on_jornadas
AFTER INSERT OR UPDATE OR DELETE ON public.jornadas
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_trabajo_from_child();

-- Recalcular el estado de todos los trabajos existentes con la nueva lógica
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.trabajos LOOP
    PERFORM public.recalcular_estado_trabajo(r.id);
  END LOOP;
END $$;
