-- El XML de Ordenes de Servicio del sistema nuevo es una foto completa del
-- periodo informado. Hasta ahora el importador solo actualizaba las OS que
-- reaparecian y dejaba activas las ausentes. Eso duplico, entre otras, la OS
-- 01-00000110 frente a la OS real 01-00000165 del chasis 49300313.
--
-- Las ausencias seguras se archivan antes de salir de la tabla operativa. No
-- se retiran automaticamente OS con factura, trabajo vinculado o jornadas ya
-- liquidadas: esos casos se informan como bloqueados para revision humana.

CREATE TABLE IF NOT EXISTS public.ordenes_servicio_importadas_archivo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  os_numero text NOT NULL,
  registro jsonb NOT NULL,
  motivo text NOT NULL,
  importacion_reconciliadora_id uuid
    REFERENCES public.importaciones(id) ON DELETE SET NULL,
  archivado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  archivado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ordenes_servicio_archivo_os_idx
  ON public.ordenes_servicio_importadas_archivo (os_numero, archivado_en DESC);

ALTER TABLE public.ordenes_servicio_importadas_archivo ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ordenes_servicio_importadas_archivo FROM PUBLIC, anon;
GRANT SELECT, INSERT ON TABLE public.ordenes_servicio_importadas_archivo TO authenticated;

DROP POLICY IF EXISTS "Administracion consulta archivo OS"
  ON public.ordenes_servicio_importadas_archivo;
CREATE POLICY "Administracion consulta archivo OS"
  ON public.ordenes_servicio_importadas_archivo
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
    OR public.has_role(auth.uid(), 'cabecilla'::public.app_role)
  );

DROP POLICY IF EXISTS "Administracion archiva OS"
  ON public.ordenes_servicio_importadas_archivo;
CREATE POLICY "Administracion archiva OS"
  ON public.ordenes_servicio_importadas_archivo
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
    OR public.has_role(auth.uid(), 'cabecilla'::public.app_role)
  );

