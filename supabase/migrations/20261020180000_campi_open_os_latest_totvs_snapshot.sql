-- Panorama lee solo las identidades del ultimo XML TOTVS de OS completado.
-- El historial anterior permanece en ordenes_servicio_importadas para otros usos.
CREATE TABLE IF NOT EXISTS public.campi_os_abiertas_cortes_totvs (
  fecha date PRIMARY KEY,
  abiertas integer NOT NULL CHECK (abiertas >= 0),
  importacion_id uuid NOT NULL REFERENCES public.importaciones(id),
  registradas_en timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.campi_os_abiertas_cortes_totvs FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.campi_os_snapshot_numeros_v1()
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp SET statement_timeout = '30s' AS $fn$
DECLARE
  v_import public.importaciones%ROWTYPE;
  v_ids text[];
  v_report_ids text[];
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_module_access(auth.uid(), 'servicios')
     OR NOT public.has_section_access(auth.uid(), 'servicios.ordenes') THEN
    RAISE EXCEPTION 'Sin acceso a órdenes de servicio' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_import FROM public.importaciones
  WHERE origen_sistema = 'new_xml_ordenes_servicio'
  ORDER BY creado_en DESC, id DESC LIMIT 1;
  IF NOT FOUND OR v_import.insertados <= 0 THEN
    RAISE EXCEPTION 'El último corte TOTVS de OS no está completo o no tiene identidades' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_import.metadata -> 'snapshot_os_numbers') = 'array' THEN
    SELECT array_agg(j.value ORDER BY j.value) INTO v_ids
    FROM jsonb_array_elements_text(v_import.metadata -> 'snapshot_os_numbers') AS j(value);
  ELSIF jsonb_typeof(v_import.metadata -> 'os_lotes_confirmados') = 'object' THEN
    -- La version publica anterior del importador ya guarda las OS de cada
    -- lote. Reconstruir el mismo universo mientras se despliega el frontend.
    SELECT array_agg(x.id ORDER BY x.id) INTO v_report_ids
    FROM jsonb_each(v_import.metadata -> 'os_lotes_confirmados') AS batch
    CROSS JOIN LATERAL jsonb_array_elements_text(batch.value) AS x(id);
    IF cardinality(v_report_ids) IS NULL
       OR cardinality(v_report_ids) <> (SELECT count(DISTINCT id) FROM unnest(v_report_ids) AS candidate(id))
       OR (SELECT count(*) FROM unnest(v_report_ids) AS candidate(id)
           JOIN public.os_exclusiones_confirmadas e ON e.os_numero = candidate.id)
          <> coalesce((v_import.metadata ->> 'os_excluidas_confirmadas')::integer, 0) THEN
      RAISE EXCEPTION 'El último reporte TOTVS de OS no concilia con sus exclusiones' USING ERRCODE = '22023';
    END IF;
    SELECT array_agg(candidate.id ORDER BY candidate.id) INTO v_ids
    FROM unnest(v_report_ids) AS candidate(id)
    WHERE NOT EXISTS (SELECT 1 FROM public.os_exclusiones_confirmadas e WHERE e.os_numero = candidate.id);
  ELSE
    RAISE EXCEPTION 'El último corte TOTVS de OS no tiene identidades confirmadas' USING ERRCODE = '22023';
  END IF;
  IF cardinality(v_ids) <> v_import.insertados
     OR cardinality(v_ids) <> (SELECT count(DISTINCT x.id) FROM unnest(v_ids) AS x(id))
     OR EXISTS (SELECT 1 FROM unnest(v_ids) AS x(id) WHERE nullif(btrim(x.id), '') IS NULL)
     OR (SELECT count(*) FROM public.ordenes_servicio_importadas o
         WHERE o.os_numero = ANY(v_ids) AND o.raw_data ? 'source_os_number') <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'El último corte TOTVS de OS no concilia con las órdenes persistidas' USING ERRCODE = '22023';
  END IF;
  RETURN v_ids;
