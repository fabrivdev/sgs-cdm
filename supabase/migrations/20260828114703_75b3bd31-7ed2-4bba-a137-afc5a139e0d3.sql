-- Vinculacion manual de pedidos cuyo abastecimiento es IMPORTAR.
-- La confirmacion del usuario prevalece sobre las sugerencias de futuras
-- cargas del maestro, sin impedir que se actualicen los datos logisticos.

ALTER TABLE public.maquinaria_importacion_lineas
  ADD COLUMN IF NOT EXISTS vinculo_manual boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS maquinaria_importacion_lineas_unidad_idx
  ON public.maquinaria_importacion_lineas (unidad_id)
  WHERE unidad_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.maquinaria_preservar_vinculo_importacion_manual()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_modifica_vinculo boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_modifica_vinculo := NEW.operacion_id IS NOT NULL
      OR NEW.linea_id IS NOT NULL
      OR NEW.unidad_id IS NOT NULL
      OR NEW.vinculo_manual;
  ELSE
    v_modifica_vinculo := NEW.operacion_id IS DISTINCT FROM OLD.operacion_id
      OR NEW.linea_id IS DISTINCT FROM OLD.linea_id
      OR NEW.unidad_id IS DISTINCT FROM OLD.unidad_id
      OR NEW.situacion_vinculo IS DISTINCT FROM OLD.situacion_vinculo
      OR NEW.vinculo_manual IS DISTINCT FROM OLD.vinculo_manual;
  END IF;

  IF v_modifica_vinculo
     AND auth.uid() IS NOT NULL
     AND NOT (
       public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
       OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
     ) THEN
    RAISE EXCEPTION 'Solo admin o jefatura pueden modificar vinculos de importacion'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.vinculo_manual AND NEW.vinculo_manual THEN
    NEW.operacion_id := OLD.operacion_id;
    NEW.linea_id := OLD.linea_id;
    NEW.unidad_id := OLD.unidad_id;
    NEW.situacion_vinculo := OLD.situacion_vinculo;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS maquinaria_preservar_vinculo_importacion_manual_trigger
  ON public.maquinaria_importacion_lineas;
CREATE TRIGGER maquinaria_preservar_vinculo_importacion_manual_trigger
BEFORE INSERT OR UPDATE ON public.maquinaria_importacion_lineas
FOR EACH ROW
EXECUTE FUNCTION public.maquinaria_preservar_vinculo_importacion_manual();

-- Corrige reservas creadas desde la primera interfaz, que mostraba stock aun
-- cuando la linea del pedido indicaba expresamente IMPORTAR.
UPDATE public.parque_stock_maquinas s
SET unidad_operacion_id = NULL
FROM public.maquinaria_unidades_operacion u
JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
WHERE s.unidad_operacion_id = u.id
  AND l.abastecimiento = 'IMPORTAR';

CREATE OR REPLACE FUNCTION public.maquinaria_validar_origen_stock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_abastecimiento text;
BEGIN
  IF NEW.unidad_operacion_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT l.abastecimiento
    INTO v_abastecimiento
  FROM public.maquinaria_unidades_operacion u
  JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
  WHERE u.id = NEW.unidad_operacion_id;

  IF v_abastecimiento = 'IMPORTAR' THEN
    RAISE EXCEPTION 'Esta unidad debe vincularse a una importacion, no al stock'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS maquinaria_validar_origen_stock_trigger
  ON public.parque_stock_maquinas;
CREATE TRIGGER maquinaria_validar_origen_stock_trigger
BEFORE INSERT OR UPDATE OF unidad_operacion_id ON public.parque_stock_maquinas
FOR EACH ROW
EXECUTE FUNCTION public.maquinaria_validar_origen_stock();

