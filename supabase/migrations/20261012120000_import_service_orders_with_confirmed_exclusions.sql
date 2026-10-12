BEGIN;

CREATE OR REPLACE FUNCTION public.totvs_importar_ordenes_servicio_lote_v1(p_importacion_id uuid, p_lote_numero integer, p_filas jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_total integer;
  v_persistidas text[];
  v_excluidas text[];
  v_lote_ya_confirmado boolean;
  v_lote_confirmado_claves jsonb;
  v_lote_claves jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(), 'admin.importaciones') THEN
    RAISE EXCEPTION 'Sin permiso para importar ordenes de servicio TOTVS' USING ERRCODE = '42501';
  END IF;
  IF p_importacion_id IS NULL OR p_lote_numero IS NULL OR p_lote_numero < 1 THEN
    RAISE EXCEPTION 'La identidad de importacion o lote de OS es invalida' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_importacion_id::text, 0));
  SELECT
    coalesce(i.metadata->'os_lotes_confirmados' ? p_lote_numero::text, false),
    i.metadata->'os_lotes_confirmados'->p_lote_numero::text
  INTO v_lote_ya_confirmado, v_lote_confirmado_claves
  FROM public.importaciones i
  WHERE i.id = p_importacion_id
    AND i.usuario_id = auth.uid()
    AND i.tipo::text = 'facturacion'
    AND i.origen_sistema = 'new_xml_ordenes_servicio';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La importacion de OS no existe o pertenece a otro usuario' USING ERRCODE = '42501';
  END IF;
  -- Evita que una exclusion se confirme entre la lectura y el upsert. Los
  -- escritores de exclusiones toman ROW EXCLUSIVE automaticamente y esperan
  -- a que este lote termine.
  LOCK TABLE public.os_exclusiones_confirmadas IN SHARE MODE;
  IF p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' THEN
    RAISE EXCEPTION 'El lote de ordenes de servicio debe ser un arreglo JSON' USING ERRCODE = '22023';
  END IF;
  v_total := jsonb_array_length(p_filas);
  IF v_total < 1 OR v_total > 500 THEN
    RAISE EXCEPTION 'Cada lote debe contener entre 1 y 500 ordenes de servicio' USING ERRCODE = '22023';
  END IF;

  DROP TABLE IF EXISTS pg_temp.totvs_os_lote;
  CREATE TEMP TABLE totvs_os_lote ON COMMIT DROP AS
  SELECT upper(btrim(fila->>'os_numero')) AS os_numero, fila
  FROM jsonb_array_elements(p_filas) AS source(fila);

  IF EXISTS (SELECT 1 FROM totvs_os_lote WHERE nullif(os_numero, '') IS NULL) THEN
    RAISE EXCEPTION 'El lote contiene una OS sin numero' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM totvs_os_lote GROUP BY os_numero HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'El lote contiene numeros de OS duplicados' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(jsonb_agg(os_numero ORDER BY os_numero), '[]'::jsonb)
  INTO v_lote_claves
  FROM totvs_os_lote;
  IF v_lote_ya_confirmado AND v_lote_confirmado_claves IS DISTINCT FROM v_lote_claves THEN
    RAISE EXCEPTION 'El numero de lote ya fue usado con otras OS' USING ERRCODE = '22023';
  END IF;
  IF NOT v_lote_ya_confirmado AND EXISTS (
    SELECT 1
    FROM public.importaciones i
    CROSS JOIN LATERAL jsonb_each(coalesce(i.metadata->'os_lotes_confirmados', '{}'::jsonb)) lote
    CROSS JOIN LATERAL jsonb_array_elements_text(lote.value) clave(os_numero)
    JOIN totvs_os_lote actual ON actual.os_numero = clave.os_numero
    WHERE i.id = p_importacion_id
      AND lote.key <> p_lote_numero::text
  ) THEN
    RAISE EXCEPTION 'Una OS del lote ya fue confirmada en otro lote' USING ERRCODE = '22023';
  END IF;

  DROP TABLE IF EXISTS pg_temp.totvs_os_excluidas;
  CREATE TEMP TABLE totvs_os_excluidas ON COMMIT DROP AS
  SELECT l.os_numero
  FROM totvs_os_lote l
  JOIN public.os_exclusiones_confirmadas e ON upper(btrim(e.os_numero)) = l.os_numero;

  DROP TABLE IF EXISTS pg_temp.totvs_os_aplicadas;
  CREATE TEMP TABLE totvs_os_aplicadas(os_numero text PRIMARY KEY) ON COMMIT DROP;
  IF v_lote_ya_confirmado THEN
    INSERT INTO totvs_os_aplicadas(os_numero)
    SELECT l.os_numero
    FROM totvs_os_lote l
    LEFT JOIN totvs_os_excluidas e USING (os_numero)
    JOIN public.ordenes_servicio_importadas o ON upper(btrim(o.os_numero)) = l.os_numero
    WHERE e.os_numero IS NULL;
  ELSE
  WITH filas_aplicadas AS (
  INSERT INTO public.ordenes_servicio_importadas (
    os_numero, cliente_nombre, cod_interno, cod_mecanico, factura,
    fecha_abierta_os, fecha_cierre_os, fecha_emision_factura,
    kilometro_valor, km_cantidad, km_valor_unitario, marca, nro_chasis,
    problema, raw_data, repuesto_valor, responsable, servicios_cantidad,
    servicios_valor, servicios_valor_unitario, situacion_facturacion,
    situacion_os, terceros_valor, tipo_tiempo, actualizado_en
  )
  SELECT
    l.os_numero, r.cliente_nombre, r.cod_interno, r.cod_mecanico, r.factura,
    r.fecha_abierta_os, r.fecha_cierre_os, r.fecha_emision_factura,
    r.kilometro_valor, r.km_cantidad, r.km_valor_unitario, r.marca, r.nro_chasis,
    r.problema, coalesce(r.raw_data, '{}'::jsonb), r.repuesto_valor, r.responsable,
    r.servicios_cantidad, r.servicios_valor, r.servicios_valor_unitario,
    r.situacion_facturacion, r.situacion_os, r.terceros_valor, r.tipo_tiempo,
    coalesce(r.actualizado_en, now())
  FROM totvs_os_lote l
  LEFT JOIN totvs_os_excluidas e USING (os_numero)
  CROSS JOIN LATERAL jsonb_to_record(l.fila) AS r(
    cliente_nombre text, cod_interno text, cod_mecanico text, factura text,
    fecha_abierta_os date, fecha_cierre_os date, fecha_emision_factura date,
    kilometro_valor numeric, km_cantidad numeric, km_valor_unitario numeric,
    marca text, nro_chasis text, problema text, raw_data jsonb,
    repuesto_valor numeric, responsable text, servicios_cantidad numeric,
    servicios_valor numeric, servicios_valor_unitario numeric,
    situacion_facturacion text, situacion_os text, terceros_valor numeric,
    tipo_tiempo text, actualizado_en timestamptz
  )
  WHERE e.os_numero IS NULL
  ON CONFLICT (os_numero) DO UPDATE SET
    cliente_nombre = EXCLUDED.cliente_nombre,
    cod_interno = EXCLUDED.cod_interno,
    cod_mecanico = EXCLUDED.cod_mecanico,
    factura = EXCLUDED.factura,
    fecha_abierta_os = EXCLUDED.fecha_abierta_os,
    fecha_cierre_os = EXCLUDED.fecha_cierre_os,
    fecha_emision_factura = EXCLUDED.fecha_emision_factura,
    kilometro_valor = EXCLUDED.kilometro_valor,
    km_cantidad = EXCLUDED.km_cantidad,
    km_valor_unitario = EXCLUDED.km_valor_unitario,
    marca = EXCLUDED.marca,
    nro_chasis = EXCLUDED.nro_chasis,
    problema = EXCLUDED.problema,
    raw_data = EXCLUDED.raw_data,
    repuesto_valor = EXCLUDED.repuesto_valor,
    responsable = EXCLUDED.responsable,
    servicios_cantidad = EXCLUDED.servicios_cantidad,
    servicios_valor = EXCLUDED.servicios_valor,
    servicios_valor_unitario = EXCLUDED.servicios_valor_unitario,
    situacion_facturacion = EXCLUDED.situacion_facturacion,
    situacion_os = EXCLUDED.situacion_os,
    terceros_valor = EXCLUDED.terceros_valor,
    tipo_tiempo = EXCLUDED.tipo_tiempo,
    actualizado_en = EXCLUDED.actualizado_en
  RETURNING upper(btrim(os_numero)) AS os_numero
  )
  INSERT INTO totvs_os_aplicadas(os_numero)
  SELECT os_numero FROM filas_aplicadas;
  END IF;

  IF EXISTS (
    (SELECT l.os_numero FROM totvs_os_lote l
    LEFT JOIN totvs_os_excluidas e USING (os_numero)
    WHERE e.os_numero IS NULL
    EXCEPT
    SELECT os_numero FROM totvs_os_aplicadas)
    UNION ALL
    (SELECT os_numero FROM totvs_os_aplicadas
    EXCEPT
    SELECT l.os_numero FROM totvs_os_lote l
    LEFT JOIN totvs_os_excluidas e USING (os_numero)
    WHERE e.os_numero IS NULL)
  ) THEN
    RAISE EXCEPTION 'El RETURNING del lote no coincide con las OS esperadas' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM totvs_os_excluidas e
    JOIN public.ordenes_servicio_importadas o ON upper(btrim(o.os_numero)) = e.os_numero
  ) THEN
    RAISE EXCEPTION 'Una OS con exclusion confirmada quedo persistida; se revierte el lote' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(array_agg(os_numero ORDER BY os_numero), '{}'::text[])
  INTO v_persistidas
  FROM totvs_os_aplicadas;
  SELECT coalesce(array_agg(os_numero ORDER BY os_numero), '{}'::text[])
  INTO v_excluidas
  FROM totvs_os_excluidas;

  IF NOT v_lote_ya_confirmado THEN
    UPDATE public.importaciones
    SET insertados = insertados + cardinality(v_persistidas),
        duplicados = 0,
        metadata = jsonb_set(
          jsonb_set(
            coalesce(metadata, '{}'::jsonb),
            '{os_excluidas_confirmadas}',
            to_jsonb(coalesce((metadata->>'os_excluidas_confirmadas')::integer, 0) + cardinality(v_excluidas)),
            true
          ),
          '{os_lotes_confirmados}',
          coalesce(metadata->'os_lotes_confirmados', '{}'::jsonb)
            || jsonb_build_object(p_lote_numero::text, v_lote_claves),
          true
        )
    WHERE id = p_importacion_id;
  END IF;

  RETURN jsonb_build_object(
    'total', v_total,
    'persistidas', to_jsonb(v_persistidas),
    'excluidas', to_jsonb(v_excluidas)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.totvs_importar_ordenes_servicio_lote_v1(uuid,integer,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.totvs_importar_ordenes_servicio_lote_v1(uuid,integer,jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
