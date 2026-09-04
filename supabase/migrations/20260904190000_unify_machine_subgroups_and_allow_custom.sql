ALTER TABLE public.parque_maquinas
  ADD COLUMN IF NOT EXISTS subgrupo_personalizado text;

ALTER TABLE public.parque_maquinas
  DROP CONSTRAINT IF EXISTS parque_maquinas_subgrupo_personalizado_check;

ALTER TABLE public.parque_maquinas
  ADD CONSTRAINT parque_maquinas_subgrupo_personalizado_check
  CHECK (subgrupo_personalizado IS NULL OR nullif(btrim(subgrupo_personalizado), '') IS NOT NULL);

UPDATE public.parque_maquinas
SET subgrupo = 'PLATAFORMAS/CABEZALES'::public.subgrupo_maquina,
    subgrupo_personalizado = NULL,
    actualizado_en = now()
WHERE subgrupo = 'PLATAFORMAS'::public.subgrupo_maquina;

UPDATE public.parque_modelos_catalogo
SET activo = false,
    actualizado_en = now()
WHERE subgrupo = 'PLATAFORMAS'::public.subgrupo_maquina;

DROP FUNCTION IF EXISTS public.confirmar_notificacion_alta_maquina(
  uuid, uuid, public.marca, public.subgrupo_maquina, text, text, integer,
  public.sucursal, text, text, text
);

CREATE FUNCTION public.confirmar_notificacion_alta_maquina(
  p_notificacion_id uuid,
  p_cliente_id uuid,
  p_marca public.marca,
  p_subgrupo public.subgrupo_maquina,
  p_modelo_tipo text,
  p_serie text,
  p_anio integer DEFAULT NULL,
  p_sucursal public.sucursal DEFAULT NULL,
  p_localidad text DEFAULT NULL,
  p_vendedor text DEFAULT NULL,
  p_notas text DEFAULT NULL,
  p_subgrupo_personalizado text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_notificacion public.notificaciones%ROWTYPE;
  v_maquina_id uuid;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
  ) THEN RAISE EXCEPTION 'Acceso denegado'; END IF;

  IF p_cliente_id IS NULL THEN RAISE EXCEPTION 'Selecciona un cliente'; END IF;
  IF public.normalizar_chasis_notificacion(p_serie) IS NULL THEN RAISE EXCEPTION 'El chasis es obligatorio'; END IF;
  IF p_marca NOT IN ('CLAAS'::public.marca, 'HORSCH'::public.marca) THEN
    RAISE EXCEPTION 'La marca debe ser CLAAS o HORSCH';
  END IF;
  IF p_subgrupo = 'OTRO'::public.subgrupo_maquina
     AND nullif(btrim(p_subgrupo_personalizado), '') IS NULL THEN
    RAISE EXCEPTION 'Especifica el nuevo subgrupo';
  END IF;

  SELECT * INTO v_notificacion
  FROM public.notificaciones
  WHERE id = p_notificacion_id
  FOR UPDATE;

  IF NOT FOUND OR v_notificacion.tipo <> 'venta_maquina_sin_parque' THEN
    RAISE EXCEPTION 'Notificacion no encontrada';
  END IF;
  IF v_notificacion.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'La notificacion ya fue resuelta';
  END IF;

  SELECT pm.id INTO v_maquina_id
  FROM public.parque_maquinas pm
  WHERE public.normalizar_chasis_notificacion(pm.serie) = public.normalizar_chasis_notificacion(p_serie)
  LIMIT 1;

  IF v_maquina_id IS NULL THEN
    INSERT INTO public.parque_maquinas (
      cliente_id, marca, subgrupo, subgrupo_personalizado, modelo_tipo, serie, anio, sucursal,
      localidad, vendedor, notas, agregado_manualmente, activo
    ) VALUES (
      p_cliente_id, p_marca, p_subgrupo,
      CASE WHEN p_subgrupo = 'OTRO'::public.subgrupo_maquina THEN nullif(btrim(p_subgrupo_personalizado), '') ELSE NULL END,
      nullif(btrim(p_modelo_tipo), ''), btrim(p_serie), p_anio, p_sucursal,
      nullif(btrim(p_localidad), ''), nullif(btrim(p_vendedor), ''),
      nullif(btrim(p_notas), ''), false, true
    )
    RETURNING id INTO v_maquina_id;
  END IF;

  UPDATE public.notificaciones
  SET estado = 'confirmada',
      accionada_por = auth.uid(),
      accionada_en = now(),
      actualizado_en = now(),
      datos = datos || jsonb_build_object('maquina_id', v_maquina_id)
  WHERE id = p_notificacion_id;

  RETURN v_maquina_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirmar_notificacion_alta_maquina(
  uuid, uuid, public.marca, public.subgrupo_maquina, text, text, integer,
  public.sucursal, text, text, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.confirmar_notificacion_alta_maquina(
  uuid, uuid, public.marca, public.subgrupo_maquina, text, text, integer,
  public.sucursal, text, text, text, text
) TO authenticated;

NOTIFY pgrst, 'reload schema';
