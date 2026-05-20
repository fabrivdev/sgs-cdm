
-- 1) Reemplazar la función de recálculo con la lógica correcta
CREATE OR REPLACE FUNCTION public.recalcular_estado_trabajo(p_trabajo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_legacy_servicio_id uuid;
  v_pend int := 0;
  v_ini  int := 0;
  v_comp int := 0;
  v_nuevo public.estado_trabajo;
BEGIN
  SELECT legacy_servicio_id INTO v_legacy_servicio_id
  FROM public.trabajos WHERE id = p_trabajo_id;

  IF v_legacy_servicio_id IS NOT NULL THEN
    SELECT
      COUNT(*) FILTER (WHERE estado = 'Pendiente'),
      COUNT(*) FILTER (WHERE estado = 'Iniciado'),
      COUNT(*) FILTER (WHERE estado = 'Completado')
    INTO v_pend, v_ini, v_comp
    FROM public.servicio_jornadas
    WHERE servicio_id = v_legacy_servicio_id;
  END IF;

  IF v_legacy_servicio_id IS NULL OR (v_pend + v_ini + v_comp) = 0 THEN
    v_nuevo := 'pendiente'::public.estado_trabajo;
  ELSIF v_ini = 0 AND v_comp = 0 THEN
    v_nuevo := 'programado'::public.estado_trabajo;
  ELSIF v_pend = 0 AND v_ini = 0 THEN
    v_nuevo := 'completado'::public.estado_trabajo;
  ELSE
    v_nuevo := 'iniciado'::public.estado_trabajo;
  END IF;

  UPDATE public.trabajos
  SET estado_general = v_nuevo
  WHERE id = p_trabajo_id
    AND estado_general IS DISTINCT FROM v_nuevo;
END;
$function$;

-- 2) Trigger function sobre servicio_jornadas: recalcular el trabajo asociado
CREATE OR REPLACE FUNCTION public.trg_recalc_trabajo_from_servicio_jornada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_servicio_id uuid;
  v_trabajo_id uuid;
BEGIN
  v_servicio_id := COALESCE(NEW.servicio_id, OLD.servicio_id);
  IF v_servicio_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  FOR v_trabajo_id IN
    SELECT id FROM public.trabajos WHERE legacy_servicio_id = v_servicio_id
  LOOP
    PERFORM public.recalcular_estado_trabajo(v_trabajo_id);
  END LOOP;

  -- Si en UPDATE cambió de servicio, recalcular el trabajo anterior también
  IF TG_OP = 'UPDATE' AND OLD.servicio_id IS DISTINCT FROM NEW.servicio_id THEN
    FOR v_trabajo_id IN
      SELECT id FROM public.trabajos WHERE legacy_servicio_id = OLD.servicio_id
    LOOP
      PERFORM public.recalcular_estado_trabajo(v_trabajo_id);
    END LOOP;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS recalc_trabajo_on_servicio_jornada ON public.servicio_jornadas;
CREATE TRIGGER recalc_trabajo_on_servicio_jornada
AFTER INSERT OR UPDATE OR DELETE ON public.servicio_jornadas
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_trabajo_from_servicio_jornada();

-- 3) Trigger sobre trabajos: cuando se vincula/desvincula un legacy_servicio_id, recalcular
CREATE OR REPLACE FUNCTION public.trg_recalc_trabajo_on_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.legacy_servicio_id IS DISTINCT FROM OLD.legacy_servicio_id THEN
    PERFORM public.recalcular_estado_trabajo(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS recalc_trabajo_on_link ON public.trabajos;
CREATE TRIGGER recalc_trabajo_on_link
AFTER INSERT OR UPDATE OF legacy_servicio_id ON public.trabajos
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_trabajo_on_link();

-- 4) Recalcular todos los trabajos existentes una vez para sincronizar el estado actual
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.trabajos LOOP
    PERFORM public.recalcular_estado_trabajo(r.id);
  END LOOP;
END $$;
