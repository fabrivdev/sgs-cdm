-- Solo expone para asignacion unidades importadas que siguen en transito,
-- no tienen otro vinculo y cuyo chasis aun no existe en stock ni en parque.

CREATE OR REPLACE VIEW public.maquinaria_importacion_unidades_asignables
WITH (security_invoker = true)
AS
SELECT iu.*
FROM public.maquinaria_importacion_unidades_operativas iu
WHERE iu.unidad_id IS NULL
  AND iu.operacion_id IS NULL
  AND iu.ata IS NULL
  AND upper(coalesce(iu.estado_fuente, '')) !~ '(RECIB|COMPLET|ARRIB|CANCEL)'
  AND (
    public.normalizar_chasis_notificacion(iu.chasis) IS NULL
    OR (
      NOT EXISTS (
        SELECT 1
        FROM public.parque_stock_maquinas stock
        WHERE public.normalizar_chasis_notificacion(stock.chasis)
          = public.normalizar_chasis_notificacion(iu.chasis)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.parque_maquinas parque
        WHERE parque.activo
          AND public.normalizar_chasis_notificacion(parque.serie)
            = public.normalizar_chasis_notificacion(iu.chasis)
      )
    )
  );

GRANT SELECT ON public.maquinaria_importacion_unidades_asignables TO authenticated;

CREATE OR REPLACE FUNCTION public.maquinaria_validar_importacion_asignable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ata date;
  v_estado text;
  v_chasis text;
BEGIN
  IF NEW.unidad_id IS NULL
     OR (TG_OP = 'UPDATE' AND NEW.unidad_id IS NOT DISTINCT FROM OLD.unidad_id) THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(NEW.ata, i.ata),
    coalesce(NEW.estado_fuente, i.estado_fuente),
    coalesce(NEW.chasis, CASE WHEN NEW.numero_unidad = 1 THEN i.chasis END)
  INTO v_ata, v_estado, v_chasis
  FROM public.maquinaria_importacion_lineas i
  WHERE i.id = NEW.importacion_linea_id;

  IF v_ata IS NOT NULL OR upper(coalesce(v_estado, '')) ~ '(RECIB|COMPLET|ARRIB|CANCEL)' THEN
    RAISE EXCEPTION 'La maquina importada ya llego o dejo de estar disponible';
  END IF;
  IF public.normalizar_chasis_notificacion(v_chasis) IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.parque_stock_maquinas stock
       WHERE public.normalizar_chasis_notificacion(stock.chasis)
         = public.normalizar_chasis_notificacion(v_chasis)
     ) THEN
    RAISE EXCEPTION 'El chasis de la importacion ya existe en stock';
  END IF;
  IF public.normalizar_chasis_notificacion(v_chasis) IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.parque_maquinas parque
       WHERE parque.activo
         AND public.normalizar_chasis_notificacion(parque.serie)
           = public.normalizar_chasis_notificacion(v_chasis)
     ) THEN
    RAISE EXCEPTION 'El chasis de la importacion ya existe en el parque';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS maquinaria_validar_importacion_asignable_trigger
  ON public.maquinaria_importacion_unidades;
