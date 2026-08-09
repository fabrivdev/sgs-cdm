-- Keep the scheduling RPC aligned with the current app_role enum names.
-- The enum migration renamed cabecilla -> jefatura and tecnico -> operativo.
CREATE OR REPLACE FUNCTION public.programar_jornada(
  p_trabajo_id uuid,
  p_fecha date,
  p_tecnico_id uuid,
  p_auxiliares uuid[],
  p_observacion text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_trabajo public.trabajos;
  v_servicio_id uuid;
  v_jornada_id uuid;
  v_dias text[] := ARRAY['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado'];
  v_dia text;
  v_semana int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT * INTO v_trabajo FROM public.trabajos WHERE id = p_trabajo_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trabajo no encontrado';
  END IF;

  IF NOT (
    public.has_role(v_uid, 'admin'::public.app_role)
    OR (public.has_role(v_uid, 'jefatura'::public.app_role)
        AND v_trabajo.sucursal = public.get_user_sucursal(v_uid))
  ) THEN
    RAISE EXCEPTION 'Sin permisos para programar jornada en este trabajo';
  END IF;

  v_dia := v_dias[EXTRACT(DOW FROM p_fecha)::int + 1];
  v_semana := EXTRACT(WEEK FROM p_fecha)::int;
  v_servicio_id := v_trabajo.legacy_servicio_id;

  IF v_servicio_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.servicios WHERE id = v_servicio_id) THEN
    v_servicio_id := NULL;
  END IF;

  IF v_servicio_id IS NULL THEN
    INSERT INTO public.servicios (
      fecha_programada, dia_semana, semana, sucursal, marca, tipo_trabajo,
      tecnico_responsable_id, auxiliares, cliente_id, trabajo_descripcion,
      observaciones, creado_por, estado
    ) VALUES (
      p_fecha, v_dia, v_semana, v_trabajo.sucursal, v_trabajo.marca, v_trabajo.tipo_trabajo,
      p_tecnico_id, COALESCE(p_auxiliares, '{}'::uuid[]), v_trabajo.cliente_id, v_trabajo.descripcion_problema,
      NULLIF(TRIM(COALESCE(p_observacion, '')), ''), v_uid, 'Pendiente'
    ) RETURNING id INTO v_servicio_id;

    UPDATE public.trabajos SET legacy_servicio_id = v_servicio_id WHERE id = p_trabajo_id;
  ELSE
    UPDATE public.servicios SET
      fecha_programada = p_fecha,
      dia_semana = v_dia,
      semana = v_semana,
      sucursal = v_trabajo.sucursal,
      marca = v_trabajo.marca,
      tipo_trabajo = v_trabajo.tipo_trabajo,
      tecnico_responsable_id = p_tecnico_id,
      auxiliares = COALESCE(p_auxiliares, '{}'::uuid[]),
      cliente_id = v_trabajo.cliente_id,
      trabajo_descripcion = v_trabajo.descripcion_problema,
      observaciones = NULLIF(TRIM(COALESCE(p_observacion, '')), '')
    WHERE id = v_servicio_id;
  END IF;

  SELECT id INTO v_jornada_id
  FROM public.servicio_jornadas
  WHERE servicio_id = v_servicio_id AND fecha = p_fecha
  LIMIT 1;

  IF v_jornada_id IS NULL THEN
    INSERT INTO public.servicio_jornadas (
      servicio_id, fecha, estado, tecnico_responsable_id, auxiliares, observaciones
    ) VALUES (
      v_servicio_id, p_fecha, 'Pendiente', p_tecnico_id,
      COALESCE(p_auxiliares, '{}'::uuid[]),
      NULLIF(TRIM(COALESCE(p_observacion, '')), '')
    ) RETURNING id INTO v_jornada_id;
  ELSE
    UPDATE public.servicio_jornadas SET
      estado = 'Pendiente',
      tecnico_responsable_id = p_tecnico_id,
      auxiliares = COALESCE(p_auxiliares, '{}'::uuid[]),
      observaciones = NULLIF(TRIM(COALESCE(p_observacion, '')), '')
    WHERE id = v_jornada_id;
  END IF;

  PERFORM public.recalcular_estado_trabajo(p_trabajo_id);
  RETURN v_jornada_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.programar_jornada(uuid, date, uuid, uuid[], text) TO authenticated;