CREATE OR REPLACE FUNCTION public.maquinaria_asignar_importacion(
  p_unidad_id uuid,
  p_importacion_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_operacion_id uuid;
  v_linea_id uuid;
  v_operacion_estado text;
  v_abastecimiento text;
  v_unidad_chasis text;
  v_importacion_chasis text;
  v_importacion_operacion uuid;
  v_importacion_operacion_estado text;
  v_importacion_unidad uuid;
  v_importacion_unidad_estado text;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_module_access(auth.uid(), 'parque')
     OR NOT (
       public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
       OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
     ) THEN
    RAISE EXCEPTION 'Solo admin o jefatura pueden asignar importaciones'
      USING ERRCODE = '42501';
  END IF;

  SELECT o.id, l.id, o.estado, l.abastecimiento, u.chasis
    INTO v_operacion_id, v_linea_id, v_operacion_estado,
      v_abastecimiento, v_unidad_chasis
  FROM public.maquinaria_unidades_operacion u
  JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
  JOIN public.maquinaria_operaciones o ON o.id = l.operacion_id
  WHERE u.id = p_unidad_id
  FOR UPDATE OF u;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La unidad del pedido no existe';
  END IF;
  IF v_operacion_estado = 'CANCELADA' THEN
    RAISE EXCEPTION 'No se puede asignar una importacion a un pedido cancelado';
  END IF;
  IF v_abastecimiento <> 'IMPORTAR' THEN
    RAISE EXCEPTION 'La linea del pedido no tiene origen IMPORTAR';
  END IF;

  IF p_importacion_id IS NOT NULL THEN
    SELECT i.chasis, i.operacion_id, i.unidad_id, o.estado
      INTO v_importacion_chasis, v_importacion_operacion,
        v_importacion_unidad, v_importacion_operacion_estado
    FROM public.maquinaria_importacion_lineas i
    LEFT JOIN public.maquinaria_operaciones o ON o.id = i.operacion_id
    WHERE i.id = p_importacion_id
    FOR UPDATE OF i;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'La fila de importacion ya no existe';
    END IF;
    IF v_importacion_operacion IS NOT NULL
       AND v_importacion_operacion <> v_operacion_id
       AND coalesce(v_importacion_operacion_estado, '') <> 'CANCELADA' THEN
      RAISE EXCEPTION 'La importacion ya esta vinculada a otro pedido activo';
    END IF;

    IF v_importacion_unidad IS NOT NULL AND v_importacion_unidad <> p_unidad_id THEN
      SELECT o.estado
        INTO v_importacion_unidad_estado
      FROM public.maquinaria_unidades_operacion u
      JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
      JOIN public.maquinaria_operaciones o ON o.id = l.operacion_id
      WHERE u.id = v_importacion_unidad;

      IF coalesce(v_importacion_unidad_estado, '') <> 'CANCELADA' THEN
        RAISE EXCEPTION 'La importacion ya esta asignada a otra unidad activa';
      END IF;
    END IF;

    IF public.normalizar_chasis_notificacion(v_importacion_chasis) IS NOT NULL
       AND public.normalizar_chasis_notificacion(v_unidad_chasis) IS NOT NULL
       AND public.normalizar_chasis_notificacion(v_importacion_chasis)
         <> public.normalizar_chasis_notificacion(v_unidad_chasis) THEN
      RAISE EXCEPTION 'El chasis del pedido no coincide con el de la importacion';
    END IF;
  END IF;

  -- El primer UPDATE desactiva temporalmente la proteccion del trigger; el
  -- segundo registra el resultado como una nueva decision manual persistente.
  UPDATE public.maquinaria_importacion_lineas
  SET vinculo_manual = false
  WHERE unidad_id = p_unidad_id
    AND (p_importacion_id IS NULL OR id <> p_importacion_id);

  UPDATE public.maquinaria_importacion_lineas
  SET unidad_id = NULL,
      situacion_vinculo = CASE
        WHEN operacion_id IS NOT NULL THEN 'PEDIDO VINCULADO'
        ELSE 'SIN PEDIDO'
      END,
      vinculo_manual = true,
      actualizado_en = now()
  WHERE unidad_id = p_unidad_id
    AND (p_importacion_id IS NULL OR id <> p_importacion_id);

  IF p_importacion_id IS NOT NULL THEN
    UPDATE public.maquinaria_importacion_lineas
    SET vinculo_manual = false
    WHERE id = p_importacion_id;

    UPDATE public.maquinaria_importacion_lineas
    SET operacion_id = v_operacion_id,
        linea_id = v_linea_id,
        unidad_id = p_unidad_id,
        situacion_vinculo = CASE
          WHEN public.normalizar_chasis_notificacion(chasis) IS NOT NULL
            THEN 'CHASIS VINCULADO'
          ELSE 'PEDIDO VINCULADO'
        END,
        vinculo_manual = true,
        actualizado_en = now()
    WHERE id = p_importacion_id;

    UPDATE public.maquinaria_unidades_operacion
    SET chasis = coalesce(
          nullif(btrim(chasis), ''),
          nullif(btrim(v_importacion_chasis), '')
        ),
        estado = CASE
          WHEN estado = 'PENDIENTE' THEN 'EN_TRANSITO'
          ELSE estado
        END,
        actualizado_en = now()
    WHERE id = p_unidad_id;

    UPDATE public.parque_stock_maquinas
    SET unidad_operacion_id = NULL
    WHERE unidad_operacion_id = p_unidad_id;
  END IF;

  RETURN jsonb_build_object(
    'unidad_id', p_unidad_id,
    'importacion_id', p_importacion_id,
    'vinculada', p_importacion_id IS NOT NULL
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.maquinaria_asignar_importacion(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maquinaria_asignar_importacion(uuid, uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';