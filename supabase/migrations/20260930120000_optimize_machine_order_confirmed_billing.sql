-- Evita ejecutar una busqueda completa de ventas por cada unidad solicitada.
-- Esta migracion solo reemplaza la RPC de lectura: no corrige vinculos, no
-- recalcula estados y no modifica datos comerciales.

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
  WITH solicitadas AS MATERIALIZED (
    SELECT solicitud.unidad_id, solicitud.ordinalidad
    FROM unnest(coalesce(p_unidad_ids, ARRAY[]::uuid[]))
      WITH ORDINALITY AS solicitud(unidad_id, ordinalidad)
  ),
  unidades_objetivo AS MATERIALIZED (
    SELECT
      unidad.id AS unidad_id,
      public.normalizar_chasis_notificacion(coalesce(
        nullif(btrim(unidad.chasis), ''),
        nullif(btrim(stock.chasis), ''),
        nullif(btrim(importacion.chasis), '')
      )) AS chasis_normalizado,
      operacion.np_fecha
    FROM (
      SELECT DISTINCT solicitud.unidad_id
      FROM solicitadas solicitud
    ) pedida
    JOIN public.maquinaria_unidades_operacion unidad
      ON unidad.id = pedida.unidad_id
    JOIN public.maquinaria_operacion_lineas linea
      ON linea.id = unidad.linea_id
    JOIN public.maquinaria_operaciones operacion
      ON operacion.id = linea.operacion_id
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
      WHERE i.unidad_id = unidad.id
        AND i.activa
      ORDER BY i.actualizado_en DESC NULLS LAST
      LIMIT 1
    ) importacion ON true
  ),
  ventas_candidatas AS MATERIALIZED (
    SELECT
      public.normalizar_chasis_notificacion(
        public.extraer_chasis_venta_maquina(
          concat_ws(' | ', venta.mercaderia, venta.observacion, venta.subgrupo_original),
          venta.raw_data,
          nullif(venta.raw_data ->> 'linked_service_order', '')
        )
      ) AS chasis_normalizado,
      venta.fecha_factura::date AS fecha_factura
    FROM public.facturacion_lineas_importadas venta
    WHERE coalesce(venta.cantidad, 0) > 0
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
  )
  SELECT solicitud.unidad_id
  FROM solicitadas solicitud
  JOIN unidades_objetivo objetivo
    ON objetivo.unidad_id = solicitud.unidad_id
  WHERE objetivo.chasis_normalizado IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM ventas_candidatas venta
      WHERE venta.chasis_normalizado = objetivo.chasis_normalizado
        AND (objetivo.np_fecha IS NULL OR venta.fecha_factura >= objetivo.np_fecha)
    )
  ORDER BY solicitud.ordinalidad;
END;
$$;

REVOKE ALL ON FUNCTION public.maquinaria_unidades_facturadas_confirmadas(uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maquinaria_unidades_facturadas_confirmadas(uuid[])
  TO authenticated;

COMMENT ON FUNCTION public.maquinaria_unidades_facturadas_confirmadas(uuid[]) IS
  'Confirma por lote unidades con venta positiva del mismo chasis posterior a la NP, sin modificar datos.';

NOTIFY pgrst, 'reload schema';
