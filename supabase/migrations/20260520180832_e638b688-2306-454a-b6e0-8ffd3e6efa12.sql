
-- Migrar datos: Iniciado -> Pendiente
UPDATE public.servicio_jornadas SET estado = 'Pendiente' WHERE estado = 'Iniciado';

-- Recalcular función ignorando Canceladas
CREATE OR REPLACE FUNCTION public.recalcular_estado_trabajo(p_trabajo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_legacy_servicio_id uuid;
  v_pend int := 0;
  v_comp int := 0;
  v_nuevo public.estado_trabajo;
BEGIN
  SELECT legacy_servicio_id INTO v_legacy_servicio_id
  FROM public.trabajos WHERE id = p_trabajo_id;

  IF v_legacy_servicio_id IS NOT NULL THEN
    SELECT
      COUNT(*) FILTER (WHERE estado = 'Pendiente'),
      COUNT(*) FILTER (WHERE estado = 'Completado')
    INTO v_pend, v_comp
    FROM public.servicio_jornadas
    WHERE servicio_id = v_legacy_servicio_id;
  END IF;

  IF v_legacy_servicio_id IS NULL OR (v_pend + v_comp) = 0 THEN
    v_nuevo := 'pendiente'::public.estado_trabajo;
  ELSIF v_comp = 0 THEN
    v_nuevo := 'programado'::public.estado_trabajo;
  ELSIF v_pend = 0 THEN
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

-- Recalcular todos los trabajos para sincronizar
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.trabajos LOOP
    PERFORM public.recalcular_estado_trabajo(r.id);
  END LOOP;
END $$;