CREATE OR REPLACE FUNCTION public.ordenes_servicio_reconciliar_snapshot(
  p_importacion_id uuid,
  p_desde date,
  p_hasta date,
  p_os_numeros text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_origen text;
  v_os_numeros text[];
  v_ausentes integer := 0;
  v_archivadas integer := 0;
  v_jornadas_desactivadas integer := 0;
  v_bloqueadas integer := 0;
  v_bloqueadas_factura integer := 0;
  v_bloqueadas_trabajo integer := 0;
  v_bloqueadas_liquidacion integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (
       public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
       OR public.has_role(auth.uid(), 'cabecilla'::public.app_role)
     ) THEN
    RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501';
  END IF;

  IF p_importacion_id IS NULL THEN
    RAISE EXCEPTION 'La importacion reconciliadora es obligatoria'
      USING ERRCODE = '22023';
  END IF;

  SELECT i.origen_sistema
  INTO v_origen
  FROM public.importaciones i
  WHERE i.id = p_importacion_id;

  IF NOT FOUND OR v_origen IS DISTINCT FROM 'new_xml_ordenes_servicio' THEN
    RAISE EXCEPTION 'La importacion no corresponde al XML de ordenes de servicio'
      USING ERRCODE = '22023';
  END IF;

  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde
     OR p_desde < DATE '2026-07-01' THEN
    RAISE EXCEPTION 'Rango de reemplazo de OS invalido'
      USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(array_agg(n.os_numero ORDER BY n.os_numero), '{}'::text[])
  INTO v_os_numeros
  FROM (
    SELECT DISTINCT upper(btrim(value)) AS os_numero
    FROM unnest(coalesce(p_os_numeros, '{}'::text[])) AS value
    WHERE nullif(btrim(value), '') IS NOT NULL
  ) n;

  IF cardinality(v_os_numeros) = 0 THEN
    RAISE EXCEPTION 'No se puede reconciliar una foto de OS vacia'
      USING ERRCODE = '22023';
  END IF;

  CREATE TEMP TABLE os_snapshot_ausentes ON COMMIT DROP AS
  SELECT
    os.os_numero,
    (
      nullif(btrim(os.factura), '') IS NOT NULL
      OR lower(coalesce(os.situacion_facturacion, '')) LIKE '%factur%'
    ) AS tiene_factura,
    os.trabajo_id IS NOT NULL AS tiene_trabajo,
    EXISTS (
      SELECT 1
      FROM public.comisiones_jornadas j
      JOIN public.comisiones_liquidacion_detalle d ON d.jornada_id = j.id
      WHERE upper(btrim(j.os_numero)) = upper(btrim(os.os_numero))
    ) AS tiene_liquidacion
  FROM public.ordenes_servicio_importadas os
  WHERE os.raw_data ->> 'import_era' = 'new'
    AND coalesce(
      os.fecha_abierta_os,
      os.fecha_cierre_os,
      os.fecha_emision_factura
    )::date BETWEEN p_desde AND p_hasta
    AND NOT (upper(btrim(os.os_numero)) = ANY(v_os_numeros));

  SELECT
    count(*),
    count(*) FILTER (WHERE tiene_factura OR tiene_trabajo OR tiene_liquidacion),
    count(*) FILTER (WHERE tiene_factura),
    count(*) FILTER (WHERE tiene_trabajo),
    count(*) FILTER (WHERE tiene_liquidacion)
  INTO
    v_ausentes,
    v_bloqueadas,
    v_bloqueadas_factura,
    v_bloqueadas_trabajo,
    v_bloqueadas_liquidacion
  FROM os_snapshot_ausentes;

  CREATE TEMP TABLE os_snapshot_retirables ON COMMIT DROP AS
  SELECT a.os_numero
  FROM os_snapshot_ausentes a
  WHERE NOT a.tiene_factura
    AND NOT a.tiene_trabajo
    AND NOT a.tiene_liquidacion;

  INSERT INTO public.ordenes_servicio_importadas_archivo (
    os_numero,
    registro,
    motivo,
    importacion_reconciliadora_id,
    archivado_por
  )
  SELECT
    os.os_numero,
    to_jsonb(os),
    'Ausente de la foto completa de OS ' || p_desde::text || ' a ' || p_hasta::text,
    p_importacion_id,
    auth.uid()
  FROM public.ordenes_servicio_importadas os
  JOIN os_snapshot_retirables r ON r.os_numero = os.os_numero;
  GET DIAGNOSTICS v_archivadas = ROW_COUNT;

  UPDATE public.comisiones_jornadas j
  SET vigente = false,
      actualizado_en = now()
  WHERE EXISTS (
      SELECT 1
      FROM os_snapshot_retirables r
      WHERE upper(btrim(r.os_numero)) = upper(btrim(j.os_numero))
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.comisiones_liquidacion_detalle d
      WHERE d.jornada_id = j.id
    );
  GET DIAGNOSTICS v_jornadas_desactivadas = ROW_COUNT;

  DELETE FROM public.ordenes_servicio_importadas os
  USING os_snapshot_retirables r
  WHERE os.os_numero = r.os_numero;

  UPDATE public.importaciones i
  SET metadata = coalesce(i.metadata, '{}'::jsonb) || jsonb_build_object(
    'reconciliacion_os', jsonb_build_object(
      'desde', p_desde,
      'hasta', p_hasta,
      'os_en_archivo', cardinality(v_os_numeros),
      'ausentes_detectadas', v_ausentes,
      'archivadas', v_archivadas,
      'jornadas_desactivadas', v_jornadas_desactivadas,
      'bloqueadas', v_bloqueadas,
      'bloqueadas_con_factura', v_bloqueadas_factura,
      'bloqueadas_con_trabajo', v_bloqueadas_trabajo,
      'bloqueadas_con_liquidacion', v_bloqueadas_liquidacion
    )
  )
  WHERE i.id = p_importacion_id;

  RETURN jsonb_build_object(
    'ausentes', v_ausentes,
    'archivadas', v_archivadas,
    'jornadas_desactivadas', v_jornadas_desactivadas,
    'bloqueadas', v_bloqueadas,
    'bloqueadas_con_factura', v_bloqueadas_factura,
    'bloqueadas_con_trabajo', v_bloqueadas_trabajo,
    'bloqueadas_con_liquidacion', v_bloqueadas_liquidacion
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ordenes_servicio_reconciliar_snapshot(uuid, date, date, text[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ordenes_servicio_reconciliar_snapshot(uuid, date, date, text[])
  TO authenticated;

-- Corrige inmediatamente el caso ya comprobado. La guarda exige que la 110
-- siga sin factura/trabajo/liquidacion y que exista la 165 facturada para el
-- mismo chasis. Si algun dato cambio, no toca nada.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.ordenes_servicio_importadas antigua
    WHERE antigua.os_numero = '01-00000110'
      AND regexp_replace(upper(coalesce(antigua.nro_chasis, '')), '[^A-Z0-9]', '', 'g') = '49300313'
      AND antigua.raw_data ->> 'import_era' = 'new'
      AND nullif(btrim(antigua.factura), '') IS NULL
      AND lower(coalesce(antigua.situacion_facturacion, '')) NOT LIKE '%factur%'
      AND antigua.trabajo_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.comisiones_jornadas j
        JOIN public.comisiones_liquidacion_detalle d ON d.jornada_id = j.id
        WHERE upper(btrim(j.os_numero)) = upper(btrim(antigua.os_numero))
      )
      AND EXISTS (
        SELECT 1
        FROM public.ordenes_servicio_importadas vigente
        WHERE vigente.os_numero = '01-00000165'
          AND regexp_replace(upper(coalesce(vigente.nro_chasis, '')), '[^A-Z0-9]', '', 'g') = '49300313'
          AND (
            nullif(btrim(vigente.factura), '') IS NOT NULL
            OR lower(coalesce(vigente.situacion_facturacion, '')) LIKE '%factur%'
          )
      )
  ) THEN
    INSERT INTO public.ordenes_servicio_importadas_archivo (
      os_numero,
      registro,
      motivo,
      importacion_reconciliadora_id,
      archivado_por
    )
    SELECT
      os.os_numero,
      to_jsonb(os),
      'Correccion verificada: OS 01-00000110 ausente del Excel y reemplazada por 01-00000165',
      NULL,
      NULL
    FROM public.ordenes_servicio_importadas os
    WHERE os.os_numero = '01-00000110';

    UPDATE public.comisiones_jornadas j
    SET vigente = false,
        actualizado_en = now()
    WHERE upper(btrim(j.os_numero)) = '01-00000110'
      AND NOT EXISTS (
        SELECT 1
        FROM public.comisiones_liquidacion_detalle d
        WHERE d.jornada_id = j.id
      );

    DELETE FROM public.ordenes_servicio_importadas
    WHERE os_numero = '01-00000110';

  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
