-- Permite editar los datos generales de una importacion sin exigir que su
-- linea de NP actual vuelva a estar disponible como si fuera una asignacion
-- nueva. Una NP distinta conserva todas las validaciones de disponibilidad.

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
  v_linea_actual uuid;
  v_linea_vinculada uuid;
BEGIN
  IF NOT public.maquinaria_puede_gestionar_flujo() THEN
    RAISE EXCEPTION 'Solo admin o jefatura pueden gestionar importaciones'
      USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_datos ->> 'llave_interna'), '') IS NULL THEN
    RAISE EXCEPTION 'La llave interna es obligatoria';
  END IF;

  IF p_importacion_id IS NOT NULL THEN
    SELECT i.linea_id
    INTO v_linea_actual
    FROM public.maquinaria_importacion_lineas i
    WHERE i.id = p_importacion_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'La importacion no existe';
    END IF;

    SELECT iu.linea_id
    INTO v_linea_vinculada
    FROM public.maquinaria_importacion_unidades iu
    WHERE iu.importacion_linea_id = p_importacion_id
      AND iu.unidad_id IS NOT NULL
    ORDER BY iu.numero_unidad
    LIMIT 1;

    IF v_linea_vinculada IS NOT NULL
       AND v_linea_vinculada IS DISTINCT FROM v_linea_id THEN
      RAISE EXCEPTION 'No se puede cambiar la NP: la importacion ya tiene unidades vinculadas';
    END IF;
  END IF;

  IF v_linea_id IS NOT NULL THEN
    SELECT o.id, o.np_numero, l.marca, l.subgrupo::text, l.modelo
    INTO v_operacion_id, v_np_numero, v_marca, v_producto, v_modelo
    FROM public.maquinaria_operacion_lineas l
    JOIN public.maquinaria_operaciones o ON o.id = l.operacion_id
    WHERE l.id = v_linea_id
      AND (
        v_linea_id IS NOT DISTINCT FROM v_linea_actual
        OR (l.abastecimiento = 'IMPORTAR' AND o.estado <> 'CANCELADA')
      )
    FOR UPDATE OF l, o;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'La linea de NP elegida no esta disponible para importar';
    END IF;

    SELECT count(*)::integer
    INTO v_disponibles
    FROM public.maquinaria_unidades_operacion u
    WHERE u.linea_id = v_linea_id
      AND u.estado <> 'CANCELADA'
      AND NOT EXISTS (
        SELECT 1
        FROM public.maquinaria_importacion_unidades ocupada
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
    SELECT coalesce(max(u.numero_unidad), 0)
    INTO v_minimo
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
        modelo = v_modelo,
        cantidad = v_cantidad,
        estado_fuente = coalesce(nullif(btrim(p_datos ->> 'estado_fuente'), ''), estado_fuente),
        oc = nullif(btrim(p_datos ->> 'oc'), ''),
        po = NULL,
        fecha_pedido = nullif(p_datos ->> 'fecha_pedido', '')::date,
        eta = nullif(p_datos ->> 'eta', '')::date,
        transporte = NULL,
        origen = NULL,
        destino = NULL,
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
          SELECT 1
          FROM public.maquinaria_importacion_unidades ocupada
          WHERE ocupada.unidad_id = u.id
            AND ocupada.activa
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
      WHERE iu.importacion_linea_id = v_id
        AND iu.unidad_id IS NOT NULL
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
