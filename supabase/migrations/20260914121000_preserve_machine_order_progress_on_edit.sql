BEGIN;

-- Encapsula la actualización existente y restaura el estado previo cuando el
-- pedido ya superó Abastecimiento/En importación. Así una corrección descriptiva
-- no borra el progreso operativo, sin alterar la lógica usada por pedidos nuevos.
CREATE OR REPLACE FUNCTION public.maquinaria_actualizar_operacion_preservando_estado(
  p_operacion_id uuid,
  p_operacion jsonb,
  p_lineas jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_estado_anterior text;
  v_resultado uuid;
BEGIN
  IF NOT public.maquinaria_puede_gestionar_flujo() THEN
    RAISE EXCEPTION 'Solo admin o jefatura pueden editar pedidos'
      USING ERRCODE = '42501';
  END IF;

  SELECT estado INTO v_estado_anterior
  FROM public.maquinaria_operaciones
  WHERE id = p_operacion_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe';
  END IF;

  v_resultado := public.maquinaria_actualizar_operacion(
    p_operacion_id,
    p_operacion,
    p_lineas
  );

  IF v_estado_anterior NOT IN ('ABASTECIMIENTO', 'EN_IMPORTACION') THEN
    UPDATE public.maquinaria_operaciones
    SET estado = v_estado_anterior,
        actualizado_en = now()
    WHERE id = p_operacion_id
      AND estado IS DISTINCT FROM v_estado_anterior;
  END IF;

  RETURN v_resultado;
END;
$function$;

REVOKE ALL ON FUNCTION public.maquinaria_actualizar_operacion_preservando_estado(uuid, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.maquinaria_actualizar_operacion_preservando_estado(uuid, jsonb, jsonb)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
