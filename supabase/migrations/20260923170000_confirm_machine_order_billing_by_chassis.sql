-- Una factura adjunta a la NP no confirma todas sus maquinas. Cada unidad se
-- considera facturada solamente cuando existe una venta positiva de maquinaria
-- con el mismo chasis y fecha no anterior al pedido.

BEGIN;

CREATE OR REPLACE FUNCTION public.maquinaria_unidad_tiene_venta_confirmada(
  p_unidad_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH unidad_objetivo AS (
    SELECT
      public.normalizar_chasis_notificacion(coalesce(
        nullif(btrim(unidad.chasis), ''),
        nullif(btrim(stock.chasis), ''),
        nullif(btrim(importacion.chasis), '')
      )) AS chasis_normalizado,
      operacion.np_fecha
    FROM public.maquinaria_unidades_operacion unidad
    JOIN public.maquinaria_operacion_lineas linea ON linea.id = unidad.linea_id
    JOIN public.maquinaria_operaciones operacion ON operacion.id = linea.operacion_id
    LEFT JOIN LATERAL (
      SELECT s.chasis
      FROM public.parque_stock_maquinas s
      WHERE s.unidad_operacion_id = unidad.id
      ORDER BY s.importado_en DESC NULLS LAST
      LIMIT 1
    ) stock ON true
    LEFT JOIN LATERAL (
      SELECT i.chasis
      FROM public.maquinaria_importacion_unidades i
      WHERE i.unidad_id = unidad.id AND i.activa
      ORDER BY i.actualizado_en DESC NULLS LAST
      LIMIT 1
    ) importacion ON true
    WHERE unidad.id = p_unidad_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM unidad_objetivo objetivo
    JOIN public.facturacion_lineas_importadas venta
      ON public.normalizar_chasis_notificacion(
        public.extraer_chasis_venta_maquina(
          concat_ws(' | ', venta.mercaderia, venta.observacion, venta.subgrupo_original),
          venta.raw_data,
          nullif(venta.raw_data ->> 'linked_service_order', '')
        )
      ) = objetivo.chasis_normalizado
    WHERE objetivo.chasis_normalizado IS NOT NULL
      AND coalesce(venta.cantidad, 0) > 0
      AND coalesce(venta.total_venta, 0) > 0
      AND upper(regexp_replace(
        coalesce(venta.raw_data ->> 'canonical_document_kind', 'FACTURA'),
        '[^A-Z0-9]', '', 'g'
      )) <> 'NOTACREDITO'
      AND (
        upper(coalesce(venta.grupo_normalizado, '')) = 'MAQUINARIAS'
        OR upper(coalesce(venta.raw_data ->> 'canonical_line_type', '')) = 'MAQUINARIAS'
        OR left(upper(coalesce(venta.cod_mercaderia, '')), 5) = 'VEIC_'
        OR concat_ws(' | ', venta.mercaderia, venta.observacion, venta.subgrupo_original)
          ~* '(TIPO|MODELO)[[:space:]]*:.*(CHASIS|CASIS|SERIE)[[:space:]]*:'
      )
      AND venta.fecha_factura IS NOT NULL
      AND (objetivo.np_fecha IS NULL OR venta.fecha_factura::date >= objetivo.np_fecha)
  );
$$;

CREATE OR REPLACE FUNCTION public.maquinaria_unidades_facturadas_confirmadas(
  p_unidad_ids uuid[]
)
RETURNS TABLE (unidad_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.has_module_access(auth.uid(), 'parque') THEN
    RAISE EXCEPTION 'Sin permiso para consultar operaciones de maquinas';
  END IF;

  RETURN QUERY
  SELECT solicitada.unidad_id
  FROM unnest(coalesce(p_unidad_ids, ARRAY[]::uuid[])) AS solicitada(unidad_id)
  WHERE public.maquinaria_unidad_tiene_venta_confirmada(solicitada.unidad_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.maquinaria_vincular_factura_venta(
  p_documento_id uuid,
  p_unidad_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_operacion_id uuid;
  v_solicitadas integer;
  v_validas integer;
BEGIN
  IF NOT public.maquinaria_puede_gestionar_flujo() THEN
    RAISE EXCEPTION 'Solo admin o jefatura pueden registrar facturas';
  END IF;

  SELECT operacion_id INTO v_operacion_id
  FROM public.maquinaria_documentos
  WHERE id = p_documento_id AND tipo = 'FACTURA_VENTA'
  FOR UPDATE;

  IF v_operacion_id IS NULL THEN
    RAISE EXCEPTION 'La factura no existe o no corresponde a una venta';
  END IF;

  SELECT count(DISTINCT solicitado.unidad_id) INTO v_solicitadas
  FROM unnest(coalesce(p_unidad_ids, ARRAY[]::uuid[])) AS solicitado(unidad_id);
  IF v_solicitadas = 0 THEN
    RAISE EXCEPTION 'Selecciona al menos una maquina facturada';
  END IF;

  SELECT count(*) INTO v_validas
  FROM public.maquinaria_unidades_operacion unidad
  JOIN public.maquinaria_operacion_lineas linea ON linea.id = unidad.linea_id
  WHERE linea.operacion_id = v_operacion_id
    AND unidad.id = ANY(p_unidad_ids);
  IF v_validas <> v_solicitadas THEN
    RAISE EXCEPTION 'Una unidad no pertenece a este pedido';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_unidad_ids) AS solicitada(unidad_id)
    WHERE NOT public.maquinaria_unidad_tiene_venta_confirmada(solicitada.unidad_id)
  ) THEN
    RAISE EXCEPTION 'No se encontro una venta positiva con el mismo chasis para una de las maquinas seleccionadas';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.maquinaria_facturas_venta_unidades vinculo
    WHERE vinculo.unidad_operacion_id = ANY(p_unidad_ids)
      AND vinculo.documento_id <> p_documento_id
  ) THEN
    RAISE EXCEPTION 'Una de las maquinas seleccionadas ya tiene factura';
  END IF;

  INSERT INTO public.maquinaria_facturas_venta_unidades (
    documento_id, unidad_operacion_id, estado_unidad_anterior
  )
  SELECT p_documento_id, unidad.id, unidad.estado
  FROM public.maquinaria_unidades_operacion unidad
  JOIN public.maquinaria_operacion_lineas linea ON linea.id = unidad.linea_id
  WHERE linea.operacion_id = v_operacion_id
    AND unidad.id = ANY(p_unidad_ids)
  ON CONFLICT (documento_id, unidad_operacion_id) DO NOTHING;

  UPDATE public.maquinaria_unidades_operacion unidad
  SET estado = 'FACTURADA', actualizado_en = now()
  FROM public.maquinaria_operacion_lineas linea
  WHERE linea.id = unidad.linea_id
    AND linea.operacion_id = v_operacion_id
    AND unidad.id = ANY(p_unidad_ids)
    AND unidad.estado NOT IN ('EN_PARQUE', 'TRANSFERIDA', 'CANCELADA');

  IF NOT EXISTS (
    SELECT 1
    FROM public.maquinaria_operacion_lineas linea
    JOIN public.maquinaria_unidades_operacion unidad ON unidad.linea_id = linea.id
    WHERE linea.operacion_id = v_operacion_id
      AND unidad.estado NOT IN ('FACTURADA', 'EN_PARQUE', 'TRANSFERIDA', 'CANCELADA')
  ) THEN
    UPDATE public.maquinaria_operaciones
    SET estado = 'FACTURADA', actualizado_en = now()
    WHERE id = v_operacion_id AND estado NOT IN ('CERRADA', 'CANCELADA');
  END IF;

  RETURN jsonb_build_object('vinculadas', v_solicitadas);
END;
$$;

-- Corrige vinculos creados solo por seleccion manual. El PDF se conserva en
-- maquinaria_documentos; simplemente deja de acreditar a una unidad sin venta.
CREATE TEMP TABLE maquinaria_vinculos_factura_invalidos
ON COMMIT DROP
AS
SELECT
  vinculo.documento_id,
  vinculo.unidad_operacion_id,
  vinculo.estado_unidad_anterior,
  linea.operacion_id
FROM public.maquinaria_facturas_venta_unidades vinculo
JOIN public.maquinaria_unidades_operacion unidad ON unidad.id = vinculo.unidad_operacion_id
JOIN public.maquinaria_operacion_lineas linea ON linea.id = unidad.linea_id
WHERE NOT public.maquinaria_unidad_tiene_venta_confirmada(vinculo.unidad_operacion_id);

UPDATE public.maquinaria_unidades_operacion unidad
SET estado = invalido.estado_unidad_anterior,
    actualizado_en = now()
FROM maquinaria_vinculos_factura_invalidos invalido
WHERE invalido.unidad_operacion_id = unidad.id
  AND unidad.estado = 'FACTURADA';

DELETE FROM public.maquinaria_facturas_venta_unidades vinculo
USING maquinaria_vinculos_factura_invalidos invalido
WHERE vinculo.documento_id = invalido.documento_id
  AND vinculo.unidad_operacion_id = invalido.unidad_operacion_id;

UPDATE public.maquinaria_operaciones operacion
SET estado = CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.maquinaria_operacion_lineas linea
        JOIN public.maquinaria_unidades_operacion unidad ON unidad.linea_id = linea.id
        WHERE linea.operacion_id = operacion.id AND unidad.estado = 'EN_TRANSITO'
      ) THEN 'EN_IMPORTACION'
      ELSE 'ABASTECIMIENTO'
    END,
    actualizado_en = now()
WHERE operacion.estado = 'FACTURADA'
  AND operacion.id IN (SELECT DISTINCT operacion_id FROM maquinaria_vinculos_factura_invalidos)
  AND EXISTS (
    SELECT 1
    FROM public.maquinaria_operacion_lineas linea
    JOIN public.maquinaria_unidades_operacion unidad ON unidad.linea_id = linea.id
    WHERE linea.operacion_id = operacion.id
      AND NOT public.maquinaria_unidad_tiene_venta_confirmada(unidad.id)
      AND unidad.estado <> 'CANCELADA'
  );

REVOKE ALL ON FUNCTION public.maquinaria_unidad_tiene_venta_confirmada(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.maquinaria_unidades_facturadas_confirmadas(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.maquinaria_vincular_factura_venta(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maquinaria_unidades_facturadas_confirmadas(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.maquinaria_vincular_factura_venta(uuid, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.maquinaria_unidad_tiene_venta_confirmada(uuid) IS
  'Confirma facturacion solo por una venta positiva de maquinaria con el mismo chasis y posterior a la NP.';

COMMIT;

NOTIFY pgrst, 'reload schema';
