-- Alinea el criterio de deteccion de stock de la vista de Importacion al
-- que ya usa la de Pedidos: match por chasis, sin exigir que el stock este
-- libre. Solo lectura (una vista) -- no toca parque_stock_maquinas, no toca
-- maquinaria_importacion_unidades.unidad_id, no dispara ningun trigger de
-- reserva ni de vinculo.
--
-- Motivo: importacion y venta son procesos independientes que se cruzan por
-- chasis (una maquina puede importarse a stock sin comprador definido y
-- venderse despues, sin que la importacion "sepa" del pedido). La vista
-- exigia que el stock estuviera reservado exactamente para la unidad
-- vinculada de ESTA importacion, o completamente libre -- si el stock ya
-- estaba reservado por un pedido ajeno a la importacion (caso normal, no un
-- error), la vista no encontraba nada y mostraba "Sin conciliar" en vez del
-- estado real de la maquina.
--
-- Cambio: se quita "AND st.unidad_operacion_id IS NULL" de la segunda
-- condicion del WHERE, dejando el match por chasis sin esa exigencia. La
-- primera condicion (match exacto por unidad_id) NO se reemplaza, se
-- mantiene tal cual -- sigue cubriendo el caso de una importacion si
-- vinculada con reserva propia. El ORDER BY / LIMIT 1 que resuelve chasis
-- duplicado (CONFLICTO) tampoco cambia.

CREATE OR REPLACE VIEW public.maquinaria_importacion_unidades_operativas
WITH (security_invoker = true)
AS
SELECT
  u.id, i.id AS importacion_linea_id, u.numero_unidad, i.cantidad AS cantidad_lote,
  1::integer AS cantidad, u.activa, i.source_id, i.source_row, i.source_sheet, i.datos_fuente,
  i.llave_interna, i.prioridad, coalesce(o.np_numero, i.np_numero) AS np_numero,
  coalesce(i.marca_nombre, nullif(i.proveedor, 'OTROS')) AS proveedor,
  coalesce(l.subgrupo::text, i.subgrupo::text, i.producto) AS producto,
  i.modelo, u.estado_fuente, i.oc, i.po, u.eta, i.transporte, u.invoice_supplier,
  u.factura_proveedor_fecha, u.factura_proveedor_moneda, i.tipo_cambio, i.precio_oc,
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
  i.fecha_pedido
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

NOTIFY pgrst, 'reload schema';
