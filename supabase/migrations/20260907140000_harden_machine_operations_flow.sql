-- Endurece el flujo de operaciones/importaciones luego de la revision integral:
-- 1) una unidad borrada manualmente no reaparece al sincronizar el maestro;
-- 2) los pedidos historicos concluidos no vuelven a ofrecerse para vincular;
-- 3) la lista expone valor y moneda vigentes sin mezclar monedas.

ALTER TABLE public.maquinaria_importacion_unidades
  ADD COLUMN IF NOT EXISTS eliminada_manualmente boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.maquinaria_sincronizar_unidades_importacion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cantidad integer := greatest(coalesce(NEW.cantidad, 1), 1);
BEGIN
  INSERT INTO public.maquinaria_importacion_unidades (
    importacion_linea_id, numero_unidad, chasis, estado_fuente, eta, ata,
    invoice_supplier, costo_final_sin_iva, costo_final
  )
  SELECT
    NEW.id, n, CASE WHEN n = 1 THEN NEW.chasis END,
    NEW.estado_fuente, NEW.eta, NEW.ata, NEW.invoice_supplier,
    NEW.costo_final_sin_iva, NEW.costo_final
  FROM generate_series(1, v_cantidad) AS n
  ON CONFLICT (importacion_linea_id, numero_unidad) DO UPDATE
  SET activa = NOT maquinaria_importacion_unidades.eliminada_manualmente,
      estado_fuente = CASE WHEN maquinaria_importacion_unidades.detalle_manual
        THEN maquinaria_importacion_unidades.estado_fuente ELSE EXCLUDED.estado_fuente END,
      eta = CASE WHEN maquinaria_importacion_unidades.detalle_manual
        THEN maquinaria_importacion_unidades.eta ELSE EXCLUDED.eta END,
      ata = CASE WHEN maquinaria_importacion_unidades.detalle_manual
        THEN maquinaria_importacion_unidades.ata ELSE EXCLUDED.ata END,
      invoice_supplier = CASE WHEN maquinaria_importacion_unidades.detalle_manual
        THEN maquinaria_importacion_unidades.invoice_supplier ELSE EXCLUDED.invoice_supplier END,
      costo_final_sin_iva = CASE WHEN maquinaria_importacion_unidades.detalle_manual
        THEN maquinaria_importacion_unidades.costo_final_sin_iva ELSE EXCLUDED.costo_final_sin_iva END,
      costo_final = CASE WHEN maquinaria_importacion_unidades.detalle_manual
        THEN maquinaria_importacion_unidades.costo_final ELSE EXCLUDED.costo_final END,
      chasis = CASE
        WHEN maquinaria_importacion_unidades.detalle_manual
          OR maquinaria_importacion_unidades.vinculo_manual
          OR EXCLUDED.numero_unidad <> 1
        THEN maquinaria_importacion_unidades.chasis
        ELSE coalesce(EXCLUDED.chasis, maquinaria_importacion_unidades.chasis)
      END,
      actualizado_en = now();

  UPDATE public.maquinaria_importacion_unidades u
  SET activa = false, actualizado_en = now()
  WHERE u.importacion_linea_id = NEW.id
    AND u.numero_unidad > v_cantidad
    AND NOT u.eliminada_manualmente
    AND u.unidad_id IS NULL
    AND public.normalizar_chasis_notificacion(u.chasis) IS NULL
    AND u.invoice_supplier IS NULL
    AND u.ata IS NULL;

  RETURN NEW;
END;
$$;

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
  v_activas integer;
  v_ultima_id uuid;
  v_ultimo_numero integer;
  v_numero_eliminado integer;
