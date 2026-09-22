-- Corrige la eliminacion de pedidos pendientes: valor_facturado en la unidad
-- puede contener el valor comercial acordado y un origen asignado solo reserva
-- stock/importacion. Ninguno de los dos acredita una venta real.

CREATE OR REPLACE FUNCTION public.maquinaria_eliminar_pedido(
  p_operacion_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  IF NOT public.maquinaria_puede_gestionar_flujo() THEN
    RAISE EXCEPTION 'Solo admin o jefatura pueden eliminar pedidos'
      USING ERRCODE = '42501';
  END IF;

  SELECT estado
  INTO v_estado
  FROM public.maquinaria_operaciones
  WHERE id = p_operacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido ya no existe';
  END IF;

  IF v_estado IN ('FACTURADA', 'CERRADA')
     OR EXISTS (
       SELECT 1
       FROM public.maquinaria_documentos d
       WHERE d.operacion_id = p_operacion_id
         AND d.tipo = 'FACTURA_VENTA'
     )
     OR EXISTS (
       SELECT 1
       FROM public.maquinaria_operacion_lineas l
       WHERE l.operacion_id = p_operacion_id
         AND (
           nullif(btrim(l.datos_extraidos->'historico_pedido'->>'factura_numero'), '') IS NOT NULL
           OR nullif(btrim(l.datos_extraidos->'historico_pedido'->>'factura_venta'), '') IS NOT NULL
           OR nullif(btrim(l.datos_extraidos->'historico_pedido'->>'factura_fecha'), '') IS NOT NULL
         )
     )
     OR EXISTS (
       SELECT 1
       FROM public.maquinaria_importacion_lineas i
       WHERE i.operacion_id = p_operacion_id
         AND (
           nullif(btrim(i.factura_venta), '') IS NOT NULL
           OR upper(btrim(coalesce(i.venta_facturada, ''))) IN ('TRUE', 'SI', 'SÍ', '1')
         )
     )
     OR EXISTS (
       SELECT 1
       FROM public.maquinaria_operacion_lineas l
       JOIN public.maquinaria_unidades_operacion u ON u.linea_id = l.id
       WHERE l.operacion_id = p_operacion_id
         AND (
           u.estado IN ('FACTURADA', 'EN_PARQUE', 'TRANSFERIDA')
           OR u.parque_maquina_id IS NOT NULL
         )
     ) THEN
    RAISE EXCEPTION 'No se puede eliminar: el pedido ya tiene factura de venta o una maquina entregada al parque';
  END IF;

  -- Documentos propios de una importacion y la maquina fisica sobreviven. Las
  -- FK SET NULL liberan reservas de Stock/Importacion al borrar las unidades.
  UPDATE public.maquinaria_documentos
  SET operacion_id = NULL, actualizado_en = now()
  WHERE operacion_id = p_operacion_id
    AND importacion_linea_id IS NOT NULL;

  DELETE FROM public.maquinaria_operaciones
  WHERE id = p_operacion_id;

  RETURN jsonb_build_object('pedido_eliminado', true);
END;
$$;

REVOKE ALL ON FUNCTION public.maquinaria_eliminar_pedido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maquinaria_eliminar_pedido(uuid) TO authenticated;

COMMENT ON FUNCTION public.maquinaria_eliminar_pedido(uuid) IS
  'Elimina un pedido sin venta real; libera reservas y preserva importacion/stock.';

NOTIFY pgrst, 'reload schema';
