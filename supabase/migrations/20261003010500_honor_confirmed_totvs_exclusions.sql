BEGIN;
-- No modifica datos comerciales ni desactiva triggers. Requiere la politica
-- de exclusiones ya instalada y respalda el RPC actualmente vigente.
DO $$ BEGIN
  IF to_regclass('public.os_exclusiones_confirmadas') IS NULL THEN
    RAISE EXCEPTION 'Falta la tabla de exclusiones confirmadas; no se aplica';
  END IF;
END $$;
INSERT INTO public.facturacion_totvs_importador_versiones(version,definicion_rpc)
SELECT '20261003010500',pg_get_functiondef('public.facturacion_importar_totvs_lote_v1(jsonb,jsonb,jsonb,date,date,boolean)'::regprocedure)
ON CONFLICT(version) DO NOTHING;

CREATE OR REPLACE FUNCTION public.facturacion_importar_totvs_lote_v1(
  p_importacion jsonb,
  p_resumen jsonb,
  p_lineas jsonb,
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL,
  p_reemplazar_resumen boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
SET statement_timeout = '120s'
SET TimeZone = 'UTC'
AS $$
DECLARE
  v_importacion_id uuid;
  v_insertadas integer := 0;
  v_reutilizadas integer := 0;
  v_reparadas integer := 0;
  v_identidad text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(), 'admin.importaciones') THEN
    RAISE EXCEPTION 'Sin permiso para importar facturacion TOTVS' USING ERRCODE = '42501';
  END IF;
  IF p_importacion IS NULL OR jsonb_typeof(p_importacion) <> 'object'
    OR p_resumen IS NULL OR jsonb_typeof(p_resumen) <> 'array' OR jsonb_array_length(p_resumen) = 0
    OR p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array'
    OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'Lote de facturacion TOTVS invalido' USING ERRCODE = '22023';
  END IF;
  IF p_reemplazar_resumen AND (p_desde IS NULL OR p_hasta IS NULL OR p_desde > p_hasta) THEN
    RAISE EXCEPTION 'Ventana de reemplazo de facturacion invalida' USING ERRCODE = '22023';
  END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_desde < DATE '2026-07-01' OR p_hasta < DATE '2026-07-01' THEN
    RAISE EXCEPTION 'La facturacion TOTVS no puede escribir antes del corte 2026-07-01'
      USING ERRCODE = '22023';
  END IF;

  -- Evita que dos reintentos validen simultaneamente el mismo estado.
  PERFORM pg_advisory_xact_lock(hashtextextended('facturacion_importar_totvs_lote_v1', 0));

  CREATE TEMP TABLE tmp_facturacion_totvs_entrada ON COMMIT DROP AS
  SELECT value AS linea,
    public.facturacion_totvs_identidad(
      value->>'origen_sistema',
      value->>'sucursal',
      coalesce(value->>'codigo_interno_factura', value->>'factura'),
      value->'raw_data'->>'ITEM',
      value->'raw_data'->>'canonical_document_kind'
    ) AS identidad,
    public.facturacion_totvs_firma_comercial(value) AS firma,
    public.facturacion_totvs_firma_comercial(value) || jsonb_build_object(
      'fecha_factura', value->>'fecha_factura',
      'codigo_fabricante', upper(btrim(coalesce(value->>'codigo_fabricante', ''))),
      'moneda', upper(btrim(coalesce(value->>'moneda', '')))
    ) || jsonb_build_object(
      'linked_service_order_evidence',value->'raw_data'->'linked_service_order_evidence',
      'linked_service_order_known_values',value->'raw_data'->'linked_service_order_known_values',
      'canonical_time_type_evidence',value->'raw_data'->'canonical_time_type_evidence',
      'canonical_time_type_known_values',value->'raw_data'->'canonical_time_type_known_values',
      'canonical_time_type_has_unknown',value->'raw_data'->'canonical_time_type_has_unknown',
      'product_brand',value->'raw_data'->'product_brand',
      'product_brand_evidence',value->'raw_data'->'product_brand_evidence',
      'product_brand_known_values',value->'raw_data'->'product_brand_known_values'
    ) AS firma_lote
  FROM jsonb_array_elements(p_lineas);

  IF EXISTS (
    SELECT 1 FROM tmp_facturacion_totvs_entrada
    WHERE linea->>'origen_sistema' NOT IN (
      'new_xml_facturacion_directa',
      'new_xml_facturacion_os'
    )
  ) THEN
    RAISE EXCEPTION 'Origen de facturacion TOTVS no permitido'
      USING ERRCODE = '22023';
  END IF;

  SELECT identidad INTO v_identidad
  FROM tmp_facturacion_totvs_entrada
  WHERE identidad IS NULL
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Linea TOTVS sin origen, sucursal, DOCUMENTO, ITEM o tipo de documento'
      USING ERRCODE = '22023';
  END IF;

  SELECT identidad INTO v_identidad
  FROM tmp_facturacion_totvs_entrada
  GROUP BY identidad
  HAVING count(DISTINCT firma_lote) > 1
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Conflicto dentro del XML para la identidad %', v_identidad
      USING ERRCODE = '23505';
  END IF;

  CREATE TEMP TABLE tmp_facturacion_totvs_unicas ON COMMIT DROP AS
  SELECT DISTINCT ON (identidad) identidad, linea, firma, firma_lote
  FROM tmp_facturacion_totvs_entrada
  ORDER BY identidad;

  IF EXISTS (
    SELECT 1 FROM tmp_facturacion_totvs_unicas u
    WHERE nullif(u.linea->>'fecha_factura', '') IS NULL
       OR (u.linea->>'fecha_factura')::timestamptz::date NOT BETWEEN p_desde AND p_hasta
  ) THEN
    RAISE EXCEPTION 'Las lineas TOTVS deben tener fecha y cubrir exactamente la ventana declarada'
      USING ERRCODE = '22023';
  END IF;

  CREATE TEMP TABLE tmp_facturacion_totvs_resumen ON COMMIT DROP AS
  SELECT r AS fila
  FROM jsonb_array_elements(p_resumen) r;

  IF EXISTS (
    SELECT 1 FROM tmp_facturacion_totvs_resumen r
    WHERE nullif(r.fila->>'fecha', '') IS NULL
       OR (r.fila->>'fecha')::date NOT BETWEEN p_desde AND p_hasta
       OR nullif(btrim(r.fila->>'cod_factura'), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'El resumen TOTVS contiene fechas o documentos fuera de la ventana declarada'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    WITH detalle AS (
      SELECT
        jsonb_build_object(
          'fecha', (u.linea->>'fecha_factura')::timestamptz::date,
          'sucursal', upper(public.facturacion_totvs_sucursal_canonica(u.linea->>'sucursal')),
          'tipo', upper(btrim(coalesce(u.linea->>'tipo_facturacion', ''))),
          'cod_entidad', upper(btrim(coalesce(u.linea->'raw_data'->>'CLIENTE', ''))),
          'entidad_nombre', upper(btrim(coalesce(u.linea->>'entidad_nombre', ''))),
          'documento', upper(btrim(coalesce(u.linea->>'factura', ''))),
          'grupo', upper(btrim(coalesce(u.linea->>'subgrupo_original', ''))),
          'grupo_fx', upper(btrim(coalesce(u.linea->>'grupo_normalizado', ''))),
          'moneda', upper(btrim(coalesce(u.linea->>'moneda', '')))
        ) AS dimensiones,
        sum(coalesce((u.linea->>'cantidad')::numeric, 0)) AS cantidad,
        sum(coalesce((u.linea->>'total_venta')::numeric, 0)) AS importe
      FROM tmp_facturacion_totvs_unicas u
      GROUP BY 1
    ), resumen AS (
      SELECT
        jsonb_build_object(
          'fecha', (r.fila->>'fecha')::date,
          'sucursal', upper(public.facturacion_totvs_sucursal_canonica(r.fila->>'sucursal')),
          'tipo', upper(btrim(coalesce(r.fila->>'tipo', ''))),
          'cod_entidad', upper(btrim(coalesce(r.fila->>'cod_entidad', ''))),
          'entidad_nombre', upper(btrim(coalesce(r.fila->>'entidad_nombre', ''))),
          'documento', upper(btrim(coalesce(r.fila->>'cod_factura', ''))),
          'grupo', upper(btrim(coalesce(r.fila->>'grupo', ''))),
          'grupo_fx', upper(btrim(coalesce(r.fila->>'grupo_fx', ''))),
          'moneda', upper(btrim(coalesce(r.fila->>'moneda', '')))
        ) AS dimensiones,
        sum(coalesce((r.fila->>'cantidad')::numeric, 0)) AS cantidad,
        sum(coalesce((r.fila->>'total_venta')::numeric, 0)) AS importe
      FROM tmp_facturacion_totvs_resumen r
      GROUP BY 1
    )
    SELECT 1
    FROM detalle d
    FULL JOIN resumen r USING (dimensiones)
    WHERE d.dimensiones IS NULL OR r.dimensiones IS NULL
       OR d.cantidad IS DISTINCT FROM r.cantidad
       OR d.importe IS DISTINCT FROM r.importe
  ) THEN
    RAISE EXCEPTION 'El resumen TOTVS no coincide con las dimensiones, cantidad e importe del detalle'
      USING ERRCODE = '22023';
  END IF;

  CREATE TEMP TABLE tmp_facturacion_totvs_candidatas ON COMMIT DROP AS
  SELECT u.identidad, f.id
  FROM tmp_facturacion_totvs_unicas u
  JOIN public.facturacion_lineas_importadas f
    ON public.facturacion_totvs_identidad(
      f.origen_sistema, f.sucursal::text,
      coalesce(f.codigo_interno_factura, f.factura),
      f.raw_data->>'ITEM', f.raw_data->>'canonical_document_kind'
    ) = u.identidad;

  CREATE TEMP TABLE tmp_facturacion_totvs_elegibles ON COMMIT DROP AS
  SELECT c.identidad, c.id AS destino_id
  FROM tmp_facturacion_totvs_candidatas c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.facturacion_dedupe_repair_pairs p
    WHERE p.linea_descartada_id = c.id
  )
    AND NOT EXISTS (
      SELECT 1
      FROM tmp_facturacion_totvs_candidatas otra
      WHERE otra.identidad = c.identidad
        AND otra.id <> c.id
        AND NOT EXISTS (
          SELECT 1 FROM public.facturacion_dedupe_repair_pairs p
          WHERE p.linea_descartada_id = otra.id
            AND p.linea_canonica_id = c.id
        )
    );

  CREATE TEMP TABLE tmp_facturacion_totvs_destinos ON COMMIT DROP AS
  SELECT
    u.identidad,
    count(DISTINCT c.id) AS candidatas,
    count(DISTINCT e.destino_id) AS elegibles,
    (array_agg(DISTINCT e.destino_id) FILTER (WHERE e.destino_id IS NOT NULL))[1] AS destino_id
  FROM tmp_facturacion_totvs_unicas u
  LEFT JOIN tmp_facturacion_totvs_candidatas c ON c.identidad = u.identidad
  LEFT JOIN tmp_facturacion_totvs_elegibles e ON e.identidad = u.identidad
  GROUP BY u.identidad;

  SELECT d.identidad INTO v_identidad
  FROM tmp_facturacion_totvs_destinos d
  WHERE d.candidatas > 0 AND d.elegibles <> 1
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Identidad TOTVS ambigua sin par canonico valido: %. Requiere auditoria', v_identidad
      USING ERRCODE = '23505';
  END IF;

  -- Bloquear los destinos elegidos evita validar una version y actualizar otra.
  PERFORM 1 FROM public.facturacion_lineas_importadas f
  JOIN tmp_facturacion_totvs_destinos d ON d.destino_id=f.id
  ORDER BY f.id FOR UPDATE OF f;

  CREATE TEMP TABLE tmp_facturacion_totvs_reimportaciones ON COMMIT DROP AS
  SELECT u.identidad, f.id,
    CASE WHEN EXISTS (
      SELECT 1 FROM public.facturacion_totvs_preservaciones_auditadas p
      WHERE p.identidad=u.identidad OR p.linea_canonica_id=f.id
    ) OR (
      nullif(btrim(f.raw_data->>'linked_service_order'),'') IS NOT NULL
      AND EXISTS(SELECT 1 FROM public.facturacion_dedupe_repair_pairs p WHERE p.linea_canonica_id=f.id)
    ) THEN jsonb_build_object(
      'entrada',u.linea,'guardada_comparable',to_jsonb(f),
      'completar_vendedor',false,'limpiar_tiempo',false,
      'completar_os',false,'completar_tiempo',false,'completar_marca',false,
      'conservar_os',false,'conservar_tiempo',false,'conservar_marca',false
    ) ELSE public.facturacion_totvs_preparar_reimportacion(to_jsonb(f),u.linea) END AS plan
  FROM tmp_facturacion_totvs_unicas u
  JOIN tmp_facturacion_totvs_destinos d ON d.identidad=u.identidad
  JOIN public.facturacion_lineas_importadas f ON f.id=d.destino_id;

  -- No cambia la fuente: solo retiene evidencia ya almacenada cuando el
  -- nuevo archivo no la aporta. Evidencia conocida contradictoria no se toca.
  UPDATE tmp_facturacion_totvs_unicas u
  SET linea=r.plan->'entrada',
      firma=public.facturacion_totvs_firma_comercial(r.plan->'entrada')
  FROM tmp_facturacion_totvs_reimportaciones r WHERE r.identidad=u.identidad;

  -- Se permiten solo tres enriquecimientos no destructivos sobre una fila
  -- comercialmente identica. Un valor existente distinto siempre bloquea.
  SELECT u.identidad INTO v_identidad
  FROM tmp_facturacion_totvs_unicas u
  JOIN tmp_facturacion_totvs_destinos d ON d.identidad = u.identidad
  JOIN public.facturacion_lineas_importadas f ON f.id = d.destino_id
  JOIN tmp_facturacion_totvs_reimportaciones r ON r.id=f.id
  WHERE (
    public.facturacion_totvs_firma_comercial(r.plan->'guardada_comparable') <> u.firma
    OR (f.fecha_factura IS NOT NULL AND f.fecha_factura IS DISTINCT FROM (u.linea->>'fecha_factura')::timestamptz)
    OR (f.codigo_fabricante IS NOT NULL AND upper(btrim(f.codigo_fabricante)) IS DISTINCT FROM upper(btrim(u.linea->>'codigo_fabricante')))
    OR (f.moneda IS NOT NULL AND upper(btrim(f.moneda)) IS DISTINCT FROM upper(btrim(u.linea->>'moneda')))
  )
    AND NOT EXISTS (
      SELECT 1
      FROM public.facturacion_totvs_preservaciones_auditadas p
      WHERE p.identidad = u.identidad
        AND p.linea_canonica_id = f.id
        AND p.linea_actualizado_en = f.actualizado_en
        AND p.linea_fingerprint = public.facturacion_totvs_fingerprint_auditado(to_jsonb(f))
        AND p.os_verificada = f.raw_data->>'linked_service_order'
        AND p.marca_verificada = f.marca_normalizada
        AND p.tipo_tiempo_verificado IS NOT DISTINCT FROM f.tipo_tiempo
        AND EXISTS (
          SELECT 1
          FROM public.facturacion_dedupe_repair_pairs rp
          JOIN tmp_facturacion_totvs_candidatas descartada
            ON descartada.id = rp.linea_descartada_id
           AND descartada.identidad = u.identidad
          WHERE rp.linea_canonica_id = f.id
        )
        AND public.facturacion_totvs_firma_base(to_jsonb(f)) =
          public.facturacion_totvs_firma_base(u.linea)
        AND NOT (f.fecha_factura IS NOT NULL AND f.fecha_factura IS DISTINCT FROM (u.linea->>'fecha_factura')::timestamptz)
        AND NOT (f.codigo_fabricante IS NOT NULL AND upper(btrim(f.codigo_fabricante)) IS DISTINCT FROM upper(btrim(u.linea->>'codigo_fabricante')))
        AND NOT (f.moneda IS NOT NULL AND upper(btrim(f.moneda)) IS DISTINCT FROM upper(btrim(u.linea->>'moneda')))
        AND (
          (
            upper(btrim(u.linea->'raw_data'->>'linked_service_order')) =
              upper(btrim(f.raw_data->>'linked_service_order'))
            AND u.linea->'raw_data'->>'linked_service_order_evidence' = 'complete'
            AND jsonb_typeof(u.linea->'raw_data'->'linked_service_order_known_values') = 'array'
            AND jsonb_array_length(u.linea->'raw_data'->'linked_service_order_known_values') > 0
            AND NOT EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(u.linea->'raw_data'->'linked_service_order_known_values') known(os)
              WHERE upper(btrim(known.os)) IS DISTINCT FROM
                upper(btrim(u.linea->'raw_data'->>'linked_service_order'))
            )
          )
          OR (
            (u.linea->'raw_data'->'linked_service_order' IS NULL
              OR u.linea->'raw_data'->'linked_service_order' = 'null'::jsonb)
            AND u.linea->'raw_data'->>'linked_service_order_evidence' = 'missing'
            AND jsonb_typeof(u.linea->'raw_data'->'linked_service_order_known_values') = 'array'
            AND jsonb_array_length(u.linea->'raw_data'->'linked_service_order_known_values') = 0
          )
        )
        AND (
          (
            upper(btrim(u.linea->>'marca_normalizada')) = upper(btrim(f.marca_normalizada::text))
            AND u.linea->'raw_data'->>'product_brand_evidence' IN (
              'service_order', 'product', 'billing', 'inferred'
            )
            AND nullif(btrim(u.linea->'raw_data'->>'product_brand'), '') IS NOT NULL
            AND upper(btrim(u.linea->'raw_data'->>'product_brand')) =
              upper(btrim(u.linea->>'marca_normalizada'))
            AND jsonb_typeof(u.linea->'raw_data'->'product_brand_known_values') = 'array'
            AND jsonb_array_length(u.linea->'raw_data'->'product_brand_known_values') > 0
            AND NOT EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(u.linea->'raw_data'->'product_brand_known_values') known(brand)
              WHERE upper(btrim(known.brand)) IS DISTINCT FROM
                upper(btrim(u.linea->>'marca_normalizada'))
            )
          )
          OR (
            upper(btrim(u.linea->>'marca_normalizada')) = 'OTROS'
            AND (
              u.linea->'raw_data'->'product_brand' IS NULL
              OR u.linea->'raw_data'->'product_brand' = 'null'::jsonb
            )
            AND u.linea->'raw_data'->>'product_brand_evidence' = 'missing'
            AND jsonb_typeof(u.linea->'raw_data'->'product_brand_known_values') = 'array'
            AND jsonb_array_length(u.linea->'raw_data'->'product_brand_known_values') = 0
          )
        )
        AND (
          (
            upper(btrim(u.linea->>'tipo_tiempo')) = upper(btrim(f.tipo_tiempo))
            AND u.linea->'raw_data'->>'canonical_time_type_evidence' = 'complete'
            AND jsonb_typeof(u.linea->'raw_data'->'canonical_time_type_known_values') = 'array'
            AND jsonb_array_length(u.linea->'raw_data'->'canonical_time_type_known_values') > 0
            AND NOT EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(u.linea->'raw_data'->'canonical_time_type_known_values') known(tipo)
              WHERE upper(btrim(known.tipo)) IS DISTINCT FROM upper(btrim(u.linea->>'tipo_tiempo'))
            )
          )
          OR (
            (u.linea->'tipo_tiempo' IS NULL OR u.linea->'tipo_tiempo' = 'null'::jsonb)
            AND u.linea->'raw_data'->>'canonical_time_type_evidence' = 'missing'
            AND jsonb_typeof(u.linea->'raw_data'->'canonical_time_type_known_values') = 'array'
            AND jsonb_array_length(u.linea->'raw_data'->'canonical_time_type_known_values') = 0
          )
        )
    )
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Cambio comercial para la identidad TOTVS %. No se modifico ningun dato', v_identidad
      USING ERRCODE = '23505';
  END IF;

  -- Un snapshot no puede omitir silenciosamente una linea ya publicada. Este
  -- caso necesita una decision auditada de anulacion, no un DELETE automatico.
  IF p_reemplazar_resumen AND EXISTS (
    SELECT 1
    FROM public.facturacion_lineas_importadas f
    WHERE f.origen_sistema IN ('new_xml_facturacion_directa', 'new_xml_facturacion_os')
      AND f.fecha_factura::date BETWEEN p_desde AND p_hasta
      AND NOT EXISTS (
        SELECT 1 FROM tmp_facturacion_totvs_unicas u
        WHERE u.identidad = public.facturacion_totvs_identidad(
          f.origen_sistema, f.sucursal::text,
          coalesce(f.codigo_interno_factura, f.factura),
          f.raw_data->>'ITEM', f.raw_data->>'canonical_document_kind'
        )
      )
  ) THEN
    RAISE EXCEPTION 'El XML omite lineas TOTVS existentes en la ventana. Requiere reconciliacion auditada'
      USING ERRCODE = '23505';
  END IF;

  -- La anulacion confirmada es una omision intencional. Se conserva el
  -- trigger: el INSERT intentado sigue dejando su evidencia transaccional.
  CREATE TEMP TABLE tmp_facturacion_totvs_exclusiones ON COMMIT DROP AS
  SELECT u.identidad,array_agg(DISTINCT e.os_numero) AS os_excluidas
  FROM tmp_facturacion_totvs_unicas u
  JOIN public.os_exclusiones_confirmadas e
    ON e.os_numero=upper(btrim(u.linea->'raw_data'->>'linked_service_order'))
    OR e.factura=regexp_replace(coalesce(nullif(btrim(u.linea->>'factura'),''),u.linea->>'codigo_interno_factura',''),'[^0-9]','','g')
  GROUP BY u.identidad;
  CREATE UNIQUE INDEX ON tmp_facturacion_totvs_exclusiones(identidad);

  -- Una exclusion existente no habilita borrar ni modificar una fila vieja.
  -- Ese estado requiere reconciliacion propia, no reintroduccion silenciosa.
  SELECT e.identidad INTO v_identidad
  FROM tmp_facturacion_totvs_exclusiones e
  JOIN tmp_facturacion_totvs_destinos d USING(identidad)
  WHERE d.destino_id IS NOT NULL LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'La identidad TOTVS excluida % sigue persistida. Requiere auditoria',v_identidad
      USING ERRCODE='23505';
  END IF;

  INSERT INTO public.importaciones (
    usuario_id, tipo, total_filas, insertados, duplicados,
    archivo_nombre, origen_sistema, metadata
  ) VALUES (
    auth.uid(),
    (p_importacion->>'tipo')::public.tipo_importacion,
    coalesce((p_importacion->>'total_filas')::integer, jsonb_array_length(p_lineas)),
    jsonb_array_length(p_lineas),
    jsonb_array_length(p_lineas) - (SELECT count(*) FROM tmp_facturacion_totvs_unicas),
    p_importacion->>'archivo_nombre',
    p_importacion->>'origen_sistema',
    coalesce(p_importacion->'metadata', '{}'::jsonb)
  ) RETURNING id INTO v_importacion_id;

  IF p_reemplazar_resumen THEN
    DELETE FROM public.facturacion
    WHERE fecha BETWEEN p_desde AND p_hasta;
  END IF;

  INSERT INTO public.facturacion (
    fecha, sucursal, tipo, cliente_id, entidad_nombre, cod_entidad,
    total_venta, cantidad, grupo, grupo_fx, cod_factura, moneda
  )
  SELECT
    (r.fila->>'fecha')::date,
    public.facturacion_totvs_sucursal_canonica(r.fila->>'sucursal')::public.sucursal,
    (r.fila->>'tipo')::public.tipo_facturacion,
    nullif(r.fila->>'cliente_id', '')::uuid,
    r.fila->>'entidad_nombre',
    r.fila->>'cod_entidad',
    coalesce((r.fila->>'total_venta')::numeric, 0),
    coalesce((r.fila->>'cantidad')::numeric, 0),
    r.fila->>'grupo', r.fila->>'grupo_fx', r.fila->>'cod_factura', r.fila->>'moneda'
  FROM tmp_facturacion_totvs_resumen r
  ON CONFLICT (cod_factura, tipo, fecha, cod_entidad, entidad_nombre, sucursal, grupo, grupo_fx, moneda)
  DO UPDATE SET
    cliente_id = EXCLUDED.cliente_id,
    total_venta = EXCLUDED.total_venta,
    cantidad = EXCLUDED.cantidad;

  -- Las anulaciones no pueden desaparecer del detalle y seguir sumando
  -- en el resumen. Su trigger debe haberlas marcado fuera de reportes.
  SELECT e.identidad INTO v_identidad
  FROM tmp_facturacion_totvs_exclusiones e
  JOIN tmp_facturacion_totvs_unicas u USING(identidad)
  JOIN tmp_facturacion_totvs_resumen r
    ON regexp_replace(coalesce(r.fila->>'cod_factura',''),'[^0-9]','','g')=
       regexp_replace(coalesce(nullif(btrim(u.linea->>'factura'),''),u.linea->>'codigo_interno_factura',''),'[^0-9]','','g')
  WHERE NOT EXISTS (
    SELECT 1 FROM public.facturacion f
    WHERE f.fecha=(r.fila->>'fecha')::date
      AND f.sucursal::text=public.facturacion_totvs_sucursal_canonica(r.fila->>'sucursal')
      AND f.tipo::text=r.fila->>'tipo'
      AND f.cod_factura IS NOT DISTINCT FROM r.fila->>'cod_factura'
      AND f.cod_entidad IS NOT DISTINCT FROM r.fila->>'cod_entidad'
      AND f.entidad_nombre IS NOT DISTINCT FROM r.fila->>'entidad_nombre'
      AND f.grupo IS NOT DISTINCT FROM r.fila->>'grupo'
      AND f.grupo_fx IS NOT DISTINCT FROM r.fila->>'grupo_fx'
      AND f.moneda IS NOT DISTINCT FROM r.fila->>'moneda'
      AND f.excluido_de_reportes IS TRUE
  ) LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'La exclusion TOTVS % no quedo aplicada al resumen. No se modifico ningun dato',v_identidad
      USING ERRCODE='P0001';
  END IF;

  CREATE TEMP TABLE tmp_facturacion_totvs_reparaciones_esperadas ON COMMIT DROP AS
  SELECT f.id
  FROM public.facturacion_lineas_importadas f
  JOIN tmp_facturacion_totvs_destinos d ON d.destino_id = f.id
  JOIN tmp_facturacion_totvs_unicas u ON u.identidad=d.identidad
  JOIN tmp_facturacion_totvs_reimportaciones r ON r.id=f.id
  WHERE (f.fecha_factura IS NULL AND u.linea->>'fecha_factura' IS NOT NULL)
     OR (f.codigo_fabricante IS NULL AND u.linea->>'codigo_fabricante' IS NOT NULL)
     OR (f.moneda IS NULL AND u.linea->>'moneda' IS NOT NULL)
     OR (r.plan->>'completar_vendedor')::boolean
     OR (r.plan->>'limpiar_tiempo')::boolean
     OR (r.plan->>'completar_os')::boolean;

  CREATE UNIQUE INDEX ON tmp_facturacion_totvs_reparaciones_esperadas(id);
  CREATE TEMP TABLE tmp_facturacion_totvs_reparaciones_reales (
    id uuid PRIMARY KEY
  ) ON COMMIT DROP;

  INSERT INTO public.facturacion_totvs_reimportacion_cambios (
    importacion_id,linea_id,cambios,raw_data_anterior,fingerprint_anterior
  )
  SELECT v_importacion_id,f.id,
    jsonb_build_object(
      'vendedor_anterior',f.vendedor,
      'vendedor_nuevo',CASE WHEN (r.plan->>'completar_vendedor')::boolean THEN u.linea->>'vendedor' ELSE f.vendedor END,
      'tipo_tiempo_anterior',f.tipo_tiempo,
      'tipo_tiempo_nuevo',CASE WHEN (r.plan->>'limpiar_tiempo')::boolean THEN NULL WHEN (r.plan->>'completar_tiempo')::boolean THEN u.linea->>'tipo_tiempo' ELSE f.tipo_tiempo END,
      'marca_anterior',f.marca_normalizada,
      'marca_nueva',CASE WHEN (r.plan->>'completar_marca')::boolean THEN u.linea->>'marca_normalizada' ELSE f.marca_normalizada::text END,
      'os_anterior',f.raw_data->>'linked_service_order',
      'os_nueva',CASE WHEN (r.plan->>'completar_os')::boolean THEN u.linea->'raw_data'->>'linked_service_order' ELSE f.raw_data->>'linked_service_order' END,
      'fecha_anterior',f.fecha_factura,'fecha_nueva',coalesce(f.fecha_factura,(u.linea->>'fecha_factura')::timestamptz),
      'codigo_fabricante_anterior',f.codigo_fabricante,'codigo_fabricante_nuevo',coalesce(f.codigo_fabricante,u.linea->>'codigo_fabricante'),
      'moneda_anterior',f.moneda,'moneda_nueva',coalesce(f.moneda,u.linea->>'moneda'),
      'actualizado_en_anterior',f.actualizado_en,'linea_hash_anterior',f.linea_hash,
      'motivo','reimportacion con enriquecimiento comprobado o limpieza de default sin OS'
    ),f.raw_data,public.facturacion_totvs_fingerprint_auditado(to_jsonb(f))
  FROM tmp_facturacion_totvs_reimportaciones r
  JOIN public.facturacion_lineas_importadas f ON f.id=r.id
  JOIN tmp_facturacion_totvs_unicas u ON u.identidad=r.identidad
  JOIN tmp_facturacion_totvs_reparaciones_esperadas e ON e.id=f.id;

  WITH reparadas AS (
    UPDATE public.facturacion_lineas_importadas f
    SET fecha_factura = coalesce(f.fecha_factura, (u.linea->>'fecha_factura')::timestamptz),
        codigo_fabricante = coalesce(f.codigo_fabricante, u.linea->>'codigo_fabricante'),
        moneda = coalesce(f.moneda, u.linea->>'moneda'),
        vendedor = CASE WHEN (r.plan->>'completar_vendedor')::boolean THEN u.linea->>'vendedor' ELSE f.vendedor END,
        tipo_tiempo = CASE WHEN (r.plan->>'limpiar_tiempo')::boolean THEN NULL WHEN (r.plan->>'completar_tiempo')::boolean THEN u.linea->>'tipo_tiempo' ELSE f.tipo_tiempo END,
        marca_normalizada = CASE WHEN (r.plan->>'completar_marca')::boolean THEN (u.linea->>'marca_normalizada')::public.marca ELSE f.marca_normalizada END,
        raw_data = f.raw_data
          || CASE WHEN (r.plan->>'completar_os')::boolean THEN jsonb_build_object(
               'linked_service_order',u.linea->'raw_data'->'linked_service_order',
               'linked_service_order_evidence',u.linea->'raw_data'->'linked_service_order_evidence',
               'linked_service_order_known_values',u.linea->'raw_data'->'linked_service_order_known_values'
             ) ELSE '{}'::jsonb END
          || CASE WHEN (r.plan->>'completar_tiempo')::boolean THEN jsonb_build_object(
               'canonical_time_type',u.linea->>'tipo_tiempo',
               'canonical_time_type_evidence',u.linea->'raw_data'->'canonical_time_type_evidence',
               'canonical_time_type_known_values',u.linea->'raw_data'->'canonical_time_type_known_values',
               'canonical_time_type_has_unknown',u.linea->'raw_data'->'canonical_time_type_has_unknown'
             ) ELSE '{}'::jsonb END
          || CASE WHEN (r.plan->>'completar_marca')::boolean THEN jsonb_build_object(
               'product_brand',u.linea->>'marca_normalizada',
               'product_brand_evidence',u.linea->'raw_data'->'product_brand_evidence',
               'product_brand_known_values',u.linea->'raw_data'->'product_brand_known_values'
             ) ELSE '{}'::jsonb END
          || CASE WHEN (r.plan->>'completar_vendedor')::boolean THEN jsonb_build_object('VENDEDOR',u.linea->>'vendedor') ELSE '{}'::jsonb END
          || CASE WHEN (r.plan->>'limpiar_tiempo')::boolean THEN jsonb_build_object(
               'canonical_time_type','Desconocido',
               'canonical_time_type_evidence','missing',
               'canonical_time_type_known_values','[]'::jsonb,
               'canonical_time_type_has_unknown',false,
               'linked_service_order_evidence','missing',
               'linked_service_order_known_values','[]'::jsonb
             ) ELSE '{}'::jsonb END
    FROM tmp_facturacion_totvs_unicas u
    JOIN tmp_facturacion_totvs_destinos d ON d.identidad = u.identidad
    JOIN tmp_facturacion_totvs_reimportaciones r ON r.id=d.destino_id
    JOIN tmp_facturacion_totvs_reparaciones_esperadas e ON e.id=d.destino_id
    WHERE f.id = d.destino_id
    RETURNING
      f.id,
      f.actualizado_en,
      public.facturacion_totvs_fingerprint_auditado(to_jsonb(f)) AS fingerprint
  ), auditoria_cerrada AS (
    UPDATE public.facturacion_totvs_reimportacion_cambios a
    SET fingerprint_resultante=r.fingerprint,
        cambios=a.cambios||jsonb_build_object('actualizado_en_nuevo',r.actualizado_en)
    FROM reparadas r WHERE a.importacion_id=v_importacion_id AND a.linea_id=r.id
    RETURNING a.id
  ), preservaciones_rebasadas AS (
    UPDATE public.facturacion_totvs_preservaciones_auditadas p
    SET linea_actualizado_en = r.actualizado_en,
        linea_fingerprint = r.fingerprint
    FROM reparadas r
    WHERE p.linea_canonica_id = r.id
    RETURNING p.identidad
  )
  INSERT INTO tmp_facturacion_totvs_reparaciones_reales(id)
  SELECT id FROM reparadas;

  SELECT count(*) INTO v_reparadas FROM tmp_facturacion_totvs_reparaciones_reales;

  IF v_reparadas <> (SELECT count(*) FROM tmp_facturacion_totvs_reparaciones_esperadas)
     OR EXISTS (
       SELECT id FROM tmp_facturacion_totvs_reparaciones_esperadas
       EXCEPT
       SELECT id FROM tmp_facturacion_totvs_reparaciones_reales
     )
     OR EXISTS (
       SELECT id FROM tmp_facturacion_totvs_reparaciones_reales
       EXCEPT
       SELECT id FROM tmp_facturacion_totvs_reparaciones_esperadas
     ) THEN
    RAISE EXCEPTION 'Un trigger omitio reparaciones TOTVS durante UPDATE. No se modifico ningun dato'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_reutilizadas
  FROM tmp_facturacion_totvs_destinos d
  WHERE d.destino_id IS NOT NULL;

  CREATE TEMP TABLE tmp_facturacion_totvs_inserciones_reales (
    id uuid PRIMARY KEY,identidad text NOT NULL UNIQUE
  ) ON COMMIT DROP;
  WITH insertadas AS (
    INSERT INTO public.facturacion_lineas_importadas (
      importacion_id, origen_sistema, codigo_interno_factura, factura,
      entidad_nombre, vendedor, fecha_factura, sucursal, subgrupo_original,
      grupo_normalizado, marca_normalizada, tipo_facturacion, tipo_tiempo,
      observacion, cod_mercaderia, codigo_fabricante, mercaderia, cantidad,
      valor_unitario, total_venta, moneda, raw_data
    )
    SELECT
      v_importacion_id,
      u.linea->>'origen_sistema', u.linea->>'codigo_interno_factura', u.linea->>'factura',
      u.linea->>'entidad_nombre', u.linea->>'vendedor', (u.linea->>'fecha_factura')::timestamptz,
      public.facturacion_totvs_sucursal_canonica(u.linea->>'sucursal')::public.sucursal,
      u.linea->>'subgrupo_original',
      u.linea->>'grupo_normalizado', (u.linea->>'marca_normalizada')::public.marca,
      (u.linea->>'tipo_facturacion')::public.tipo_facturacion, u.linea->>'tipo_tiempo',
      u.linea->>'observacion', u.linea->>'cod_mercaderia', u.linea->>'codigo_fabricante',
      u.linea->>'mercaderia', (u.linea->>'cantidad')::numeric,
      (u.linea->>'valor_unitario')::numeric, coalesce((u.linea->>'total_venta')::numeric, 0),
      u.linea->>'moneda', coalesce(u.linea->'raw_data', '{}'::jsonb)
    FROM tmp_facturacion_totvs_unicas u
    JOIN tmp_facturacion_totvs_destinos d ON d.identidad = u.identidad
    WHERE d.destino_id IS NULL
    RETURNING id,public.facturacion_totvs_identidad(
      origen_sistema,sucursal::text,coalesce(codigo_interno_factura,factura),
      raw_data->>'ITEM',raw_data->>'canonical_document_kind'
    ) AS identidad
  ) INSERT INTO tmp_facturacion_totvs_inserciones_reales(id,identidad)
    SELECT id,identidad FROM insertadas;
  SELECT count(*) INTO v_insertadas FROM tmp_facturacion_totvs_inserciones_reales;

  -- Compara identidades, no solo cantidades: otra omision o una exclusion
  -- indebidamente reintroducida siempre aborta el lote entero.
  SELECT identidad INTO v_identidad FROM (
    (SELECT d.identidad FROM tmp_facturacion_totvs_destinos d
      WHERE d.destino_id IS NULL AND NOT EXISTS (
        SELECT 1 FROM tmp_facturacion_totvs_exclusiones e WHERE e.identidad=d.identidad
      )
     EXCEPT SELECT identidad FROM tmp_facturacion_totvs_inserciones_reales)
    UNION ALL
    (SELECT identidad FROM tmp_facturacion_totvs_inserciones_reales
     EXCEPT SELECT d.identidad FROM tmp_facturacion_totvs_destinos d
      WHERE d.destino_id IS NULL AND NOT EXISTS (
        SELECT 1 FROM tmp_facturacion_totvs_exclusiones e WHERE e.identidad=d.identidad
      ))
  ) diferencias LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Un trigger altero las inserciones TOTVS previstas para %. No se modifico ningun dato',v_identidad
      USING ERRCODE='P0001';
  END IF;

  -- La omision autorizada debe haber dejado la evidencia del trigger real
  -- para esta importacion. Un filtro o trigger distinto no puede sustituirlo.
  SELECT e.identidad INTO v_identidad
  FROM tmp_facturacion_totvs_exclusiones e
  WHERE NOT EXISTS (
    SELECT 1 FROM public.os_exclusiones_evidencia ev
    WHERE ev.tabla='facturacion_lineas_importadas' AND ev.operacion='INSERT'
      AND ev.os_numero=ANY(e.os_excluidas)
      AND ev.registro->>'importacion_id'=v_importacion_id::text
      AND public.facturacion_totvs_identidad(
        ev.registro->>'origen_sistema',ev.registro->>'sucursal',
        coalesce(ev.registro->>'codigo_interno_factura',ev.registro->>'factura'),
        ev.registro->'raw_data'->>'ITEM',ev.registro->'raw_data'->>'canonical_document_kind'
      )=e.identidad
  ) LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'La exclusion TOTVS % no dejo evidencia del trigger. No se modifico ningun dato',v_identidad
      USING ERRCODE='P0001';
  END IF;

  UPDATE public.importaciones
  SET insertados=v_insertadas+v_reutilizadas,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'lineas_excluidas_confirmadas',(SELECT count(*) FROM tmp_facturacion_totvs_exclusiones)
      )
  WHERE id=v_importacion_id;

  RETURN jsonb_build_object(
    'importacion_id', v_importacion_id,
    'lineas_entrada', jsonb_array_length(p_lineas),
    'lineas_unicas', (SELECT count(*) FROM tmp_facturacion_totvs_unicas),
    'lineas_activas',v_insertadas+v_reutilizadas,
    'excluidas_confirmadas',(SELECT count(*) FROM tmp_facturacion_totvs_exclusiones),
    'insertadas', v_insertadas,
    'reutilizadas', v_reutilizadas,
    'reparadas', v_reparadas,
    'vendedores_completados',(SELECT count(*) FROM tmp_facturacion_totvs_reimportaciones WHERE (plan->>'completar_vendedor')::boolean),
    'tiempos_sin_os_normalizados',(SELECT count(*) FROM tmp_facturacion_totvs_reimportaciones WHERE (plan->>'limpiar_tiempo')::boolean),
    'vinculos_completados',(SELECT count(*) FROM tmp_facturacion_totvs_reimportaciones WHERE (plan->>'completar_os')::boolean),
    'vinculos_conservados',(SELECT count(*) FROM tmp_facturacion_totvs_reimportaciones WHERE (plan->>'conservar_os')::boolean),
    'tiempos_conservados',(SELECT count(*) FROM tmp_facturacion_totvs_reimportaciones WHERE (plan->>'conservar_tiempo')::boolean)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.facturacion_importar_totvs_lote_v1(jsonb,jsonb,jsonb,date,date,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.facturacion_importar_totvs_lote_v1(jsonb,jsonb,jsonb,date,date,boolean) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
