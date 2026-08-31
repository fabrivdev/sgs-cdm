-- Los pedidos facturados/cerrados ya no admiten nuevas reservas de stock.
-- Para reconstruir historia se permite vincular una unidad de importacion
-- recibida, pero solo por coincidencia exacta de chasis y sin tocar stock,
-- estado de la unidad ni fechas logisticas.

CREATE OR REPLACE FUNCTION public.maquinaria_bloquear_reserva_cerrada()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  IF NEW.unidad_operacion_id IS NULL
     OR (TG_OP = 'UPDATE' AND NEW.unidad_operacion_id IS NOT DISTINCT FROM OLD.unidad_operacion_id) THEN
    RETURN NEW;
  END IF;

  SELECT o.estado INTO v_estado
  FROM public.maquinaria_unidades_operacion u
  JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
  JOIN public.maquinaria_operaciones o ON o.id = l.operacion_id
  WHERE u.id = NEW.unidad_operacion_id;

  IF v_estado IN ('FACTURADA', 'CERRADA') THEN
    RAISE EXCEPTION 'Un pedido facturado o cerrado no admite nuevas reservas de stock';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS maquinaria_bloquear_reserva_cerrada_trigger
  ON public.parque_stock_maquinas;
CREATE TRIGGER maquinaria_bloquear_reserva_cerrada_trigger
BEFORE INSERT OR UPDATE OF unidad_operacion_id
ON public.parque_stock_maquinas
FOR EACH ROW EXECUTE FUNCTION public.maquinaria_bloquear_reserva_cerrada();

CREATE OR REPLACE FUNCTION public.maquinaria_validar_importacion_asignable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ata date;
  v_estado text;
  v_chasis text;
  v_pedido_estado text;
  v_pedido_chasis text;
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

  SELECT o.estado, u.chasis
  INTO v_pedido_estado, v_pedido_chasis
  FROM public.maquinaria_unidades_operacion u
  JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
  JOIN public.maquinaria_operaciones o ON o.id = l.operacion_id
  WHERE u.id = NEW.unidad_id;

  -- Una venta cerrada no reserva la importacion: solo reconstruye el origen
  -- fisico, y por eso exige ambos chasis y una coincidencia exacta.
  IF v_pedido_estado IN ('FACTURADA', 'CERRADA') THEN
    IF public.normalizar_chasis_notificacion(v_pedido_chasis) IS NULL
       OR public.normalizar_chasis_notificacion(v_chasis) IS NULL
       OR public.normalizar_chasis_notificacion(v_pedido_chasis)
         <> public.normalizar_chasis_notificacion(v_chasis) THEN
      RAISE EXCEPTION 'La trazabilidad historica requiere coincidencia exacta de chasis';
    END IF;
    RETURN NEW;
  END IF;

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

CREATE OR REPLACE VIEW public.maquinaria_importacion_unidades_historicas
WITH (security_invoker = true)
AS
SELECT
  iu.*,
  public.normalizar_chasis_notificacion(iu.chasis) AS chasis_normalizado
FROM public.maquinaria_importacion_unidades_operativas iu
WHERE public.normalizar_chasis_notificacion(iu.chasis) IS NOT NULL;

GRANT SELECT ON public.maquinaria_importacion_unidades_historicas TO authenticated;

CREATE OR REPLACE FUNCTION public.maquinaria_vincular_importacion_historica(
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
  v_unidad_chasis text;
  v_importacion_chasis text;
  v_importacion_unidad uuid;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_module_access(auth.uid(), 'parque')
     OR NOT (
       public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
       OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
     ) THEN
    RAISE EXCEPTION 'Solo admin o jefatura pueden vincular trazabilidad historica'
      USING ERRCODE = '42501';
  END IF;

  SELECT o.id, l.id, o.estado, u.chasis
  INTO v_operacion_id, v_linea_id, v_operacion_estado, v_unidad_chasis
  FROM public.maquinaria_unidades_operacion u
  JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
  JOIN public.maquinaria_operaciones o ON o.id = l.operacion_id
  WHERE u.id = p_unidad_id
  FOR UPDATE OF u;

  IF NOT FOUND THEN RAISE EXCEPTION 'La unidad del pedido no existe'; END IF;
  IF v_operacion_estado NOT IN ('FACTURADA', 'CERRADA') THEN
    RAISE EXCEPTION 'La trazabilidad historica solo corresponde a pedidos facturados o cerrados';
  END IF;

  IF p_importacion_id IS NOT NULL THEN
    IF public.normalizar_chasis_notificacion(v_unidad_chasis) IS NULL THEN
      RAISE EXCEPTION 'Primero debe registrarse el chasis de la maquina vendida';
    END IF;

    SELECT coalesce(iu.chasis, CASE WHEN iu.numero_unidad = 1 THEN i.chasis END), iu.unidad_id
    INTO v_importacion_chasis, v_importacion_unidad
    FROM public.maquinaria_importacion_unidades iu
    JOIN public.maquinaria_importacion_lineas i ON i.id = iu.importacion_linea_id
    WHERE iu.id = p_importacion_id AND iu.activa
    FOR UPDATE OF iu;

    IF NOT FOUND THEN RAISE EXCEPTION 'La unidad de importacion no existe'; END IF;
    IF v_importacion_unidad IS NOT NULL AND v_importacion_unidad <> p_unidad_id THEN
      RAISE EXCEPTION 'La importacion ya esta vinculada a otra maquina vendida';
    END IF;
    IF public.normalizar_chasis_notificacion(v_importacion_chasis) IS NULL
       OR public.normalizar_chasis_notificacion(v_importacion_chasis)
          <> public.normalizar_chasis_notificacion(v_unidad_chasis) THEN
      RAISE EXCEPTION 'El chasis de la importacion no coincide exactamente con el pedido';
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
    SET operacion_id = v_operacion_id,
        linea_id = v_linea_id,
        unidad_id = p_unidad_id,
        situacion_vinculo = 'CHASIS VINCULADO',
        vinculo_manual = true,
        actualizado_en = now()
    WHERE id = p_importacion_id;
  END IF;

  RETURN jsonb_build_object(
    'unidad_id', p_unidad_id,
    'importacion_unidad_id', p_importacion_id,
    'vinculada', p_importacion_id IS NOT NULL,
    'modo', 'HISTORICO'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.maquinaria_vincular_importacion_historica(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maquinaria_vincular_importacion_historica(uuid, uuid)
  TO authenticated;

COMMENT ON VIEW public.maquinaria_importacion_unidades_historicas IS
  'Unidades importadas con chasis, incluidas recibidas, para trazabilidad historica exacta.';

NOTIFY pgrst, 'reload schema';
