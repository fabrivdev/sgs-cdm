BEGIN;

-- Las fechas del XML son fechas calendario, no instantes locales. El RPC v1
-- ya concentra todas las validaciones y escrituras en una transaccion; fijar
-- su TimeZone en UTC hace coherentes todos sus casts de fecha, incluidos los
-- limites de ventana, las reparaciones, las inserciones y las huellas JSON.
DO $$
BEGIN
  IF to_regprocedure(
    'public.facturacion_importar_totvs_lote_v1(jsonb,jsonb,jsonb,date,date,boolean)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'Precondicion faltante: facturacion_importar_totvs_lote_v1 no existe'
      USING ERRCODE = '42883';
  END IF;
END
$$;

-- Las preservaciones existentes se emitieron sobre el row JSON completo. La
-- migracion solo cambia la zona del RPC si cada huella vigente sigue siendo
-- exactamente reproducible en UTC; de lo contrario aborta sin reinterpretar
-- ni ampliar la allowlist auditada.
SET LOCAL TimeZone TO 'UTC';

DO $$
DECLARE
  v_identidad text;
BEGIN
  SELECT p.identidad
  INTO v_identidad
  FROM public.facturacion_totvs_preservaciones_auditadas p
  JOIN public.facturacion_lineas_importadas f ON f.id = p.linea_canonica_id
  WHERE p.linea_actualizado_en = f.actualizado_en
    AND p.linea_fingerprint IS DISTINCT FROM
      public.facturacion_totvs_fingerprint_auditado(to_jsonb(f))
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'La preservacion auditada % no reproduce su huella en UTC; no se cambia el contrato de fechas',
      v_identidad
      USING ERRCODE = 'P0001';
  END IF;
END
$$;

ALTER FUNCTION public.facturacion_importar_totvs_lote_v1(
  jsonb, jsonb, jsonb, date, date, boolean
) SET TimeZone TO 'UTC';

-- Ejecuta exactamente el RPC de persistencia y fuerza un rollback de su
-- subtransaccion. Sirve como preflight antes de escribir el maestro de
-- clientes; no promete atomicidad entre llamadas HTTP separadas.
CREATE OR REPLACE FUNCTION public.facturacion_validar_totvs_lote_v1(
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
  v_mensaje text;
  v_prefijo constant text := '__TOTVS_VALIDACION_ROLLBACK__';
BEGIN
  BEGIN
    v_resultado := public.facturacion_importar_totvs_lote_v1(
      p_importacion,
      p_resumen,
      p_lineas,
      p_desde,
      p_hasta,
      p_reemplazar_resumen
    );

    RAISE EXCEPTION '% %', v_prefijo, v_resultado::text
      USING ERRCODE = 'P0001';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      GET STACKED DIAGNOSTICS v_mensaje = MESSAGE_TEXT;
      IF v_mensaje LIKE v_prefijo || ' %' THEN
        RETURN (substring(v_mensaje FROM length(v_prefijo) + 2)::jsonb
          - 'importacion_id')
          || jsonb_build_object('validacion', true);
      END IF;
      RAISE;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.facturacion_validar_totvs_lote_v1(
  jsonb, jsonb, jsonb, date, date, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.facturacion_validar_totvs_lote_v1(
  jsonb, jsonb, jsonb, date, date, boolean
) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
