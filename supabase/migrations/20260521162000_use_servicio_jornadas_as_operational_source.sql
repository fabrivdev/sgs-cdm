-- Fuente operativa unica: servicio_jornadas.
-- Trabajo = caso macro. Jornada = fecha programada + resultado de esa visita.

CREATE OR REPLACE FUNCTION public.recalcular_estado_trabajo(p_trabajo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_legacy_servicio_id uuid;
  v_realizadas int := 0;
  v_pendientes int := 0;
  v_pendientes_vigentes int := 0;
  v_nuevo public.estado_trabajo;
BEGIN
  SELECT legacy_servicio_id INTO v_legacy_servicio_id
  FROM public.trabajos
  WHERE id = p_trabajo_id;

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

CREATE OR REPLACE FUNCTION public.recalc_estado_trabajo_from_servicio_jornada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_trabajo_id uuid;
BEGIN
  SELECT id INTO v_trabajo_id
  FROM public.trabajos
  WHERE legacy_servicio_id = COALESCE(NEW.servicio_id, OLD.servicio_id)
  LIMIT 1;

  IF v_trabajo_id IS NOT NULL THEN
    PERFORM public.recalcular_estado_trabajo(v_trabajo_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS recalc_trabajo_on_programaciones ON public.programaciones;
DROP TRIGGER IF EXISTS recalc_trabajo_on_jornadas ON public.jornadas;

DROP TRIGGER IF EXISTS recalc_trabajo_on_servicio_jornada ON public.servicio_jornadas;
CREATE TRIGGER recalc_trabajo_on_servicio_jornada
AFTER INSERT OR UPDATE OR DELETE ON public.servicio_jornadas
FOR EACH ROW EXECUTE FUNCTION public.recalc_estado_trabajo_from_servicio_jornada();

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.trabajos LOOP
    PERFORM public.recalcular_estado_trabajo(r.id);
  END LOOP;
END $$;
