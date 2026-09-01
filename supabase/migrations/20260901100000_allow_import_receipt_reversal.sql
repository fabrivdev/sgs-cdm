-- Cada maquina fisica es la fuente de verdad de sus datos variables. El
-- fallback a la cabecera impedia borrar ETA, chasis, arribo, factura o costos:
-- al guardar NULL, la vista volvia a mostrar el valor viejo de la cabecera.
CREATE OR REPLACE VIEW public.maquinaria_importacion_unidades_operativas
WITH (security_invoker = true)
AS
SELECT
  u.id, i.id AS importacion_linea_id, u.numero_unidad, i.cantidad AS cantidad_lote,
  1::integer AS cantidad, u.activa, i.source_id, i.source_row, i.source_sheet,
  i.datos_fuente, i.llave_interna, i.prioridad,
  coalesce(o.np_numero, i.np_numero) AS np_numero,
  i.proveedor, coalesce(l.subgrupo::text, i.producto) AS producto, i.modelo,
  u.estado_fuente,
  i.oc, i.po, u.eta,
  i.transporte, u.invoice_supplier,
  u.factura_proveedor_fecha, u.factura_proveedor_moneda,
  i.tipo_cambio, i.precio_oc, i.descuentos, i.precio_teorico_oc,
  i.producto_facturado, i.diferencia, i.descuento_especial,
  i.flete_seguro, i.proveedor_flete, i.origen, i.destino, i.notas,
  u.ata,
  u.costo_final_sin_iva,
  u.costo_final,
  u.chasis,
  i.venta_facturada, i.factura_venta, i.valor_venta, i.utilidad,
  i.margen_porcentaje, u.operacion_id, u.linea_id, u.unidad_id,
  u.situacion_vinculo, u.vinculo_manual, u.detalle_manual,
  i.creado_en, u.actualizado_en,
  coalesce(l.marca, i.marca_importacion)::text AS marca,
  coalesce(c.nombre, o.cliente_nombre) AS cliente_nombre,
  o.np_fecha, o.comercial,
  t.estado_disponibilidad, t.disponibilidad_detalle,
  t.sucursal AS stock_sucursal, t.deposito AS stock_deposito,
  t.saldo_actual AS stock_saldo,
  i.fecha_pedido
FROM public.maquinaria_importacion_unidades u
JOIN public.maquinaria_importacion_lineas i ON i.id = u.importacion_linea_id
LEFT JOIN public.maquinaria_operaciones o ON o.id = u.operacion_id
LEFT JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
LEFT JOIN public.clientes c ON c.id = o.cliente_id
LEFT JOIN LATERAL (
  SELECT st.* FROM public.maquinaria_stock_trazabilidad st
  WHERE st.unidad_operacion_id = u.unidad_id
     OR (st.unidad_operacion_id IS NULL
         AND st.chasis_normalizado = public.normalizar_chasis_notificacion(u.chasis))
  ORDER BY (st.unidad_operacion_id = u.unidad_id) DESC,
    (st.estado_disponibilidad = 'CONFLICTO') DESC, st.importado_en DESC
  LIMIT 1
) t ON true
WHERE u.activa;

GRANT SELECT ON public.maquinaria_importacion_unidades_operativas TO authenticated;

