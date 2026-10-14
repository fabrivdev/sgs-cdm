-- Retira solamente los 775 vinculos adicionales a copias historicas sin fecha
-- de la ultima carga acreditada. Conserva todas las lineas de factura.
BEGIN;
DO $$
DECLARE
  v_load constant uuid := 'bf009e00-ea5c-467e-92b8-c615325aed72';
  v_hash constant text := '7254a9b1b2cbeba9783dc6b5342763fb6ecfa625aa8ffa18ee96c5d7a2cc355a';
  v_total integer;
  v_fechadas integer;
  v_sin_fecha integer;
  v_pares integer;
  v_retirados integer;
BEGIN
  PERFORM 1 FROM public.importaciones i
  WHERE i.id=v_load AND lower(i.archivo_sha256)=v_hash
    AND i.total_filas=4177 AND i.insertados=4175
    AND i.metadata->>'technicalLoadState'='COMPLETE'
    AND (i.metadata->>'technicalProvenanceLinkedLines')::integer=4175
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La ultima carga de facturacion ya no coincide con el corte auditado'
      USING ERRCODE='23514';
  END IF;

  SELECT count(*)::integer,
    count(*) FILTER (WHERE f.fecha_factura IS NOT NULL)::integer,
    count(*) FILTER (WHERE f.fecha_factura IS NULL)::integer,
    count(*) FILTER (WHERE f.fecha_factura IS NULL
      AND p.linea_canonica_id IS NOT NULL
      AND c.fecha_factura IS NOT NULL
      AND lc.linea_id IS NOT NULL)::integer
  INTO v_total,v_fechadas,v_sin_fecha,v_pares
  FROM public.facturacion_totvs_carga_lineas l
  JOIN public.facturacion_lineas_importadas f ON f.id=l.linea_id
  LEFT JOIN public.facturacion_dedupe_repair_pairs p ON p.linea_descartada_id=f.id
  LEFT JOIN public.facturacion_lineas_importadas c ON c.id=p.linea_canonica_id
  LEFT JOIN public.facturacion_totvs_carga_lineas lc
    ON lc.importacion_id=l.importacion_id AND lc.linea_id=c.id
  WHERE l.importacion_id=v_load;
  IF (v_total,v_fechadas,v_sin_fecha,v_pares)
      IS DISTINCT FROM (4950,4175,775,775) THEN
    RAISE EXCEPTION 'Vinculos inesperados: total %, fechadas %, sin fecha %, pares %',
      v_total,v_fechadas,v_sin_fecha,v_pares USING ERRCODE='23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.facturacion_totvs_vinculos_retirados_auditoria
    WHERE importacion_id=v_load
  ) THEN
    RAISE EXCEPTION 'Esta carga ya tiene reparacion auditada' USING ERRCODE='23514';
  END IF;

  WITH retirados AS (
    DELETE FROM public.facturacion_totvs_carga_lineas l
    USING public.facturacion_lineas_importadas f
    WHERE l.importacion_id=v_load AND l.linea_id=f.id
      AND f.fecha_factura IS NULL
    RETURNING l.importacion_id,l.linea_id,l.documento_fuente_sha256
  )
  INSERT INTO public.facturacion_totvs_vinculos_retirados_auditoria(
    importacion_id,linea_id,documento_fuente_sha256,motivo
  )
  SELECT importacion_id,linea_id,documento_fuente_sha256,
    'Vinculo adicional a copia historica sin fecha; la version canonica fechada permanece acreditada'
  FROM retirados;
  GET DIAGNOSTICS v_retirados=ROW_COUNT;
  IF v_retirados<>775 THEN
    RAISE EXCEPTION 'Se retiraron % vinculos en vez de 775',v_retirados
      USING ERRCODE='23514';
  END IF;
  SELECT count(*)::integer INTO v_total
  FROM public.facturacion_totvs_carga_lineas WHERE importacion_id=v_load;
  IF v_total<>4175 THEN
    RAISE EXCEPTION 'Quedaron % vinculos en vez de 4175',v_total
      USING ERRCODE='23514';
  END IF;
END;
$$;
COMMIT;
