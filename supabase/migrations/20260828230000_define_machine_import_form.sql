-- Cierra la carga manual de importaciones con campos de negocio definidos,
-- vinculo real a una linea de NP disponible y soporte documental de OC.

ALTER TABLE public.maquinaria_importacion_lineas
  ADD COLUMN IF NOT EXISTS fecha_pedido date;

ALTER TABLE public.maquinaria_documentos
  ALTER COLUMN operacion_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS importacion_linea_id uuid
    REFERENCES public.maquinaria_importacion_lineas(id) ON DELETE CASCADE;

ALTER TABLE public.maquinaria_documentos
  DROP CONSTRAINT IF EXISTS maquinaria_documentos_tipo_check;
ALTER TABLE public.maquinaria_documentos
  ADD CONSTRAINT maquinaria_documentos_tipo_check
  CHECK (tipo IN ('NP','OC','FACTURA_IMPORTACION','FACTURA_VENTA','OTRO'));

ALTER TABLE public.maquinaria_documentos
  DROP CONSTRAINT IF EXISTS maquinaria_documentos_propietario_check;
ALTER TABLE public.maquinaria_documentos
  ADD CONSTRAINT maquinaria_documentos_propietario_check
  CHECK (operacion_id IS NOT NULL OR importacion_linea_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS maquinaria_documentos_importacion_linea_idx
  ON public.maquinaria_documentos(importacion_linea_id, creado_en DESC)
  WHERE importacion_linea_id IS NOT NULL;

CREATE OR REPLACE VIEW public.maquinaria_importacion_np_disponibles
WITH (security_invoker = true)
AS
SELECT
  o.id AS operacion_id,
  l.id AS linea_id,
  o.np_numero,
  o.cliente_nombre,
  l.marca::text AS marca,
  l.producto,
  l.modelo,
  count(u.id)::integer AS unidades_disponibles
FROM public.maquinaria_operaciones o
JOIN public.maquinaria_operacion_lineas l ON l.operacion_id = o.id
JOIN public.maquinaria_unidades_operacion u ON u.linea_id = l.id
WHERE o.estado <> 'CANCELADA'
  AND l.abastecimiento = 'IMPORTAR'
  AND u.estado <> 'CANCELADA'
  AND nullif(btrim(o.np_numero), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.maquinaria_importacion_unidades iu
    WHERE iu.unidad_id = u.id
      AND iu.activa
  )
GROUP BY o.id, l.id, o.np_numero, o.cliente_nombre, l.marca, l.producto, l.modelo
HAVING count(u.id) > 0;

GRANT SELECT ON public.maquinaria_importacion_np_disponibles TO authenticated;

CREATE OR REPLACE FUNCTION public.maquinaria_guardar_importacion(
  p_importacion_id uuid,
  p_datos jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_id uuid := coalesce(p_importacion_id, gen_random_uuid());
  v_cantidad integer := greatest(1, least(500, coalesce((p_datos ->> 'cantidad')::integer, 1)));
  v_minimo integer;
  v_linea_id uuid := nullif(p_datos ->> 'linea_id', '')::uuid;
  v_operacion_id uuid;
  v_np_numero text;
  v_marca public.marca;
  v_producto text;
  v_modelo text;
  v_disponibles integer := 0;
  v_linea_anterior uuid;
BEGIN
  IF NOT public.maquinaria_puede_gestionar_flujo() THEN
    RAISE EXCEPTION 'Solo admin o jefatura pueden gestionar importaciones'
      USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_datos ->> 'llave_interna'), '') IS NULL THEN
    RAISE EXCEPTION 'La llave interna es obligatoria';
  END IF;

  IF p_importacion_id IS NOT NULL THEN
    SELECT iu.linea_id INTO v_linea_anterior
    FROM public.maquinaria_importacion_unidades iu
    WHERE iu.importacion_linea_id = p_importacion_id
      AND iu.unidad_id IS NOT NULL
    ORDER BY iu.numero_unidad
    LIMIT 1;
    IF v_linea_anterior IS NOT NULL
       AND v_linea_anterior IS DISTINCT FROM v_linea_id THEN
      RAISE EXCEPTION 'No se puede cambiar la NP: la importacion ya tiene unidades vinculadas';
    END IF;
  END IF;

  IF v_linea_id IS NOT NULL THEN
    SELECT o.id, o.np_numero, l.marca, l.producto, l.modelo
    INTO v_operacion_id, v_np_numero, v_marca, v_producto, v_modelo
    FROM public.maquinaria_operacion_lineas l
    JOIN public.maquinaria_operaciones o ON o.id = l.operacion_id
    WHERE l.id = v_linea_id
      AND l.abastecimiento = 'IMPORTAR'
      AND o.estado <> 'CANCELADA'
    FOR UPDATE OF l, o;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La linea de NP elegida no esta disponible para importar';
    END IF;

    SELECT count(*)::integer INTO v_disponibles
    FROM public.maquinaria_unidades_operacion u
    WHERE u.linea_id = v_linea_id
      AND u.estado <> 'CANCELADA'
      AND NOT EXISTS (
        SELECT 1 FROM public.maquinaria_importacion_unidades ocupada
        WHERE ocupada.unidad_id = u.id
          AND ocupada.activa
          AND ocupada.importacion_linea_id <> v_id
      );

    IF v_cantidad > v_disponibles THEN
      RAISE EXCEPTION 'La NP solo tiene % unidad(es) disponibles sin asignar', v_disponibles;
    END IF;
  ELSE
    v_marca := coalesce(nullif(upper(p_datos ->> 'marca'), '')::public.marca, 'OTROS'::public.marca);
    v_producto := nullif(btrim(p_datos ->> 'producto'), '');
    v_modelo := nullif(btrim(p_datos ->> 'modelo'), '');
    v_np_numero := NULL;
  END IF;

  IF v_producto IS NULL OR v_modelo IS NULL THEN
    RAISE EXCEPTION 'El producto y el modelo son obligatorios';
  END IF;

  IF p_importacion_id IS NULL THEN
    INSERT INTO public.maquinaria_importacion_lineas (
      id, source_id, source_sheet, datos_fuente, llave_interna,
      marca_importacion, np_numero, proveedor, producto, modelo, cantidad,
      estado_fuente, oc, po, fecha_pedido, eta, transporte, origen, destino,
      notas, operacion_id, linea_id
    ) VALUES (
      v_id, 'MANUAL:' || v_id::text, 'CARGA MANUAL',
      jsonb_build_object('origen', 'CARGA MANUAL', 'creado_por', auth.uid()),
      btrim(p_datos ->> 'llave_interna'), v_marca, v_np_numero, v_marca::text,
      v_producto, v_modelo, v_cantidad,
      coalesce(nullif(btrim(p_datos ->> 'estado_fuente'), ''), 'PLANIFICADA'),
      nullif(btrim(p_datos ->> 'oc'), ''), NULL,
      nullif(p_datos ->> 'fecha_pedido', '')::date,
      nullif(p_datos ->> 'eta', '')::date, NULL, NULL, NULL,
      nullif(btrim(p_datos ->> 'notas'), ''), v_operacion_id, v_linea_id
    );
  ELSE
    PERFORM 1 FROM public.maquinaria_importacion_lineas
    WHERE id = p_importacion_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La importacion no existe'; END IF;

    SELECT coalesce(max(u.numero_unidad), 0) INTO v_minimo
    FROM public.maquinaria_importacion_unidades u
    WHERE u.importacion_linea_id = p_importacion_id
      AND (
        u.unidad_id IS NOT NULL OR nullif(btrim(u.chasis), '') IS NOT NULL
        OR u.invoice_supplier IS NOT NULL OR u.ata IS NOT NULL
      );
    IF v_cantidad < v_minimo THEN
      RAISE EXCEPTION 'No se puede reducir la cantidad por debajo de %: esas unidades ya tienen trazabilidad', v_minimo;
    END IF;

    UPDATE public.maquinaria_importacion_lineas
    SET llave_interna = btrim(p_datos ->> 'llave_interna'),
        marca_importacion = v_marca,
        np_numero = v_np_numero,
        proveedor = v_marca::text,
        producto = v_producto,
        modelo = v_modelo,
        cantidad = v_cantidad,
        estado_fuente = coalesce(nullif(btrim(p_datos ->> 'estado_fuente'), ''), estado_fuente),
        oc = nullif(btrim(p_datos ->> 'oc'), ''),
        po = NULL,
        fecha_pedido = nullif(p_datos ->> 'fecha_pedido', '')::date,
        eta = nullif(p_datos ->> 'eta', '')::date,
        transporte = NULL, origen = NULL, destino = NULL,
        notas = nullif(btrim(p_datos ->> 'notas'), ''),
        operacion_id = v_operacion_id,
        linea_id = v_linea_id,
        actualizado_en = now()
    WHERE id = p_importacion_id;
  END IF;

  IF v_linea_id IS NOT NULL THEN
    WITH importables AS (
      SELECT iu.id, row_number() OVER (ORDER BY iu.numero_unidad, iu.id) AS posicion
      FROM public.maquinaria_importacion_unidades iu
      WHERE iu.importacion_linea_id = v_id
        AND iu.activa
        AND iu.unidad_id IS NULL
    ), disponibles AS (
      SELECT u.id, row_number() OVER (ORDER BY u.numero_unidad, u.id) AS posicion
      FROM public.maquinaria_unidades_operacion u
      WHERE u.linea_id = v_linea_id
        AND u.estado <> 'CANCELADA'
        AND NOT EXISTS (
          SELECT 1 FROM public.maquinaria_importacion_unidades ocupada
          WHERE ocupada.unidad_id = u.id AND ocupada.activa
        )
    )
    UPDATE public.maquinaria_importacion_unidades iu
    SET operacion_id = v_operacion_id,
        linea_id = v_linea_id,
        unidad_id = disponible.id,
        situacion_vinculo = 'PEDIDO VINCULADO',
        vinculo_manual = true,
        actualizado_en = now()
    FROM importables importable
    JOIN disponibles disponible ON disponible.posicion = importable.posicion
    WHERE iu.id = importable.id;

    UPDATE public.maquinaria_importacion_lineas i
    SET operacion_id = v_operacion_id,
        linea_id = v_linea_id,
        unidad_id = vinculo.unidad_id,
        situacion_vinculo = 'PEDIDO VINCULADO',
        actualizado_en = now()
    FROM (
      SELECT iu.unidad_id
      FROM public.maquinaria_importacion_unidades iu
      WHERE iu.importacion_linea_id = v_id AND iu.unidad_id IS NOT NULL
      ORDER BY iu.numero_unidad
      LIMIT 1
    ) vinculo
    WHERE i.id = v_id;
  END IF;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.maquinaria_guardar_importacion(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maquinaria_guardar_importacion(uuid, jsonb) TO authenticated;

-- Se agrega al final para conservar el orden de columnas de la vista ya usada.
CREATE OR REPLACE VIEW public.maquinaria_importacion_unidades_operativas
WITH (security_invoker = true)
AS
SELECT
  u.id, i.id AS importacion_linea_id, u.numero_unidad, i.cantidad AS cantidad_lote,
  1::integer AS cantidad, u.activa, i.source_id, i.source_row, i.source_sheet,
  i.datos_fuente, i.llave_interna, i.prioridad,
  coalesce(o.np_numero, i.np_numero) AS np_numero,
  i.proveedor, i.producto, i.modelo,
  coalesce(u.estado_fuente, i.estado_fuente) AS estado_fuente,
  i.oc, i.po, coalesce(u.eta, i.eta) AS eta,
  i.transporte, coalesce(u.invoice_supplier, i.invoice_supplier) AS invoice_supplier,
  u.factura_proveedor_fecha, u.factura_proveedor_moneda,
  i.tipo_cambio, i.precio_oc, i.descuentos, i.precio_teorico_oc,
  i.producto_facturado, i.diferencia, i.descuento_especial,
  i.flete_seguro, i.proveedor_flete, i.origen, i.destino, i.notas,
  coalesce(u.ata, i.ata) AS ata,
  coalesce(u.costo_final_sin_iva, i.costo_final_sin_iva) AS costo_final_sin_iva,
  coalesce(u.costo_final, i.costo_final) AS costo_final,
  coalesce(u.chasis, CASE WHEN u.numero_unidad = 1 THEN i.chasis END) AS chasis,
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

NOTIFY pgrst, 'reload schema';