END;
$fn$;
REVOKE ALL ON FUNCTION public.campi_os_snapshot_numeros_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.campi_os_snapshot_numeros_v1() TO authenticated;

CREATE OR REPLACE FUNCTION public.campi_os_abiertas_capturar_v1()
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp SET statement_timeout = '30s' AS $fn$
DECLARE v_importacion_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_module_access(auth.uid(), 'servicios')
     OR NOT public.has_section_access(auth.uid(), 'servicios.ordenes') THEN
    RAISE EXCEPTION 'Sin acceso a órdenes de servicio' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO v_importacion_id FROM public.importaciones
  WHERE origen_sistema = 'new_xml_ordenes_servicio' ORDER BY creado_en DESC, id DESC LIMIT 1;
  INSERT INTO public.campi_os_abiertas_cortes_totvs (fecha, abiertas, importacion_id)
  SELECT (now() AT TIME ZONE 'America/Asuncion')::date, count(*), v_importacion_id
  FROM public.ordenes_servicio_importadas
  WHERE situacion_os ILIKE '%abiert%' AND os_numero = ANY(public.campi_os_snapshot_numeros_v1())
  ON CONFLICT (fecha) DO UPDATE SET abiertas = excluded.abiertas,
    importacion_id = excluded.importacion_id, registradas_en = now();
END;
$fn$;
REVOKE ALL ON FUNCTION public.campi_os_abiertas_capturar_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.campi_os_abiertas_capturar_v1() TO authenticated;

