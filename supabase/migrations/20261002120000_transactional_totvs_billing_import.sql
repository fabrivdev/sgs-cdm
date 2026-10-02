BEGIN;

-- Esta tabla es evidencia auditada de la reparacion previa. La migracion no la
-- crea ni intenta inferir pares: aborta antes de instalar el RPC si el contrato
-- minimo que usa para elegir el UUID canonico no existe.
DO $$
DECLARE
  v_columnas_invalidas text;
  v_fks_validas integer;
BEGIN
  IF to_regclass('public.facturacion_dedupe_repair_pairs') IS NULL THEN
    RAISE EXCEPTION
      'Precondicion faltante: public.facturacion_dedupe_repair_pairs no existe; no se instalara el importador TOTVS'
      USING ERRCODE = '42P01';
  END IF;

  SELECT string_agg(e.columna, ', ' ORDER BY e.columna)
  INTO v_columnas_invalidas
  FROM (VALUES
    ('linea_descartada_id'::text, 'uuid'::text),
    ('linea_canonica_id'::text, 'uuid'::text)
  ) AS e(columna, tipo)
  LEFT JOIN pg_catalog.pg_attribute a
    ON a.attrelid = to_regclass('public.facturacion_dedupe_repair_pairs')
   AND a.attname = e.columna
   AND a.attnum > 0
   AND NOT a.attisdropped
  WHERE a.attname IS NULL
     OR pg_catalog.format_type(a.atttypid, a.atttypmod) <> e.tipo
     OR NOT a.attnotnull;

  IF v_columnas_invalidas IS NOT NULL THEN
    RAISE EXCEPTION
      'Contrato invalido de public.facturacion_dedupe_repair_pairs: columnas requeridas % deben ser uuid NOT NULL',
      v_columnas_invalidas
      USING ERRCODE = '42804';
  END IF;

  SELECT count(*)
  INTO v_fks_validas
  FROM pg_catalog.pg_constraint c
  JOIN pg_catalog.pg_attribute origen
    ON origen.attrelid = c.conrelid
   AND origen.attnum = c.conkey[1]
  JOIN pg_catalog.pg_attribute destino
    ON destino.attrelid = c.confrelid
   AND destino.attnum = c.confkey[1]
  WHERE c.contype = 'f'
    AND c.conrelid = to_regclass('public.facturacion_dedupe_repair_pairs')
    AND c.confrelid = to_regclass('public.facturacion_lineas_importadas')
    AND array_length(c.conkey, 1) = 1
    AND array_length(c.confkey, 1) = 1
    AND origen.attname IN ('linea_descartada_id', 'linea_canonica_id')
    AND destino.attname = 'id'
    AND c.confdeltype IN ('a', 'r'); -- NO ACTION o RESTRICT; nunca CASCADE.

  IF v_fks_validas <> 2 THEN
    RAISE EXCEPTION
      'Contrato invalido de public.facturacion_dedupe_repair_pairs: ambas columnas de linea deben referenciar facturacion_lineas_importadas(id) con NO ACTION/RESTRICT'
      USING ERRCODE = '42830';
  END IF;
END
$$;

