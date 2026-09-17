-- La llegada física es independiente de la NP que reserva la máquina.
-- Aplicar después de 20260917130000. No cambia chasis, NP, fechas ni importes.
BEGIN;

CREATE OR REPLACE FUNCTION public.maquinaria_chasis_unico_en_stock(p_chasis text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
  SELECT public.normalizar_chasis_notificacion(p_chasis) IS NOT NULL
    AND (SELECT count(*) FROM public.parque_stock_maquinas s
      WHERE public.normalizar_chasis_notificacion(s.chasis)=public.normalizar_chasis_notificacion(p_chasis))=1;
$$;
REVOKE ALL ON FUNCTION public.maquinaria_chasis_unico_en_stock(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.maquinaria_chasis_unico_en_stock(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.maquinaria_validar_costo_arribado()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND (NEW.costo_final IS DISTINCT FROM OLD.costo_final
    OR NEW.costo_final_sin_iva IS DISTINCT FROM OLD.costo_final_sin_iva
    OR NEW.costo_stock_moneda IS DISTINCT FROM OLD.costo_stock_moneda)
    AND (NEW.ata IS NULL OR NOT public.maquinaria_chasis_unico_en_stock(NEW.chasis)) THEN
    RAISE EXCEPTION 'El costo definitivo requiere arribo registrado y chasis único confirmado en stock';
  END IF;
  RETURN NEW;
END;
$$;

-- El guard anterior también contaba cualquier otro chasis ligado a la NP.
-- Se cambia solo la condición física y se conservan los controles de permisos/importes.
DO $$
DECLARE v_def text; v_old text := $old$(SELECT count(*) FROM public.parque_stock_maquinas s
       WHERE (s.unidad_operacion_id = NEW.unidad_id
           OR public.normalizar_chasis_notificacion(s.chasis) = public.normalizar_chasis_notificacion(NEW.chasis))
         AND public.normalizar_chasis_notificacion(s.chasis) IS NOT NULL) <> 1$old$;
BEGIN
  v_def:=pg_get_functiondef('public.maquinaria_validar_datos_unidad_importacion()'::regprocedure);
  IF position(v_old IN v_def)>0 THEN
    EXECUTE replace(v_def,v_old,'NOT public.maquinaria_chasis_unico_en_stock(NEW.chasis)');
  ELSIF position('NOT public.maquinaria_chasis_unico_en_stock(NEW.chasis)' IN v_def)=0 THEN
    RAISE EXCEPTION 'El guard de importaciones cambió; revisar antes de aplicar';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.maquinaria_recibir_unidad_importacion(p_importacion_unidad_id uuid,p_fecha date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u public.maquinaria_importacion_unidades%ROWTYPE; v_stock_id uuid; v_stock_count integer;
BEGIN
  IF NOT public.maquinaria_puede_gestionar_flujo() THEN
    RAISE EXCEPTION 'Solo admin o jefatura pueden recibir importaciones' USING ERRCODE='42501';
  END IF;
  IF p_fecha IS NULL OR p_fecha>current_date THEN RAISE EXCEPTION 'La fecha de arribo es obligatoria y no puede ser futura'; END IF;
  PERFORM 1 FROM public.maquinaria_importacion_lineas
    WHERE id=(SELECT importacion_linea_id FROM public.maquinaria_importacion_unidades WHERE id=p_importacion_unidad_id)
    FOR UPDATE;
  SELECT * INTO u FROM public.maquinaria_importacion_unidades WHERE id=p_importacion_unidad_id AND activa FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La unidad importada no existe'; END IF;
  IF upper(coalesce(u.estado_fuente,'')) LIKE '%CANCEL%' THEN RAISE EXCEPTION 'La unidad está cancelada'; END IF;
  IF public.normalizar_chasis_notificacion(u.chasis) IS NULL THEN RAISE EXCEPTION 'Cargá el chasis antes de registrar el arribo'; END IF;

  -- Confirma solo la coincidencia física exacta y única, nunca otro chasis
  -- meramente relacionado con la misma NP.
  SELECT count(*),min(s.id::text)::uuid INTO v_stock_count,v_stock_id
    FROM public.parque_stock_maquinas s
    WHERE public.normalizar_chasis_notificacion(s.chasis)=public.normalizar_chasis_notificacion(u.chasis);
  IF v_stock_count<>1 THEN v_stock_id:=NULL; END IF;
  UPDATE public.maquinaria_importacion_unidades
    SET ata=p_fecha,estado_fuente='ARRIBADA',detalle_manual=true,actualizado_en=now() WHERE id=u.id;
  IF u.operacion_id IS NOT NULL THEN
    UPDATE public.maquinaria_importaciones_operativas
    SET estado=CASE WHEN NOT EXISTS (
      SELECT 1 FROM public.maquinaria_importacion_unidades pendiente
      WHERE pendiente.operacion_id=u.operacion_id AND pendiente.activa AND pendiente.ata IS NULL
    ) THEN 'RECIBIDA' ELSE 'EN_TRANSITO' END,actualizado_en=now()
    WHERE operacion_id=u.operacion_id;
  END IF;
  RETURN jsonb_build_object('importacion_unidad_id',u.id,'stock_id',v_stock_id,
    'unidad_operacion_id',u.unidad_id,'stock_confirmado',v_stock_id IS NOT NULL,
    'reservada',v_stock_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.parque_stock_maquinas s WHERE s.id=v_stock_id AND s.unidad_operacion_id IS NOT NULL));
END;
$$;
REVOKE ALL ON FUNCTION public.maquinaria_recibir_unidad_importacion(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.maquinaria_recibir_unidad_importacion(uuid,date) TO authenticated;


CREATE OR REPLACE VIEW public.maquinaria_importacion_unidades_operativas
WITH (security_invoker = true)
AS
SELECT
  u.id, i.id AS importacion_linea_id, u.numero_unidad, i.cantidad AS cantidad_lote,
  1::integer AS cantidad, u.activa, i.source_id, i.source_row, i.source_sheet, i.datos_fuente,
  u.llave_interna, i.prioridad, coalesce(o.np_numero, i.np_numero) AS np_numero,
  coalesce(i.marca_nombre, nullif(i.proveedor, 'OTROS')) AS proveedor,
  coalesce(l.subgrupo::text, i.subgrupo::text, i.producto) AS producto,
  coalesce(nullif(btrim(l.modelo), ''), i.modelo) AS modelo,
  u.estado_fuente, i.oc, i.po, u.eta, i.transporte, u.invoice_supplier,
  u.factura_proveedor_fecha, u.factura_proveedor_moneda, i.tipo_cambio, u.valor_oc AS precio_oc,
  i.descuentos, i.precio_teorico_oc, i.producto_facturado, i.diferencia,
  i.descuento_especial, i.flete_seguro, i.proveedor_flete, i.origen, i.destino, i.notas,
  u.ata, u.costo_final_sin_iva, u.costo_final, u.chasis, i.venta_facturada,
  i.factura_venta, i.valor_venta, i.utilidad, i.margen_porcentaje, u.operacion_id,
  u.linea_id, u.unidad_id, u.situacion_vinculo, u.vinculo_manual, u.detalle_manual,
  i.creado_en, u.actualizado_en,
  coalesce(l.marca_nombre, i.marca_nombre, nullif(l.marca::text, 'OTROS'),
    nullif(i.marca_importacion::text, 'OTROS'), nullif(upper(btrim(i.proveedor)), 'OTROS')) AS marca,
  coalesce(c.nombre, o.cliente_nombre) AS cliente_nombre, o.np_fecha, o.comercial,
  CASE
    WHEN parque.id IS NOT NULL OR uo.estado IN ('EN_PARQUE', 'TRANSFERIDA') THEN 'EN_PARQUE'
    WHEN t.estado_disponibilidad IS NOT NULL THEN t.estado_disponibilidad
    WHEN public.normalizar_chasis_notificacion(u.chasis) IS NULL THEN 'SIN_CHASIS'
    ELSE 'SIN_CONCILIAR'
  END AS estado_disponibilidad,
  CASE
    WHEN parque.id IS NOT NULL OR uo.estado IN ('EN_PARQUE', 'TRANSFERIDA') THEN 'Parque de clientes'
    WHEN t.disponibilidad_detalle IS NOT NULL THEN t.disponibilidad_detalle
    WHEN public.normalizar_chasis_notificacion(u.chasis) IS NOT NULL THEN 'Chasis sin coincidencia en stock o parque'
    ELSE NULL
  END AS disponibilidad_detalle,
  t.sucursal AS stock_sucursal, t.deposito AS stock_deposito, t.saldo_actual AS stock_saldo,
  i.fecha_pedido,
  i.modelo AS modelo_original,
  i.llave_interna AS llave_interna_general, i.eta AS eta_general,
  i.estado_fuente AS estado_general, i.valor_oc_general, i.alcance_valor_oc,
  i.moneda_oc AS moneda_oc_general, u.moneda_oc, u.valor_oc_manual, u.eta_manual,
  u.valor_factura_proveedor, u.costo_stock_moneda,
  (u.ata IS NOT NULL AND public.maquinaria_chasis_unico_en_stock(u.chasis)) AS costo_stock_habilitado,
  (SELECT sum(uu.valor_oc) FROM public.maquinaria_importacion_unidades uu
    WHERE uu.importacion_linea_id=i.id AND uu.activa AND uu.moneda_oc=i.moneda_oc) AS valor_oc_asignado_total,
  EXISTS (SELECT 1 FROM public.maquinaria_importacion_unidades uu
    WHERE uu.importacion_linea_id=i.id AND uu.activa AND uu.moneda_oc<>i.moneda_oc) AS oc_monedas_diferentes,
  (u.ata IS NOT NULL AND public.maquinaria_chasis_unico_en_stock(u.chasis)) AS stock_fisico_confirmado
FROM public.maquinaria_importacion_unidades u
JOIN public.maquinaria_importacion_lineas i ON i.id = u.importacion_linea_id
LEFT JOIN public.maquinaria_operaciones o ON o.id = u.operacion_id
LEFT JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
LEFT JOIN public.maquinaria_unidades_operacion uo ON uo.id = u.unidad_id
LEFT JOIN public.clientes c ON c.id = o.cliente_id
LEFT JOIN LATERAL (
  SELECT st.* FROM public.maquinaria_stock_trazabilidad st
  WHERE st.unidad_operacion_id = u.unidad_id
     OR st.chasis_normalizado = public.normalizar_chasis_notificacion(u.chasis)
  ORDER BY (st.unidad_operacion_id = u.unidad_id) DESC,
    (st.estado_disponibilidad = 'CONFLICTO') DESC, st.importado_en DESC LIMIT 1
) t ON true
LEFT JOIN LATERAL (
  SELECT p.id FROM public.parque_maquinas p
  WHERE public.normalizar_chasis_notificacion(p.serie) = public.normalizar_chasis_notificacion(u.chasis)
  ORDER BY p.actualizado_en DESC NULLS LAST, p.id LIMIT 1
) parque ON true
WHERE u.activa;



GRANT SELECT ON public.maquinaria_importacion_unidades_operativas TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Control del caso informado. No requiere modificar ni volver a recibir la unidad.
SELECT oc,llave_interna,chasis,ata,np_numero,estado_disponibilidad,
  stock_fisico_confirmado,costo_stock_habilitado,
  CASE WHEN upper(coalesce(estado_fuente,'')) LIKE '%CANCEL%' THEN 'Cancelado'
    WHEN stock_fisico_confirmado THEN 'Completado'
    WHEN ata IS NOT NULL THEN 'Arribado'
    ELSE estado_fuente END AS estado_llegada
FROM public.maquinaria_importacion_unidades_operativas
WHERE public.normalizar_chasis_notificacion(chasis)='AFCG009694';

