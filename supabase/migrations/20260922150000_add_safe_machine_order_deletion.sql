-- Elimina un pedido completo en una unica transaccion. La operacion se rechaza
-- antes de borrar nada cuando alguna de sus lineas ya tiene trazabilidad real.

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
       FROM public.maquinaria_importaciones_operativas i
       WHERE i.operacion_id = p_operacion_id
         AND (
           nullif(btrim(i.factura_numero), '') IS NOT NULL
           OR i.factura_fecha IS NOT NULL
           OR i.valor_facturado IS NOT NULL
           OR i.estado NOT IN ('PENDIENTE_FACTURA', 'CANCELADA')
         )
     )
     OR EXISTS (
       SELECT 1
       FROM public.maquinaria_operacion_lineas l
       JOIN public.maquinaria_unidades_operacion u ON u.linea_id = l.id
       LEFT JOIN public.parque_stock_maquinas s ON s.unidad_operacion_id = u.id
       LEFT JOIN public.maquinaria_importacion_unidades iu ON iu.unidad_id = u.id
       LEFT JOIN public.maquinaria_factura_importacion_unidades fiu
         ON fiu.importacion_unidad_id = iu.id
       WHERE l.operacion_id = p_operacion_id
         AND (
           nullif(btrim(u.chasis), '') IS NOT NULL
           OR u.valor_facturado IS NOT NULL
           OR u.estado <> 'PENDIENTE'
           OR u.parque_maquina_id IS NOT NULL
           OR s.id IS NOT NULL
           OR iu.ata IS NOT NULL
           OR nullif(btrim(iu.invoice_supplier), '') IS NOT NULL
           OR iu.factura_proveedor_fecha IS NOT NULL
           OR iu.costo_final IS NOT NULL
           OR fiu.importacion_unidad_id IS NOT NULL
         )
     ) THEN
    RAISE EXCEPTION 'No se puede eliminar: el pedido ya tiene factura, recepcion, stock o parque vinculado';
  END IF;

  -- Los documentos de una importacion conservan su propietario aunque el
  -- pedido comercial que estaba vinculado desaparezca.
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
  'Elimina atomicamente un pedido completo solo antes de factura, recepcion, stock o parque.';

NOTIFY pgrst, 'reload schema';