-- Revierte una recepcion equivocada sin borrar documentos ni la vinculacion
-- comercial. Si el chasis ya fue confirmado por el stock del sistema, se
-- bloquea: primero debe corregirse esa evidencia fisica.
CREATE OR REPLACE FUNCTION public.maquinaria_anular_recepcion_importacion(
  p_importacion_unidad_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_importacion public.maquinaria_importacion_unidades%ROWTYPE;
  v_unidad_estado text;
  v_stock_id uuid;
  v_estado_restaurado text;
BEGIN
  IF NOT public.maquinaria_puede_gestionar_flujo() THEN
    RAISE EXCEPTION 'Solo admin o jefatura pueden anular recepciones'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_importacion
  FROM public.maquinaria_importacion_unidades
  WHERE id = p_importacion_unidad_id AND activa
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'La unidad importada no existe'; END IF;
  IF v_importacion.ata IS NULL THEN
    RAISE EXCEPTION 'La unidad no tiene una recepcion registrada';
  END IF;

  SELECT s.id INTO v_stock_id
  FROM public.parque_stock_maquinas s
  WHERE (v_importacion.unidad_id IS NOT NULL
         AND s.unidad_operacion_id = v_importacion.unidad_id)
     OR (public.normalizar_chasis_notificacion(v_importacion.chasis) IS NOT NULL
         AND public.normalizar_chasis_notificacion(s.chasis)
           = public.normalizar_chasis_notificacion(v_importacion.chasis))
  LIMIT 1;

  IF v_stock_id IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede anular: el chasis ya esta confirmado en stock. Corregi primero el registro fisico de stock';
  END IF;

  IF v_importacion.unidad_id IS NOT NULL THEN
    SELECT estado INTO v_unidad_estado
    FROM public.maquinaria_unidades_operacion
    WHERE id = v_importacion.unidad_id
    FOR UPDATE;

    IF v_unidad_estado IN ('FACTURADA', 'EN_PARQUE', 'TRANSFERIDA') THEN
      RAISE EXCEPTION 'No se puede anular: la maquina vinculada ya esta facturada o entregada';
    END IF;
  END IF;

  v_estado_restaurado := CASE
    WHEN v_importacion.eta IS NOT NULL AND v_importacion.eta <= current_date
      THEN 'EN_TRANSITO'
    ELSE 'PLANIFICADA'
  END;

  UPDATE public.maquinaria_importacion_unidades
  SET ata = NULL,
      chasis = NULL,
      estado_fuente = v_estado_restaurado,
      situacion_vinculo = CASE
        WHEN unidad_id IS NOT NULL THEN 'PEDIDO VINCULADO'
        ELSE 'SIN PEDIDO'
      END,
      detalle_manual = true,
      actualizado_en = now()
  WHERE id = v_importacion.id;

  -- El chasis pudo haberse copiado al pedido al vincular la importacion. Solo
  -- se libera si sigue siendo exactamente el mismo y la unidad aun esta en
  -- una etapa reversible.
  IF v_importacion.unidad_id IS NOT NULL THEN
    UPDATE public.maquinaria_unidades_operacion
    SET chasis = NULL,
        estado = CASE WHEN estado = 'EN_TRANSITO' THEN 'PENDIENTE' ELSE estado END,
        actualizado_en = now()
    WHERE id = v_importacion.unidad_id
      AND estado IN ('PENDIENTE', 'EN_TRANSITO')
      AND public.normalizar_chasis_notificacion(chasis)
        = public.normalizar_chasis_notificacion(v_importacion.chasis);
  END IF;

  IF v_importacion.operacion_id IS NOT NULL THEN
    UPDATE public.maquinaria_importaciones_operativas
    SET estado = 'EN_TRANSITO', actualizado_en = now()
    WHERE operacion_id = v_importacion.operacion_id
      AND estado NOT IN ('CANCELADA');

    UPDATE public.maquinaria_operaciones
    SET estado = CASE
          WHEN estado IN ('FACTURADA', 'CERRADA', 'CANCELADA') THEN estado
          ELSE 'EN_IMPORTACION'
        END,
        actualizado_en = now()
    WHERE id = v_importacion.operacion_id;
  END IF;

  RETURN jsonb_build_object(
    'importacion_unidad_id', v_importacion.id,
    'fecha_anulada', v_importacion.ata,
    'chasis_liberado', v_importacion.chasis,
    'estado', v_estado_restaurado,
    'pedido_vinculado', v_importacion.unidad_id IS NOT NULL
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.maquinaria_anular_recepcion_importacion(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maquinaria_anular_recepcion_importacion(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.maquinaria_anular_recepcion_importacion(uuid) IS
  'Anula un arribo no confirmado en stock, libera el chasis y conserva documentos y vinculo comercial.';

NOTIFY pgrst, 'reload schema';