-- Se reemplazan abajo las dos funciones de lectura ya instaladas, manteniendo
-- su contrato de permisos y sus calculos de cierres sin cambios.
CREATE OR REPLACE FUNCTION public.campi_resolucion_os_v1()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp SET statement_timeout = '30s' AS $fn$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_module_access(auth.uid(), 'servicios')
     OR NOT public.has_section_access(auth.uid(), 'servicios.ordenes') THEN
    RAISE EXCEPTION 'Sin acceso a órdenes de servicio' USING ERRCODE = '42501';
  END IF;
  WITH periods AS (
    SELECT (date_trunc('month', (now() AT TIME ZONE 'America/Asuncion')::date) - interval '1 month')::date AS ultimo_mes,
           (date_trunc('month', (now() AT TIME ZONE 'America/Asuncion')::date) - interval '2 months')::date AS mes_anterior
  ), closed AS MATERIALIZED (
    SELECT o.os_numero, o.fecha_abierta_os::date AS apertura, o.fecha_cierre_os::date AS cierre,
           (o.fecha_cierre_os::date - o.fecha_abierta_os::date) AS dias
    FROM public.ordenes_servicio_importadas o WHERE o.situacion_os ILIKE '%cerrad%'
  ), period_stats AS (
    SELECT p.ultimo_mes, p.mes_anterior,
      count(*) FILTER (WHERE c.cierre >= p.ultimo_mes AND c.cierre < p.ultimo_mes + interval '1 month') AS cierres_ultimo_mes,
      count(*) FILTER (WHERE c.cierre >= p.mes_anterior AND c.cierre < p.ultimo_mes) AS cierres_mes_anterior,
      count(*) FILTER (WHERE c.cierre >= p.ultimo_mes AND c.cierre < p.ultimo_mes + interval '1 month' AND (c.apertura IS NULL OR c.dias < 0)) AS invalidas_ultimo_mes,
      count(*) FILTER (WHERE c.cierre >= p.mes_anterior AND c.cierre < p.ultimo_mes AND (c.apertura IS NULL OR c.dias < 0)) AS invalidas_mes_anterior,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY c.dias) FILTER (WHERE c.cierre >= p.ultimo_mes AND c.cierre < p.ultimo_mes + interval '1 month' AND c.dias >= 0) AS mediana_ultimo_mes,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY c.dias) FILTER (WHERE c.cierre >= p.mes_anterior AND c.cierre < p.ultimo_mes AND c.dias >= 0) AS mediana_mes_anterior,
      count(c.os_numero) FILTER (WHERE c.cierre IS NULL) AS historicas_sin_cierre
    FROM periods p LEFT JOIN closed c ON true GROUP BY p.ultimo_mes, p.mes_anterior
  ), open_stats AS (
    SELECT count(*) AS abiertas,
           count(*) FILTER (WHERE fecha_abierta_os IS NULL OR fecha_abierta_os::date > (now() AT TIME ZONE 'America/Asuncion')::date) AS apertura_invalida,
           percentile_cont(0.9) WITHIN GROUP (ORDER BY (now() AT TIME ZONE 'America/Asuncion')::date - fecha_abierta_os::date)
             FILTER (WHERE fecha_abierta_os IS NOT NULL AND fecha_abierta_os::date <= (now() AT TIME ZONE 'America/Asuncion')::date) AS p90_edad_abiertas
    FROM public.ordenes_servicio_importadas
    WHERE situacion_os ILIKE '%abiert%' AND os_numero = ANY(public.campi_os_snapshot_numeros_v1())
  )
  SELECT jsonb_build_object(
    'fecha_analisis', (now() AT TIME ZONE 'America/Asuncion')::date, 'ultimo_mes', p.ultimo_mes, 'mes_anterior', p.mes_anterior,
    'cierres_ultimo_mes', p.cierres_ultimo_mes, 'cierres_mes_anterior', p.cierres_mes_anterior,
    'invalidas_ultimo_mes', p.invalidas_ultimo_mes, 'invalidas_mes_anterior', p.invalidas_mes_anterior,
    'mediana_ultimo_mes', p.mediana_ultimo_mes, 'mediana_mes_anterior', p.mediana_mes_anterior,
    'historicas_sin_cierre', p.historicas_sin_cierre,
    'abiertas', o.abiertas, 'apertura_invalida', o.apertura_invalida, 'p90_edad_abiertas', o.p90_edad_abiertas
  ) INTO result FROM period_stats p CROSS JOIN open_stats o;
  RETURN result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.campi_os_abiertas_detalle_v1()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp SET statement_timeout = '30s' AS $fn$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_module_access(auth.uid(), 'servicios')
     OR NOT public.has_section_access(auth.uid(), 'servicios.ordenes') THEN
    RAISE EXCEPTION 'Sin acceso a órdenes de servicio' USING ERRCODE = '42501';
  END IF;
  WITH open_orders AS MATERIALIZED (
    SELECT os_numero, coalesce(nullif(btrim(marca),''),'Sin marca') AS marca,
           fecha_abierta_os::date AS apertura,
           (now() AT TIME ZONE 'America/Asuncion')::date - fecha_abierta_os::date AS edad
    FROM public.ordenes_servicio_importadas
    WHERE situacion_os ILIKE '%abiert%' AND os_numero = ANY(public.campi_os_snapshot_numeros_v1())
  ), brands AS (
    SELECT marca, count(*) AS cantidad FROM open_orders GROUP BY marca
  ), ages AS (
    SELECT CASE WHEN edad < 0 OR edad IS NULL THEN 'Sin fecha válida'
                WHEN edad <= 7 THEN '0–7 días' WHEN edad <= 30 THEN '8–30 días'
                WHEN edad <= 90 THEN '31–90 días' ELSE 'Más de 90 días' END AS rango,
           CASE WHEN edad BETWEEN 0 AND 7 THEN 1 WHEN edad BETWEEN 8 AND 30 THEN 2
                WHEN edad BETWEEN 31 AND 90 THEN 3 WHEN edad > 90 THEN 4 ELSE 5 END AS orden,
           count(*) AS cantidad FROM open_orders GROUP BY 1,2
  )
  SELECT jsonb_build_object(
    'fecha_analisis', (now() AT TIME ZONE 'America/Asuncion')::date,
    'abiertas', (SELECT count(*) FROM open_orders),
    'os_numeros', (SELECT coalesce(jsonb_agg(os_numero ORDER BY os_numero), '[]'::jsonb) FROM open_orders),
    'marcas', (SELECT coalesce(jsonb_agg(jsonb_build_object('nombre',marca,'cantidad',cantidad)
       ORDER BY cantidad DESC, marca), '[]'::jsonb) FROM brands),
    'edades', (SELECT coalesce(jsonb_agg(jsonb_build_object('rango',rango,'cantidad',cantidad)
       ORDER BY orden), '[]'::jsonb) FROM ages),
    'cortes', (SELECT coalesce(jsonb_agg(jsonb_build_object('fecha',fecha,'abiertas',abiertas)
       ORDER BY fecha), '[]'::jsonb) FROM (
         SELECT fecha, abiertas FROM public.campi_os_abiertas_cortes_totvs ORDER BY fecha DESC LIMIT 60
       ) historia)
  ) INTO result;
  RETURN result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.campi_resolucion_os_v1() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.campi_os_abiertas_detalle_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.campi_resolucion_os_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.campi_os_abiertas_detalle_v1() TO authenticated;

