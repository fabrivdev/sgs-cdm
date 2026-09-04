-- La reserva automatica de stock (parque_stock_maquinas.unidad_operacion_id)
-- no tiene sentido para un pedido ya FACTURADA/CERRADA: la venta ya esta
-- resuelta, no hay nada que reservar. Hasta ahora este trigger lo intentaba
-- igual, y el guard maquinaria_bloquear_reserva_cerrada_trigger (en
-- parque_stock_maquinas) lo bloqueaba con una excepcion -- que revertia
-- tambien la correccion de chasis que disparo la cadena, porque todo corre
-- en la misma transaccion.
--
-- Mismo criterio que ya usaba maquinaria_vincular_importacion_historica
-- (el RPC manual, "sin tocar stock"): si el pedido esta cerrado, el vinculo
-- de trazabilidad (maquinaria_importacion_unidades.unidad_id, que escribe
-- una funcion distinta, sin tocar esta) se sigue guardando igual -- lo unico
-- que se saltea es el intento de reserva de stock.

CREATE OR REPLACE FUNCTION public.maquinaria_sincronizar_reserva_importada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stock_id uuid;
  v_coincidencias integer;
  v_operacion_estado text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.unidad_id IS NOT NULL
     AND (
       OLD.unidad_id IS DISTINCT FROM NEW.unidad_id
       OR public.normalizar_chasis_notificacion(OLD.chasis)
          IS DISTINCT FROM public.normalizar_chasis_notificacion(NEW.chasis)
     ) THEN
    UPDATE public.parque_stock_maquinas
    SET unidad_operacion_id = NULL
    WHERE unidad_operacion_id = OLD.unidad_id
      AND public.normalizar_chasis_notificacion(chasis)
        = public.normalizar_chasis_notificacion(coalesce(OLD.chasis, NEW.chasis));
  END IF;

  IF NEW.unidad_id IS NOT NULL
     AND NEW.ata IS NOT NULL
     AND NEW.vinculo_manual
     AND public.normalizar_chasis_notificacion(NEW.chasis) IS NOT NULL THEN

    SELECT o.estado INTO v_operacion_estado
    FROM public.maquinaria_unidades_operacion u
    JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
    JOIN public.maquinaria_operaciones o ON o.id = l.operacion_id
    WHERE u.id = NEW.unidad_id;

    IF v_operacion_estado IS DISTINCT FROM 'FACTURADA'
       AND v_operacion_estado IS DISTINCT FROM 'CERRADA' THEN
      SELECT count(*), min(s.id::text)::uuid
      INTO v_coincidencias, v_stock_id
      FROM public.parque_stock_maquinas s
      WHERE public.normalizar_chasis_notificacion(s.chasis)
        = public.normalizar_chasis_notificacion(NEW.chasis);

      IF v_coincidencias = 1 THEN
        UPDATE public.parque_stock_maquinas
        SET unidad_operacion_id = NEW.unidad_id
        WHERE id = v_stock_id
          AND (unidad_operacion_id IS NULL OR unidad_operacion_id = NEW.unidad_id);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
