-- Aplicar después de 20260917140000. No cambia ATA, chasis, NP ni importes.
BEGIN;

CREATE OR REPLACE FUNCTION public.maquinaria_chasis_unico_en_stock(p_chasis text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
  SELECT public.normalizar_chasis_notificacion(p_chasis) IS NOT NULL
    AND (SELECT count(*) FROM public.parque_stock_maquinas s
      WHERE public.normalizar_chasis_notificacion(s.chasis)=public.normalizar_chasis_notificacion(p_chasis)
        AND s.saldo_actual>0)=1;
$$;

CREATE OR REPLACE FUNCTION public.maquinaria_chasis_confirmado_en_sistema(p_chasis text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
  SELECT public.normalizar_chasis_notificacion(p_chasis) IS NOT NULL
    AND stock.n<=1 AND parque.n<=1 AND (stock.n=1 OR parque.n=1)
  FROM (SELECT count(*) AS n FROM public.parque_stock_maquinas s
    WHERE public.normalizar_chasis_notificacion(s.chasis)=public.normalizar_chasis_notificacion(p_chasis)
      AND s.saldo_actual>0) stock
  CROSS JOIN (SELECT count(*) AS n FROM public.parque_maquinas p
    WHERE public.normalizar_chasis_notificacion(p.serie)=public.normalizar_chasis_notificacion(p_chasis)
      AND p.activo) parque;
$$;
REVOKE ALL ON FUNCTION public.maquinaria_chasis_unico_en_stock(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.maquinaria_chasis_confirmado_en_sistema(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.maquinaria_chasis_unico_en_stock(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.maquinaria_chasis_confirmado_en_sistema(text) TO authenticated;

CREATE OR REPLACE VIEW public.maquinaria_importacion_unidades_operativas
WITH (security_invoker = true) AS
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
    WHEN parque.n>0 OR uo.estado IN ('EN_PARQUE', 'TRANSFERIDA') THEN 'EN_PARQUE'
    WHEN t.estado_disponibilidad IS NOT NULL THEN t.estado_disponibilidad
    WHEN public.normalizar_chasis_notificacion(u.chasis) IS NULL THEN 'SIN_CHASIS'
    ELSE 'SIN_CONCILIAR'
  END AS estado_disponibilidad,
  CASE
    WHEN parque.n>0 OR uo.estado IN ('EN_PARQUE', 'TRANSFERIDA') THEN 'Parque de clientes'
    WHEN t.disponibilidad_detalle IS NOT NULL THEN t.disponibilidad_detalle
    WHEN public.normalizar_chasis_notificacion(u.chasis) IS NOT NULL THEN 'Chasis sin coincidencia en stock o parque'
    ELSE NULL
  END AS disponibilidad_detalle,
  t.sucursal AS stock_sucursal, t.deposito AS stock_deposito, t.saldo_actual AS stock_saldo,
  i.fecha_pedido, i.modelo AS modelo_original,
  i.llave_interna AS llave_interna_general, i.eta AS eta_general,
  i.estado_fuente AS estado_general, i.valor_oc_general, i.alcance_valor_oc,
  i.moneda_oc AS moneda_oc_general, u.moneda_oc, u.valor_oc_manual, u.eta_manual,
  u.valor_factura_proveedor, u.costo_stock_moneda,
  (u.ata IS NOT NULL AND stock.n=1) AS costo_stock_habilitado,
  (SELECT sum(uu.valor_oc) FROM public.maquinaria_importacion_unidades uu
    WHERE uu.importacion_linea_id=i.id AND uu.activa AND uu.moneda_oc=i.moneda_oc) AS valor_oc_asignado_total,
  EXISTS (SELECT 1 FROM public.maquinaria_importacion_unidades uu
    WHERE uu.importacion_linea_id=i.id AND uu.activa AND uu.moneda_oc<>i.moneda_oc) AS oc_monedas_diferentes,
  (stock.n=1) AS stock_fisico_confirmado,
  (parque.n=1) AS parque_confirmado,
  (stock.n>1 OR parque.n>1) AS chasis_ambiguo
FROM public.maquinaria_importacion_unidades u
JOIN public.maquinaria_importacion_lineas i ON i.id=u.importacion_linea_id
LEFT JOIN public.maquinaria_operaciones o ON o.id=u.operacion_id
LEFT JOIN public.maquinaria_operacion_lineas l ON l.id=u.linea_id
LEFT JOIN public.maquinaria_unidades_operacion uo ON uo.id=u.unidad_id
LEFT JOIN public.clientes c ON c.id=o.cliente_id
LEFT JOIN LATERAL (
  SELECT st.* FROM public.maquinaria_stock_trazabilidad st
  WHERE st.unidad_operacion_id=u.unidad_id
     OR st.chasis_normalizado=public.normalizar_chasis_notificacion(u.chasis)
  ORDER BY (st.unidad_operacion_id=u.unidad_id) DESC,
    (st.estado_disponibilidad='CONFLICTO') DESC, st.importado_en DESC LIMIT 1
) t ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS n FROM public.parque_stock_maquinas s
  WHERE public.normalizar_chasis_notificacion(s.chasis)=public.normalizar_chasis_notificacion(u.chasis)
    AND s.saldo_actual>0
) stock ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS n FROM public.parque_maquinas p
  WHERE public.normalizar_chasis_notificacion(p.serie)=public.normalizar_chasis_notificacion(u.chasis)
    AND p.activo
) parque ON true
WHERE u.activa;
GRANT SELECT ON public.maquinaria_importacion_unidades_operativas TO authenticated;

-- Conservar permisos, bloqueos y actualización de la recepción anterior;
-- añadir Parque y excluir filas de stock sin existencia física.
DO $$
DECLARE v_def text;
BEGIN
  v_def:=pg_get_functiondef('public.maquinaria_recibir_unidad_importacion(uuid,date)'::regprocedure);
  IF position('s.saldo_actual>0' IN v_def)=0 THEN
    IF position('public.normalizar_chasis_notificacion(u.chasis);' IN v_def)=0 THEN
      RAISE EXCEPTION 'La recepción cambió; revisar antes de aplicar';
    END IF;
    v_def:=replace(v_def,'public.normalizar_chasis_notificacion(u.chasis);',
      'public.normalizar_chasis_notificacion(u.chasis) AND s.saldo_actual>0;');
  END IF;
  IF position('''parque_confirmado''' IN v_def)=0 THEN
    IF position('''reservada'',v_stock_id IS NOT NULL' IN v_def)=0 THEN
      RAISE EXCEPTION 'La respuesta de recepción cambió; revisar antes de aplicar';
    END IF;
    v_def:=replace(v_def,'''reservada'',v_stock_id IS NOT NULL',
      '''parque_confirmado'', EXISTS (SELECT 1 FROM public.maquinaria_importacion_unidades_operativas v WHERE v.id=u.id AND v.parque_confirmado AND NOT v.chasis_ambiguo), ''reservada'',v_stock_id IS NOT NULL');
  END IF;
  EXECUTE v_def;

  v_def:=pg_get_functiondef('public.maquinaria_iniciar_transito_importacion(uuid)'::regprocedure);
  IF position('maquinaria_chasis_confirmado_en_sistema' IN v_def)=0 THEN
    IF position('IF u.ata IS NOT NULL OR' IN v_def)=0 THEN
      RAISE EXCEPTION 'La transición cambió; revisar antes de aplicar';
    END IF;
    v_def:=replace(v_def,'IF u.ata IS NOT NULL OR',
      'IF public.maquinaria_chasis_confirmado_en_sistema(u.chasis) OR u.ata IS NOT NULL OR');
    EXECUTE v_def;
  END IF;

  v_def:=pg_get_functiondef('public.maquinaria_anular_recepcion_importacion(uuid)'::regprocedure);
  IF position('Chasis registrado en Parque' IN v_def)=0 THEN
    IF position('IF v_importacion.ata IS NULL THEN' IN v_def)=0 THEN
      RAISE EXCEPTION 'La anulación cambió; revisar antes de aplicar';
    END IF;
    v_def:=replace(v_def,'IF v_importacion.ata IS NULL THEN',
      'IF EXISTS (SELECT 1 FROM public.parque_maquinas p WHERE p.activo AND public.normalizar_chasis_notificacion(p.serie)=public.normalizar_chasis_notificacion(v_importacion.chasis)) THEN RAISE EXCEPTION ''Chasis registrado en Parque: no se puede anular la recepción''; END IF; IF v_importacion.ata IS NULL THEN');
    EXECUTE v_def;
  END IF;
END;
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