BEGIN
  IF NOT public.maquinaria_puede_gestionar_flujo() THEN
    RAISE EXCEPTION 'Solo admin o jefatura pueden eliminar lineas de importacion'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_unidad
  FROM public.maquinaria_importacion_unidades
  WHERE id = p_importacion_unidad_id AND activa
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La unidad de importacion ya no existe'; END IF;

  SELECT cantidad INTO v_cantidad
  FROM public.maquinaria_importacion_lineas
  WHERE id = v_unidad.importacion_linea_id
  FOR UPDATE;

  IF v_unidad.ata IS NOT NULL
     OR nullif(btrim(v_unidad.invoice_supplier), '') IS NOT NULL
     OR v_unidad.factura_proveedor_fecha IS NOT NULL
     OR v_unidad.costo_final_sin_iva IS NOT NULL
     OR v_unidad.costo_final IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.maquinaria_factura_importacion_unidades f WHERE f.importacion_unidad_id = v_unidad.id)
     OR EXISTS (SELECT 1 FROM public.maquinaria_documentos d WHERE d.importacion_linea_id = v_unidad.importacion_linea_id AND d.tipo = 'FACTURA_IMPORTACION')
     OR EXISTS (
       SELECT 1 FROM public.maquinaria_unidades_operacion u
       WHERE u.id = v_unidad.unidad_id
         AND (u.estado <> 'PENDIENTE' OR u.valor_facturado IS NOT NULL OR u.parque_maquina_id IS NOT NULL)
     )
     OR EXISTS (SELECT 1 FROM public.parque_stock_maquinas s WHERE s.unidad_operacion_id = v_unidad.unidad_id)
     OR EXISTS (
       SELECT 1 FROM public.parque_maquinas p
       WHERE public.normalizar_chasis_notificacion(p.serie) = public.normalizar_chasis_notificacion(v_unidad.chasis)
         AND public.normalizar_chasis_notificacion(v_unidad.chasis) IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'No se puede eliminar: la unidad ya tiene factura, recepcion, stock o parque vinculado';
  END IF;

  SELECT count(*)::integer INTO v_activas
  FROM public.maquinaria_importacion_unidades
  WHERE importacion_linea_id = v_unidad.importacion_linea_id AND activa;

  IF v_activas <= 1 THEN
    DELETE FROM public.maquinaria_importacion_lineas WHERE id = v_unidad.importacion_linea_id;
    RETURN jsonb_build_object('linea_eliminada', true, 'unidades_restantes', 0);
  END IF;

  v_numero_eliminado := v_unidad.numero_unidad;
  SELECT id, numero_unidad INTO v_ultima_id, v_ultimo_numero
  FROM public.maquinaria_importacion_unidades
  WHERE importacion_linea_id = v_unidad.importacion_linea_id
    AND activa AND id <> v_unidad.id
  ORDER BY numero_unidad DESC
  LIMIT 1
  FOR UPDATE;

  -- Guarda una tumba en el ultimo numero del lote. Asi futuras cargas del
  -- mismo maestro no recrean la unidad que el usuario elimino.
  UPDATE public.maquinaria_importacion_unidades
  SET numero_unidad = 1000000 + numero_unidad,
      activa = false,
      eliminada_manualmente = true,
      operacion_id = NULL,
      linea_id = NULL,
      unidad_id = NULL,
      situacion_vinculo = 'SIN PEDIDO',
      vinculo_manual = false,
      actualizado_en = now()
  WHERE id = v_unidad.id;

  IF v_ultimo_numero <> v_numero_eliminado THEN
    UPDATE public.maquinaria_importacion_unidades
    SET numero_unidad = v_numero_eliminado, actualizado_en = now()
    WHERE id = v_ultima_id;
  END IF;

  UPDATE public.maquinaria_importacion_unidades
  SET numero_unidad = v_activas, actualizado_en = now()
  WHERE id = v_unidad.id;

  UPDATE public.maquinaria_importacion_lineas
  SET cantidad = v_activas - 1,
      operacion_id = CASE WHEN unidad_id = v_unidad.unidad_id THEN NULL ELSE operacion_id END,
      linea_id = CASE WHEN unidad_id = v_unidad.unidad_id THEN NULL ELSE linea_id END,
      unidad_id = CASE WHEN unidad_id = v_unidad.unidad_id THEN NULL ELSE unidad_id END,
      actualizado_en = now()
  WHERE id = v_unidad.importacion_linea_id;

  RETURN jsonb_build_object('linea_eliminada', false, 'unidades_restantes', v_activas - 1);
END;
$$;

DROP VIEW IF EXISTS public.maquinaria_pedidos_lineas_estado_actual;

CREATE OR REPLACE VIEW public.maquinaria_pedidos_lineas_operativas
WITH (security_invoker = true)
AS
SELECT
  coalesce(u.id, l.id) AS id, l.id AS linea_id, o.id AS operacion_id, o.np_numero, o.np_fecha,
  coalesce(c.nombre, o.cliente_nombre, 'Cliente por validar') AS cliente_nombre, o.comercial, l.linea_numero,
  coalesce(l.marca_nombre, nullif(l.marca::text, 'OTROS')) AS marca,
  l.producto, l.modelo, CASE WHEN u.id IS NOT NULL THEN 1 ELSE l.cantidad END AS cantidad,
  l.condicion, l.abastecimiento,
  coalesce(nullif(l.datos_extraidos->'historico_pedido'->>'estado', ''), nullif(l.datos_extraidos->>'estado_fuente', ''), o.estado) AS estado_fuente,
  u.id AS unidad_id, u.chasis, u.valor_facturado, u.moneda,
  t.estado_disponibilidad, t.disponibilidad_detalle,
  mi.id AS importacion_linea_id, mi.estado_fuente AS estado_importacion_fuente, mi.eta, mi.ata, mi.proveedor,
  coalesce(nullif(l.datos_extraidos->'historico_pedido'->>'factura_numero', ''), mi.factura_venta) AS factura_venta,
  nullif(l.datos_extraidos->'historico_pedido'->>'factura_fecha', '')::date AS factura_fecha,
  nullif(l.datos_extraidos->'historico_pedido'->>'costo_producto', '')::numeric AS costo_producto,
  coalesce(u.valor_facturado, nullif(l.datos_extraidos->'historico_pedido'->>'valor_factura', '')::numeric,
    mi.valor_venta, l.valor_acordado_unitario) AS valor_venta,
  o.observaciones, o.actualizado_en,
  coalesce(nullif(u.moneda, ''), nullif(l.datos_extraidos->'historico_pedido'->>'moneda', ''),
    nullif(l.moneda_acordada, ''), 'USD') AS moneda_valor,
  (l.datos_extraidos ? 'historico_pedido') AS es_historico
FROM public.maquinaria_operacion_lineas l
JOIN public.maquinaria_operaciones o ON o.id = l.operacion_id
LEFT JOIN public.clientes c ON c.id = o.cliente_id
LEFT JOIN public.maquinaria_unidades_operacion u ON u.linea_id = l.id
LEFT JOIN LATERAL (
  SELECT st.* FROM public.maquinaria_stock_trazabilidad st
  WHERE st.chasis_normalizado = public.normalizar_chasis_notificacion(u.chasis)
  ORDER BY (st.estado_disponibilidad = 'CONFLICTO') DESC, st.importado_en DESC LIMIT 1
) t ON true
LEFT JOIN LATERAL (
  SELECT imp.* FROM public.maquinaria_importacion_lineas imp
  WHERE imp.linea_id = l.id OR imp.unidad_id = u.id OR (
    public.normalizar_chasis_notificacion(u.chasis) IS NOT NULL
    AND public.normalizar_chasis_notificacion(imp.chasis) = public.normalizar_chasis_notificacion(u.chasis)
  )
  ORDER BY (imp.unidad_id = u.id) DESC, (imp.linea_id = l.id) DESC, imp.actualizado_en DESC LIMIT 1
) mi ON true;

CREATE OR REPLACE VIEW public.maquinaria_pedidos_lineas_estado_actual
WITH (security_invoker = true)
AS SELECT detalle.*, operacion.estado AS estado_operacion
FROM public.maquinaria_pedidos_lineas_operativas detalle
JOIN public.maquinaria_operaciones operacion ON operacion.id = detalle.operacion_id;

CREATE OR REPLACE VIEW public.maquinaria_importacion_np_disponibles
WITH (security_invoker = true)
AS
SELECT o.id AS operacion_id, l.id AS linea_id, o.np_numero, o.cliente_nombre,
  coalesce(l.marca_nombre, nullif(l.marca::text, 'OTROS')) AS marca,
  l.subgrupo::text AS producto, l.modelo, count(u.id)::integer AS unidades_disponibles
FROM public.maquinaria_operaciones o
JOIN public.maquinaria_operacion_lineas l ON l.operacion_id = o.id
JOIN public.maquinaria_unidades_operacion u ON u.linea_id = l.id
WHERE o.estado <> 'CANCELADA'
  AND NOT (o.estado = 'CERRADA' OR (o.estado = 'FACTURADA' AND l.datos_extraidos ? 'historico_pedido'))
  AND l.abastecimiento = 'IMPORTAR'
  AND u.estado NOT IN ('CANCELADA', 'EN_PARQUE', 'TRANSFERIDA')
  AND nullif(btrim(o.np_numero), '') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.maquinaria_importacion_unidades iu WHERE iu.unidad_id = u.id AND iu.activa)
GROUP BY o.id, l.id, o.np_numero, o.cliente_nombre, l.marca_nombre, l.marca, l.subgrupo, l.modelo
HAVING count(u.id) > 0;

GRANT SELECT ON public.maquinaria_pedidos_lineas_operativas,
  public.maquinaria_pedidos_lineas_estado_actual,
  public.maquinaria_importacion_np_disponibles TO authenticated;
REVOKE ALL ON FUNCTION public.maquinaria_eliminar_unidad_importacion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maquinaria_eliminar_unidad_importacion(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
