-- Corrige la fuente de verdad del estado macro del trabajo.
-- El estado debe salir de programaciones/jornadas, no de servicio_jornadas legacy.

CREATE OR REPLACE FUNCTION public.recalcular_estado_trabajo(p_trabajo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_jornadas_realizadas int := 0;
  v_jornadas_no_realizadas int := 0;
  v_programaciones_pendientes int := 0;
  v_programaciones_futuras int := 0;
  v_nuevo public.estado_trabajo;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE estado_jornada = 'completada'),
    COUNT(*) FILTER (WHERE estado_jornada = 'incompleta')
  INTO v_jornadas_realizadas, v_jornadas_no_realizadas
  FROM public.jornadas
  WHERE trabajo_id = p_trabajo_id;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE p.fecha_programada >= CURRENT_DATE)
  INTO v_programaciones_pendientes, v_programaciones_futuras
  FROM public.programaciones p
  WHERE p.trabajo_id = p_trabajo_id
    AND COALESCE(p.estado, 'programada') <> 'cancelada'
    AND NOT EXISTS (
      SELECT 1
      FROM public.jornadas j
      WHERE j.trabajo_id = p.trabajo_id
        AND (
          j.programacion_id = p.id
          OR j.fecha_real = p.fecha_programada
        )
    );

  IF (v_jornadas_realizadas + v_jornadas_no_realizadas) = 0 THEN
    IF v_programaciones_futuras > 0 THEN
      v_nuevo := 'programado'::public.estado_trabajo;
    ELSE
      v_nuevo := 'pendiente'::public.estado_trabajo;
    END IF;
  ELSIF v_programaciones_pendientes > 0 THEN
    v_nuevo := 'iniciado'::public.estado_trabajo;
  ELSIF v_jornadas_no_realizadas > 0 AND v_jornadas_realizadas = 0 THEN
    v_nuevo := 'en_pausa'::public.estado_trabajo;
  ELSE
    v_nuevo := 'completado'::public.estado_trabajo;
  END IF;

  UPDATE public.trabajos
  SET estado_general = v_nuevo,
      cerrado_en = CASE WHEN v_nuevo = 'completado' THEN COALESCE(cerrado_en, now()) ELSE NULL END
  WHERE id = p_trabajo_id
    AND estado_general IS DISTINCT FROM v_nuevo;
END;
$function$;

-- Mantiene la capa legacy alineada para las pantallas que todavia leen servicio_jornadas.
UPDATE public.servicio_jornadas sj
SET estado = CASE
      WHEN j.estado_jornada = 'completada' THEN 'Completado'
      WHEN j.estado_jornada = 'incompleta' THEN 'Cancelada'
      ELSE sj.estado
    END,
    horas_trabajadas = COALESCE(j.horas_reales, sj.horas_trabajadas),
    observaciones = COALESCE(j.observaciones, sj.observaciones),
    tecnico_responsable_id = COALESCE(j.tecnico_id, sj.tecnico_responsable_id),
    updated_at = now()
FROM public.trabajos t
JOIN public.jornadas j ON j.trabajo_id = t.id
LEFT JOIN public.programaciones p ON p.id = j.programacion_id
WHERE t.legacy_servicio_id = sj.servicio_id
  AND t.legacy_servicio_id IS NOT NULL
  AND (
    sj.fecha = j.fecha_real
    OR sj.fecha = p.fecha_programada
  );

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.trabajos LOOP
    PERFORM public.recalcular_estado_trabajo(r.id);
  END LOOP;
END $$;
