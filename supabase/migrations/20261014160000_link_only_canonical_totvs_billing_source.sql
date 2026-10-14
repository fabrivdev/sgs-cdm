-- La carga con fuente debe acreditar las mismas filas que eligio el importador
-- transaccional. Un JOIN solo por identidad tambien alcanza copias historicas
-- descartadas, incluso si el XML actual trae EMISION y la copia no tiene fecha.
CREATE OR REPLACE FUNCTION public.facturacion_importar_totvs_lote_con_fuente_v1(
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
  v_resultado jsonb;
  v_importacion_id uuid;
  v_vinculadas integer;
  v_esperadas integer;
BEGIN
  -- Si cualquier control falla, el RPC revierte tambien esta importacion.
  v_resultado := public.facturacion_importar_totvs_lote_v1(
    p_importacion, p_resumen, p_lineas, p_desde, p_hasta, p_reemplazar_resumen
  );
  v_importacion_id := (v_resultado->>'importacion_id')::uuid;
  v_esperadas := (v_resultado->>'lineas_activas')::integer;

  WITH entrada AS (
    SELECT DISTINCT public.facturacion_totvs_identidad(
      value->>'origen_sistema', value->>'sucursal',
      coalesce(value->>'codigo_interno_factura', value->>'factura'),
      value->'raw_data'->>'ITEM',
      value->'raw_data'->>'canonical_document_kind'
    ) AS identidad
    FROM jsonb_array_elements(p_lineas)
  ), destinos AS (
    SELECT DISTINCT f.id,
      public.totvs_sha256_text_v1(
        regexp_replace(coalesce(f.codigo_interno_factura, f.factura, ''), '[^0-9]', '', 'g')
      ) AS documento_fuente_sha256
    FROM public.facturacion_lineas_importadas f
    JOIN entrada e ON e.identidad = public.facturacion_totvs_identidad(
      f.origen_sistema, f.sucursal::text,
      coalesce(f.codigo_interno_factura, f.factura),
      f.raw_data->>'ITEM', f.raw_data->>'canonical_document_kind'
    )
    WHERE f.fecha_factura IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.facturacion_dedupe_repair_pairs p
        WHERE p.linea_descartada_id = f.id
      )
  )
  INSERT INTO public.facturacion_totvs_carga_lineas(
    importacion_id, linea_id, documento_fuente_sha256
  )
  SELECT v_importacion_id, id, documento_fuente_sha256
  FROM destinos
  ON CONFLICT DO NOTHING;

  SELECT count(*)::integer INTO v_vinculadas
  FROM public.facturacion_totvs_carga_lineas
  WHERE importacion_id = v_importacion_id;

  IF v_vinculadas IS DISTINCT FROM v_esperadas THEN
    RAISE EXCEPTION 'Procedencia TOTVS incompleta: % vinculos para % lineas activas',
      v_vinculadas, v_esperadas USING ERRCODE = '23514';
  END IF;

  RETURN v_resultado || jsonb_build_object(
    'supporting_load_id', v_importacion_id,
    'supporting_linked_lines', v_vinculadas,
    'source_identity_persisted', true
  );
END;
$$;
