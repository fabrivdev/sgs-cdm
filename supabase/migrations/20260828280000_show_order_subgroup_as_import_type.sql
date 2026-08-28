-- Paso A del plan de consolidacion de tipo (subgrupo como fuente unica).
-- A diferencia del intento anterior (descartado), esta version NUNCA
-- sobrescribe maquinaria_importacion_lineas.producto con el subgrupo del
-- pedido. producto queda intacto como dato interno (historial, matching,
-- reconciliacion con el Excel del Maestro). Lo que cambia es de donde sale
-- el "tipo" que se MUESTRA en pantalla, en los tres puntos donde hoy se
-- leia el texto libre de producto en vez del subgrupo ya clasificado:
--
--   1) maquinaria_importacion_unidades_operativas (vista) -- el punto real:
--      esta vista alimenta las DOS pantallas (Operaciones e Importacion) y
--      el detalle de vinculo. Antes exponia i.producto tal cual. Ahora
--      muestra el subgrupo del pedido vinculado cuando existe vinculo, y
--      solo cae al producto original de la importacion si todavia no esta
--      vinculada a ningun pedido. No escribe nada, es una columna calculada
--      de solo lectura -- mismo patron que ya usaba esta vista para "marca"
--      (coalesce(l.marca, i.marca_importacion)).
--   2) maquinaria_importacion_np_disponibles (vista) -- alimenta el
--      dropdown "NP de referencia" al crear una importacion nueva desde
--      cero. Tambien de solo lectura, sin riesgo: no hay producto previo
--      que pisar porque la importacion todavia no existe.
--   3) maquinaria_guardar_importacion (RPC) -- SOLO en la rama de INSERT
--      (creacion de una importacion nueva) se sigue derivando "producto"
--      desde el subgrupo del pedido, porque ahi no hay dato previo que
--      proteger. En la rama de UPDATE (editar una importacion ya
--      existente) se saca "producto" del SET -- editar OC/ETA/notas de una
--      importacion ya vinculada ya NO pisa su producto original.
--
-- maquinaria_asignar_importacion (el flujo "Asignacion de unidades", el que
-- se uso para el Direct Disc) NO se modifica en este paso: nunca escribio
-- producto, y con el arreglo de la vista (punto 1) no lo necesita -- el
-- tipo correcto ya se muestra sin que este RPC tenga que tocar la columna.

CREATE OR REPLACE VIEW public.maquinaria_importacion_unidades_operativas
WITH (security_invoker = true)
AS
SELECT
  u.id, i.id AS importacion_linea_id, u.numero_unidad, i.cantidad AS cantidad_lote,
  1::integer AS cantidad, u.activa, i.source_id, i.source_row, i.source_sheet,
  i.datos_fuente, i.llave_interna, i.prioridad,
  coalesce(o.np_numero, i.np_numero) AS np_numero,
  i.proveedor, coalesce(l.subgrupo::text, i.producto) AS producto, i.modelo,
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

CREATE OR REPLACE VIEW public.maquinaria_importacion_np_disponibles
WITH (security_invoker = true)
AS
SELECT
  o.id AS operacion_id,
  l.id AS linea_id,
  o.np_numero,
  o.cliente_nombre,
  l.marca::text AS marca,
  l.subgrupo::text AS producto,
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
GROUP BY o.id, l.id, o.np_numero, o.cliente_nombre, l.marca, l.subgrupo, l.modelo
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
    SELECT o.id, o.np_numero, l.marca, l.subgrupo::text, l.modelo
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

    -- producto NO se pisa al editar: se deja fuera del SET a proposito,
    -- para no reemplazar una descripcion real ya cargada (ej. "Direct
    -- Disc") por el subgrupo cada vez que alguien solo corrige la OC o
    -- la fecha de una importacion que ya tenia NP vinculada.
    UPDATE public.maquinaria_importacion_lineas
    SET llave_interna = btrim(p_datos ->> 'llave_interna'),
        marca_importacion = v_marca,
        np_numero = v_np_numero,
        proveedor = v_marca::text,
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

NOTIFY pgrst, 'reload schema';