-- Allowlist vacia: se completa solo desde un snapshot aprobado. No infiere ni
-- copia valores entre UUID y no autoriza una excepcion sin par reparado.
CREATE TABLE IF NOT EXISTS public.facturacion_totvs_preservaciones_auditadas (
  identidad text PRIMARY KEY,
  linea_canonica_id uuid NOT NULL
    REFERENCES public.facturacion_lineas_importadas(id) ON DELETE RESTRICT,
  linea_actualizado_en timestamptz NOT NULL,
  linea_fingerprint text NOT NULL,
  os_verificada text NOT NULL,
  marca_verificada public.marca NOT NULL,
  tipo_tiempo_verificado text,
  motivo text NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facturacion_totvs_preservacion_tiempo_check CHECK (
    tipo_tiempo_verificado IS NULL
    OR tipo_tiempo_verificado IN ('Cliente', 'Garantia', 'Interno')
  )
);
ALTER TABLE public.facturacion_totvs_preservaciones_auditadas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.facturacion_totvs_preservaciones_auditadas FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.facturacion_totvs_sucursal_canonica(p_sucursal text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN nullif(btrim(p_sucursal), '') IS NULL THEN NULL
    WHEN upper(btrim(p_sucursal)) IN (
      '04',
      '04 - SAN JUAN BAUTISTA',
      'SAN JUAN BAUTISTA',
      'MISIONES'
    ) THEN 'Misiones'
    ELSE btrim(p_sucursal)
  END
$$;

-- Identidad limitada a campos que el parser de Factura de Ventas realmente
-- conserva: origen, sucursal normalizada, DOCUMENTO, ITEM y tipo canonico.
-- DOCUMENTO ya es el numero fiscal completo del archivo; no se inventan una
-- empresa o serie separadas.
CREATE OR REPLACE FUNCTION public.facturacion_totvs_identidad(
  p_origen text,
  p_sucursal text,
  p_documento text,
  p_item text,
  p_tipo_documento text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN nullif(btrim(p_origen), '') IS NULL
      OR public.facturacion_totvs_sucursal_canonica(p_sucursal) IS NULL
      OR nullif(btrim(p_documento), '') IS NULL
      OR nullif(btrim(p_item), '') IS NULL
      OR nullif(btrim(p_tipo_documento), '') IS NULL
    THEN NULL
    ELSE CASE
      WHEN upper(btrim(p_origen)) IN ('NEW_XML_FACTURACION_DIRECTA', 'NEW_XML_FACTURACION_OS')
        THEN 'NEW_XML_FACTURACION'
      ELSE upper(btrim(p_origen))
    END || '|' || upper(public.facturacion_totvs_sucursal_canonica(p_sucursal)) || '|' ||
      upper(btrim(p_tipo_documento)) || '|' || upper(btrim(p_documento)) || '|' ||
      upper(btrim(p_item))
  END
$$;

CREATE OR REPLACE FUNCTION public.facturacion_totvs_firma_comercial(p_linea jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT jsonb_build_object(
    'origen', CASE
      WHEN upper(btrim(coalesce(p_linea->>'origen_sistema', '')))
        IN ('NEW_XML_FACTURACION_DIRECTA', 'NEW_XML_FACTURACION_OS')
        THEN 'NEW_XML_FACTURACION'
      ELSE upper(btrim(coalesce(p_linea->>'origen_sistema', '')))
    END,
    'sucursal', upper(public.facturacion_totvs_sucursal_canonica(p_linea->>'sucursal')),
    'documento', upper(btrim(coalesce(p_linea->>'codigo_interno_factura', p_linea->>'factura', ''))),
    'factura', upper(btrim(coalesce(p_linea->>'factura', ''))),
    'item', upper(btrim(coalesce(p_linea->'raw_data'->>'ITEM', ''))),
    'tipo_documento', upper(btrim(coalesce(p_linea->'raw_data'->>'canonical_document_kind', ''))),
    'vendedor', upper(btrim(coalesce(p_linea->>'vendedor', ''))),
    'cod_mercaderia', upper(btrim(coalesce(p_linea->>'cod_mercaderia', ''))),
    'entidad_nombre', upper(btrim(coalesce(p_linea->>'entidad_nombre', ''))),
    'mercaderia', upper(btrim(coalesce(p_linea->>'mercaderia', ''))),
    'observacion', upper(btrim(coalesce(p_linea->>'observacion', ''))),
    'cantidad', CASE WHEN p_linea->>'cantidad' IS NULL THEN NULL ELSE (p_linea->>'cantidad')::numeric END,
    'valor_unitario', CASE WHEN p_linea->>'valor_unitario' IS NULL THEN NULL ELSE (p_linea->>'valor_unitario')::numeric END,
    'total_venta', CASE WHEN p_linea->>'total_venta' IS NULL THEN NULL ELSE (p_linea->>'total_venta')::numeric END,
    'linked_service_order', upper(btrim(coalesce(p_linea->'raw_data'->>'linked_service_order', ''))),
    'subgrupo_original', upper(btrim(coalesce(p_linea->>'subgrupo_original', ''))),
    'grupo_normalizado', upper(btrim(coalesce(p_linea->>'grupo_normalizado', ''))),
    'marca_normalizada', upper(btrim(coalesce(p_linea->>'marca_normalizada', ''))),
    'tipo_facturacion', upper(btrim(coalesce(p_linea->>'tipo_facturacion', ''))),
    'tipo_tiempo', upper(btrim(coalesce(p_linea->>'tipo_tiempo', '')))
  )
$$;

CREATE OR REPLACE FUNCTION public.facturacion_totvs_firma_base(p_linea jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT public.facturacion_totvs_firma_comercial(p_linea)
    - ARRAY['linked_service_order', 'marca_normalizada', 'tipo_tiempo']::text[]
$$;

CREATE OR REPLACE FUNCTION public.facturacion_totvs_fingerprint_auditado(p_linea jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$ SELECT md5(p_linea::text) $$;

-- El hash anterior se conserva para origenes legacy. Solo las filas nuevas de
-- TOTVS usan la identidad fuente; las filas existentes cambian de hash solo si
-- este RPC las enriquece, sin backfill ni reescritura masiva.
CREATE OR REPLACE FUNCTION public.set_facturacion_linea_hash()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_identidad text;
BEGIN
  IF NEW.origen_sistema IN ('new_xml_facturacion_directa', 'new_xml_facturacion_os') THEN
    v_identidad := public.facturacion_totvs_identidad(
      NEW.origen_sistema,
      NEW.sucursal::text,
      coalesce(NEW.codigo_interno_factura, NEW.factura),
      NEW.raw_data->>'ITEM',
      NEW.raw_data->>'canonical_document_kind'
    );
  END IF;

  IF v_identidad IS NOT NULL THEN
    NEW.linea_hash := md5('totvs-v2|' || v_identidad);
  ELSE
    NEW.linea_hash := md5(
      coalesce(NEW.origen_sistema, '') || '|' ||
      coalesce(NEW.codigo_interno_factura, '') || '|' ||
      coalesce(NEW.factura, '') || '|' ||
      coalesce(NEW.cod_mercaderia, '') || '|' ||
      coalesce(NEW.codigo_fabricante, '') || '|' ||
      coalesce(NEW.observacion, '') || '|' ||
      coalesce(NEW.total_venta::text, '')
    );
  END IF;
  NEW.actualizado_en := now();
  RETURN NEW;
END;
$$;

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

  -- Se permiten solo tres enriquecimientos no destructivos sobre una fila
  -- comercialmente identica. Un valor existente distinto siempre bloquea.
  SELECT u.identidad INTO v_identidad
  FROM tmp_facturacion_totvs_unicas u
  JOIN tmp_facturacion_totvs_destinos d ON d.identidad = u.identidad
  JOIN public.facturacion_lineas_importadas f ON f.id = d.destino_id
  WHERE (
    public.facturacion_totvs_firma_comercial(to_jsonb(f)) <> u.firma
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

  CREATE TEMP TABLE tmp_facturacion_totvs_reparaciones_esperadas ON COMMIT DROP AS
  SELECT f.id
  FROM public.facturacion_lineas_importadas f
  JOIN tmp_facturacion_totvs_destinos d ON d.destino_id = f.id
  WHERE f.fecha_factura IS NULL OR f.codigo_fabricante IS NULL OR f.moneda IS NULL;

  CREATE UNIQUE INDEX ON tmp_facturacion_totvs_reparaciones_esperadas(id);
  CREATE TEMP TABLE tmp_facturacion_totvs_reparaciones_reales (
    id uuid PRIMARY KEY
  ) ON COMMIT DROP;

  WITH reparadas AS (
    UPDATE public.facturacion_lineas_importadas f
    SET fecha_factura = coalesce(f.fecha_factura, (u.linea->>'fecha_factura')::timestamptz),
        codigo_fabricante = coalesce(f.codigo_fabricante, u.linea->>'codigo_fabricante'),
        moneda = coalesce(f.moneda, u.linea->>'moneda')
    FROM tmp_facturacion_totvs_unicas u
    JOIN tmp_facturacion_totvs_destinos d ON d.identidad = u.identidad
    WHERE f.id = d.destino_id
      AND (f.fecha_factura IS NULL OR f.codigo_fabricante IS NULL OR f.moneda IS NULL)
    RETURNING
      f.id,
      f.actualizado_en,
      public.facturacion_totvs_fingerprint_auditado(to_jsonb(f)) AS fingerprint
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
    RETURNING id
  ) SELECT count(*) INTO v_insertadas FROM insertadas;

  -- Un BEFORE trigger efectivo puede devolver NULL y omitir silenciosamente
  -- una fila. En ese caso el resumen y la auditoria no pueden confirmarse: el
  -- lote completo se revierte, incluida cualquier evidencia escrita por el
  -- propio trigger.
  IF v_insertadas <> (
    SELECT count(*) FROM tmp_facturacion_totvs_destinos WHERE destino_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Un trigger omitio lineas TOTVS: se esperaba insertar %, se insertaron %. No se modifico ningun dato',
      (SELECT count(*) FROM tmp_facturacion_totvs_destinos WHERE destino_id IS NULL),
      v_insertadas
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'importacion_id', v_importacion_id,
    'lineas_entrada', jsonb_array_length(p_lineas),
    'lineas_unicas', (SELECT count(*) FROM tmp_facturacion_totvs_unicas),
    'insertadas', v_insertadas,
    'reutilizadas', v_reutilizadas,
    'reparadas', v_reparadas
  );
END;
$$;

REVOKE ALL ON FUNCTION public.facturacion_totvs_sucursal_canonica(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.facturacion_totvs_identidad(text,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.facturacion_totvs_firma_comercial(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.facturacion_importar_totvs_lote_v1(jsonb,jsonb,jsonb,date,date,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.facturacion_importar_totvs_lote_v1(jsonb,jsonb,jsonb,date,date,boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