-- Adoptar el ultimo corte ya importado desde el manifiesto de lotes
-- confirmado por el propio importador. Una OS anulada por decision previa
-- permanece en el XML, pero no forma parte de las 319 persistidas.
DO $seed$
DECLARE
  v_import public.importaciones%ROWTYPE;
  v_report_ids text[];
  v_ids text[];
BEGIN
  SELECT * INTO v_import FROM public.importaciones
  WHERE origen_sistema = 'new_xml_ordenes_servicio'
  ORDER BY creado_en DESC, id DESC LIMIT 1;

  IF v_import.archivo_nombre = 'ordenes_de_servicio_072008.xml'
     AND v_import.insertados > 0
     AND jsonb_typeof(v_import.metadata -> 'os_lotes_confirmados') = 'object' THEN
    SELECT array_agg(x.id ORDER BY x.id) INTO v_report_ids
    FROM jsonb_each(v_import.metadata -> 'os_lotes_confirmados') AS batch
    CROSS JOIN LATERAL jsonb_array_elements_text(batch.value) AS x(id);

    IF cardinality(v_report_ids) IS NULL
       OR cardinality(v_report_ids) <> (SELECT count(DISTINCT id) FROM unnest(v_report_ids) AS candidate(id))
       OR (SELECT count(*) FROM unnest(v_report_ids) AS candidate(id)
           JOIN public.os_exclusiones_confirmadas e ON e.os_numero = candidate.id)
          <> coalesce((v_import.metadata ->> 'os_excluidas_confirmadas')::integer, 0) THEN
      RAISE EXCEPTION 'El manifiesto del ultimo XML TOTVS de OS no concilia con sus exclusiones';
    END IF;

    SELECT array_agg(candidate.id ORDER BY candidate.id) INTO v_ids
    FROM unnest(v_report_ids) AS candidate(id)
    WHERE NOT EXISTS (SELECT 1 FROM public.os_exclusiones_confirmadas e WHERE e.os_numero = candidate.id);

    IF cardinality(v_ids) <> v_import.insertados
       OR (SELECT count(*) FROM public.ordenes_servicio_importadas o
           WHERE o.os_numero = ANY(v_ids) AND o.raw_data ? 'source_os_number') <> cardinality(v_ids) THEN
      RAISE EXCEPTION 'El ultimo XML TOTVS de OS no concilia con las ordenes persistidas';
    END IF;

    UPDATE public.importaciones
    SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('snapshot_os_numbers', to_jsonb(v_ids))
    WHERE id = v_import.id;

    INSERT INTO public.campi_os_abiertas_cortes_totvs (fecha, abiertas, importacion_id)
    SELECT (now() AT TIME ZONE 'America/Asuncion')::date, count(*), v_import.id
    FROM public.ordenes_servicio_importadas
    WHERE situacion_os ILIKE '%abiert%' AND os_numero = ANY(v_ids)
    ON CONFLICT (fecha) DO UPDATE SET abiertas = excluded.abiertas,
      importacion_id = excluded.importacion_id, registradas_en = now();
  END IF;
END;
$seed$;
NOTIFY pgrst, 'reload schema';
