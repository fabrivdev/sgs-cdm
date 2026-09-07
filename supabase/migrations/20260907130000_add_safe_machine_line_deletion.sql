-- Permite borrar unidades de importacion y lineas de pedido desde sus detalles.
-- El borrado se detiene cuando ya existe facturacion, recepcion, stock o parque:
-- esos movimientos deben corregirse primero para no perder trazabilidad.

CREATE OR REPLACE FUNCTION public.maquinaria_eliminar_unidad_importacion(
  p_importacion_unidad_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_unidad public.maquinaria_importacion_unidades%ROWTYPE;
  v_cantidad integer;
  v_restantes integer;
BEGIN
  IF NOT public.maquinaria_puede_gestionar_flujo() THEN
    RAISE EXCEPTION 'Solo admin o jefatura pueden eliminar lineas de importacion'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_unidad
  FROM public.maquinaria_importacion_unidades
  WHERE id = p_importacion_unidad_id AND activa
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La unidad de importacion ya no existe';
  END IF;

  SELECT cantidad INTO v_cantidad
  FROM public.maquinaria_importacion_lineas
  WHERE id = v_unidad.importacion_linea_id
  FOR UPDATE;

  IF v_unidad.ata IS NOT NULL
     OR nullif(btrim(v_unidad.invoice_supplier), '') IS NOT NULL
     OR v_unidad.factura_proveedor_fecha IS NOT NULL
     OR v_unidad.costo_final_sin_iva IS NOT NULL
     OR v_unidad.costo_final IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM public.maquinaria_factura_importacion_unidades fiu
       WHERE fiu.importacion_unidad_id = v_unidad.id
     )
     OR EXISTS (
       SELECT 1 FROM public.maquinaria_documentos d
       WHERE d.importacion_linea_id = v_unidad.importacion_linea_id
         AND d.tipo = 'FACTURA_IMPORTACION'
     )
     OR EXISTS (
       SELECT 1 FROM public.maquinaria_unidades_operacion uo
       WHERE uo.id = v_unidad.unidad_id
         AND (
           uo.estado <> 'PENDIENTE'
           OR uo.valor_facturado IS NOT NULL
           OR uo.parque_maquina_id IS NOT NULL
         )
     )
     OR EXISTS (
       SELECT 1 FROM public.parque_stock_maquinas s
       WHERE s.unidad_operacion_id = v_unidad.unidad_id
     )
     OR EXISTS (
       SELECT 1 FROM public.parque_maquinas p
       WHERE public.normalizar_chasis_notificacion(p.serie)
         = public.normalizar_chasis_notificacion(v_unidad.chasis)
         AND public.normalizar_chasis_notificacion(v_unidad.chasis) IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'No se puede eliminar: la unidad ya tiene factura, recepcion, stock o parque vinculado';
  END IF;

  IF greatest(coalesce(v_cantidad, 1), 1) = 1 THEN
    DELETE FROM public.maquinaria_importacion_lineas
    WHERE id = v_unidad.importacion_linea_id;

    RETURN jsonb_build_object(
      'linea_eliminada', true,
      'unidades_restantes', 0
    );
  END IF;

  -- Primero baja la cantidad para que el sincronizador desactive el ultimo
  -- numero; despues elimina la unidad elegida y compacta las restantes.
  UPDATE public.maquinaria_importacion_lineas
  SET cantidad = greatest(v_cantidad - 1, 1), actualizado_en = now()
  WHERE id = v_unidad.importacion_linea_id;

  DELETE FROM public.maquinaria_importacion_unidades
  WHERE id = v_unidad.id;

  UPDATE public.maquinaria_importacion_unidades
  SET numero_unidad = numero_unidad + 1000
  WHERE importacion_linea_id = v_unidad.importacion_linea_id;

  WITH ordenadas AS (
    SELECT id, row_number() OVER (ORDER BY numero_unidad)::integer AS nuevo_numero
    FROM public.maquinaria_importacion_unidades
    WHERE importacion_linea_id = v_unidad.importacion_linea_id
  )
  UPDATE public.maquinaria_importacion_unidades u
  SET numero_unidad = ordenadas.nuevo_numero,
      activa = ordenadas.nuevo_numero <= greatest(v_cantidad - 1, 1),
      actualizado_en = now()
  FROM ordenadas
  WHERE u.id = ordenadas.id;

  SELECT count(*) INTO v_restantes
  FROM public.maquinaria_importacion_unidades
  WHERE importacion_linea_id = v_unidad.importacion_linea_id AND activa;

  RETURN jsonb_build_object(
    'linea_eliminada', false,
    'unidades_restantes', v_restantes
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.maquinaria_eliminar_linea_pedido(
  p_linea_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_operacion_id uuid;
  v_estado text;
  v_total_lineas integer;
BEGIN
  IF NOT public.maquinaria_puede_gestionar_flujo() THEN
    RAISE EXCEPTION 'Solo admin o jefatura pueden eliminar lineas de pedido'
      USING ERRCODE = '42501';
  END IF;

  SELECT l.operacion_id, o.estado
  INTO v_operacion_id, v_estado
  FROM public.maquinaria_operacion_lineas l
  JOIN public.maquinaria_operaciones o ON o.id = l.operacion_id
  WHERE l.id = p_linea_id
  FOR UPDATE OF l, o;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La linea de pedido ya no existe';
  END IF;

  SELECT count(*) INTO v_total_lineas
  FROM public.maquinaria_operacion_lineas
  WHERE operacion_id = v_operacion_id;

  IF v_estado IN ('FACTURADA', 'CERRADA')
     OR (
       v_total_lineas = 1
       AND EXISTS (
         SELECT 1 FROM public.maquinaria_documentos d
         WHERE d.operacion_id = v_operacion_id AND d.tipo = 'FACTURA_VENTA'
       )
     )
     OR EXISTS (
       SELECT 1
       FROM public.maquinaria_unidades_operacion u
       LEFT JOIN public.parque_stock_maquinas s ON s.unidad_operacion_id = u.id
       LEFT JOIN public.maquinaria_importacion_unidades iu ON iu.unidad_id = u.id
       LEFT JOIN public.maquinaria_factura_importacion_unidades fiu
         ON fiu.importacion_unidad_id = iu.id
       WHERE u.linea_id = p_linea_id
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
    RAISE EXCEPTION 'No se puede eliminar: la linea ya tiene factura, recepcion, stock o parque vinculado';
  END IF;

  IF v_total_lineas = 1 THEN
    -- Los documentos propios de una importacion conservan ese propietario,
    -- aunque desaparezca el pedido que estaba vinculado.
    UPDATE public.maquinaria_documentos
    SET operacion_id = NULL, actualizado_en = now()
    WHERE operacion_id = v_operacion_id
      AND importacion_linea_id IS NOT NULL;

    DELETE FROM public.maquinaria_operaciones WHERE id = v_operacion_id;
    RETURN jsonb_build_object('pedido_eliminado', true);
  END IF;

  DELETE FROM public.maquinaria_operacion_lineas WHERE id = p_linea_id;

  UPDATE public.maquinaria_operacion_lineas
  SET linea_numero = linea_numero + 1000
  WHERE operacion_id = v_operacion_id;

  WITH ordenadas AS (
    SELECT id, row_number() OVER (ORDER BY linea_numero, id)::integer AS nuevo_numero
    FROM public.maquinaria_operacion_lineas
    WHERE operacion_id = v_operacion_id
  )
  UPDATE public.maquinaria_operacion_lineas l
  SET linea_numero = ordenadas.nuevo_numero,
      actualizado_en = now()
  FROM ordenadas
  WHERE l.id = ordenadas.id;

  UPDATE public.maquinaria_operaciones
  SET actualizado_en = now()
  WHERE id = v_operacion_id;

  RETURN jsonb_build_object('pedido_eliminado', false);
END;
$$;

REVOKE ALL ON FUNCTION public.maquinaria_eliminar_unidad_importacion(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.maquinaria_eliminar_linea_pedido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maquinaria_eliminar_unidad_importacion(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.maquinaria_eliminar_linea_pedido(uuid) TO authenticated;

COMMENT ON FUNCTION public.maquinaria_eliminar_unidad_importacion(uuid) IS
  'Elimina una unidad o su linea completa solo antes de factura, recepcion, stock o parque.';
COMMENT ON FUNCTION public.maquinaria_eliminar_linea_pedido(uuid) IS
  'Elimina una linea de pedido sin trazabilidad; si era la ultima, elimina el pedido completo.';