CREATE TRIGGER maquinaria_validar_importacion_asignable_trigger
BEFORE INSERT OR UPDATE OF unidad_id
ON public.maquinaria_importacion_unidades
FOR EACH ROW EXECUTE FUNCTION public.maquinaria_validar_importacion_asignable();

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
  v_importacion_unidad uuid;
  v_importacion_operacion_estado text;
  v_importacion_ata date;
  v_importacion_estado text;
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

  IF NOT FOUND THEN RAISE EXCEPTION 'La unidad del pedido no existe'; END IF;
  IF v_operacion_estado = 'CANCELADA' THEN
    RAISE EXCEPTION 'No se puede asignar una importacion a un pedido cancelado';
  END IF;
  IF v_abastecimiento <> 'IMPORTAR' THEN
    RAISE EXCEPTION 'La linea del pedido no tiene origen IMPORTAR';
  END IF;

  IF p_importacion_id IS NOT NULL THEN
    SELECT iu.chasis, iu.operacion_id, iu.unidad_id, o.estado,
      iu.ata, iu.estado_fuente
    INTO v_importacion_chasis, v_importacion_operacion,
      v_importacion_unidad, v_importacion_operacion_estado,
      v_importacion_ata, v_importacion_estado
    FROM public.maquinaria_importacion_unidades iu
    LEFT JOIN public.maquinaria_operaciones o ON o.id = iu.operacion_id
    WHERE iu.id = p_importacion_id AND iu.activa
    FOR UPDATE OF iu;

    IF NOT FOUND THEN RAISE EXCEPTION 'La unidad de importacion ya no existe'; END IF;
    IF v_importacion_operacion IS NOT NULL
       AND v_importacion_operacion <> v_operacion_id
       AND coalesce(v_importacion_operacion_estado, '') <> 'CANCELADA' THEN
      RAISE EXCEPTION 'La maquina importada ya esta vinculada a otro pedido activo';
    END IF;
    IF v_importacion_unidad IS NOT NULL AND v_importacion_unidad <> p_unidad_id THEN
      RAISE EXCEPTION 'La maquina importada ya esta asignada a otra unidad';
    END IF;

    -- Una vinculacion ya existente puede conservarse o quitarse, pero una
    -- nueva asignacion solo admite unidades que realmente siguen disponibles.
    IF v_importacion_unidad IS DISTINCT FROM p_unidad_id THEN
      IF v_importacion_ata IS NOT NULL
         OR upper(coalesce(v_importacion_estado, '')) ~ '(RECIB|COMPLET|ARRIB|CANCEL)' THEN
        RAISE EXCEPTION 'La maquina importada ya llego o dejo de estar disponible';
      END IF;
      IF v_importacion_operacion IS NOT NULL THEN
        RAISE EXCEPTION 'La maquina importada ya esta vinculada a otro pedido';
      END IF;
      IF public.normalizar_chasis_notificacion(v_importacion_chasis) IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM public.parque_stock_maquinas stock
           WHERE public.normalizar_chasis_notificacion(stock.chasis)
             = public.normalizar_chasis_notificacion(v_importacion_chasis)
         ) THEN
        RAISE EXCEPTION 'El chasis de la importacion ya existe en stock';
      END IF;
      IF public.normalizar_chasis_notificacion(v_importacion_chasis) IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM public.parque_maquinas parque
           WHERE parque.activo
             AND public.normalizar_chasis_notificacion(parque.serie)
               = public.normalizar_chasis_notificacion(v_importacion_chasis)
         ) THEN
        RAISE EXCEPTION 'El chasis de la importacion ya existe en el parque';
      END IF;
    END IF;

    IF public.normalizar_chasis_notificacion(v_importacion_chasis) IS NOT NULL
       AND public.normalizar_chasis_notificacion(v_unidad_chasis) IS NOT NULL
       AND public.normalizar_chasis_notificacion(v_importacion_chasis)
         <> public.normalizar_chasis_notificacion(v_unidad_chasis) THEN
      RAISE EXCEPTION 'El chasis del pedido no coincide con el de la importacion';
    END IF;
  END IF;

  UPDATE public.maquinaria_importacion_unidades
  SET operacion_id = NULL, linea_id = NULL, unidad_id = NULL,
      situacion_vinculo = 'SIN PEDIDO', vinculo_manual = true,
      actualizado_en = now()
  WHERE unidad_id = p_unidad_id
    AND (p_importacion_id IS NULL OR id <> p_importacion_id);

  IF p_importacion_id IS NOT NULL THEN
    UPDATE public.maquinaria_importacion_unidades
    SET operacion_id = v_operacion_id, linea_id = v_linea_id,
        unidad_id = p_unidad_id,
        situacion_vinculo = CASE
          WHEN public.normalizar_chasis_notificacion(chasis) IS NOT NULL
            THEN 'CHASIS VINCULADO' ELSE 'PEDIDO VINCULADO' END,
        vinculo_manual = true, actualizado_en = now()
    WHERE id = p_importacion_id;

    UPDATE public.maquinaria_unidades_operacion
    SET chasis = coalesce(nullif(btrim(chasis), ''), nullif(btrim(v_importacion_chasis), '')),
        estado = CASE WHEN estado = 'PENDIENTE' THEN 'EN_TRANSITO' ELSE estado END,
        actualizado_en = now()
    WHERE id = p_unidad_id;

    UPDATE public.parque_stock_maquinas
    SET unidad_operacion_id = NULL
    WHERE unidad_operacion_id = p_unidad_id;
  END IF;

  RETURN jsonb_build_object(
    'unidad_id', p_unidad_id,
    'importacion_unidad_id', p_importacion_id,
    'vinculada', p_importacion_id IS NOT NULL
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.maquinaria_asignar_importacion(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maquinaria_asignar_importacion(uuid, uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
