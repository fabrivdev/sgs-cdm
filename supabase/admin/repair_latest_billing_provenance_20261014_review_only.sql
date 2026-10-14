-- Reparacion puntual de procedencia. Ejecutar manualmente solo en el proyecto
-- verificado, despues de consultar los controles; no elimina lineas de factura.
-- Esta tabla/RPC proviene de migraciones de consolidacion aun fuera de main.
BEGIN;

DO $$
DECLARE
  v_load constant uuid := '60c2ff01-dd47-448a-8816-285ae184430f';
  v_hash constant text := '23a2429af54d009873d41e3fe87a3b02bc35e25716b5f479b5a3483a5b045f3f';
  v_total integer;
  v_dated integer;
  v_undated integer;
  v_removed integer;
BEGIN
  IF to_regclass('public.facturacion_totvs_carga_lineas') IS NULL THEN
    RAISE EXCEPTION 'Falta la tabla de procedencia de facturacion' USING ERRCODE='42P01';
  END IF;
  PERFORM 1 FROM public.importaciones i
  WHERE i.id=v_load AND lower(i.archivo_sha256)=v_hash
    AND i.total_filas=4119 AND i.insertados=4117
    AND i.metadata->>'technicalLoadState'='COMPLETE'
    AND (i.metadata->>'technicalProvenanceLinkedLines')::integer=4117
    AND (i.metadata->>'lineas_excluidas_confirmadas')::integer=2
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La carga de facturacion ya no coincide con la evidencia revisada'
      USING ERRCODE='23514';
  END IF;

  SELECT count(*)::integer,
    count(*) FILTER (WHERE f.fecha_factura IS NOT NULL)::integer,
    count(*) FILTER (WHERE f.fecha_factura IS NULL)::integer
  INTO v_total,v_dated,v_undated
  FROM public.facturacion_totvs_carga_lineas l
  JOIN public.facturacion_lineas_importadas f ON f.id=l.linea_id
  WHERE l.importacion_id=v_load;
  IF (v_total,v_dated,v_undated) IS DISTINCT FROM (4892,4117,775) THEN
    RAISE EXCEPTION 'Procedencia distinta a 4892=4117+775: %=%+%',v_total,v_dated,v_undated
      USING ERRCODE='23514';
  END IF;

  CREATE TABLE IF NOT EXISTS public.facturacion_totvs_vinculos_retirados_auditoria (
    importacion_id uuid NOT NULL,
    linea_id uuid NOT NULL,
    documento_fuente_sha256 text NOT NULL,
    motivo text NOT NULL,
    retirado_en timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (importacion_id,linea_id)
  );
  REVOKE ALL ON public.facturacion_totvs_vinculos_retirados_auditoria
    FROM PUBLIC,anon,authenticated;
  ALTER TABLE public.facturacion_totvs_vinculos_retirados_auditoria ENABLE ROW LEVEL SECURITY;

  WITH retirados AS (
    DELETE FROM public.facturacion_totvs_carga_lineas l
    USING public.facturacion_lineas_importadas f
    WHERE l.importacion_id=v_load AND f.id=l.linea_id
      AND f.fecha_factura IS NULL
    RETURNING l.importacion_id,l.linea_id,l.documento_fuente_sha256
  )
  INSERT INTO public.facturacion_totvs_vinculos_retirados_auditoria(
    importacion_id,linea_id,documento_fuente_sha256,motivo
  )
  SELECT importacion_id,linea_id,documento_fuente_sha256,
    'No figura en el archivo acreditado de 4117 lineas; fila historica sin fecha'
  FROM retirados;
  GET DIAGNOSTICS v_removed=ROW_COUNT;
  IF v_removed<>775 THEN
    RAISE EXCEPTION 'Se retiraron % vinculos, se esperaban 775',v_removed USING ERRCODE='23514';
  END IF;
  SELECT count(*)::integer INTO v_total
  FROM public.facturacion_totvs_carga_lineas WHERE importacion_id=v_load;
  IF v_total<>4117 THEN
    RAISE EXCEPTION 'La carga quedo con % vinculos en vez de 4117',v_total USING ERRCODE='23514';
  END IF;
END;
$$;

-- Impide que futuras cargas acrediten lineas historicas sin fecha como fuente.
CREATE OR REPLACE FUNCTION public.facturacion_totvs_rechazar_vinculo_sin_fecha_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.facturacion_lineas_importadas f
    WHERE f.id=NEW.linea_id AND f.fecha_factura IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'No se puede acreditar procedencia TOTVS de una linea sin fecha de factura'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS facturacion_totvs_vinculo_fecha_guard
  ON public.facturacion_totvs_carga_lineas;
CREATE TRIGGER facturacion_totvs_vinculo_fecha_guard
BEFORE INSERT OR UPDATE OF linea_id ON public.facturacion_totvs_carga_lineas
FOR EACH ROW EXECUTE FUNCTION public.facturacion_totvs_rechazar_vinculo_sin_fecha_v1();

COMMIT;
