-- Las primeras jornadas de Comisiones ya guardaban el producto que originó
-- cada participante, pero todavía no incluían `source_participant_origin`.
-- Se reconstruye esa metadata únicamente desde los códigos MA01, KM y SE del
-- XML original; no se infiere por nombre del técnico ni por cantidad de horas.

WITH clasificacion AS (
  SELECT
    j.id,
    CASE
      WHEN regexp_replace(
        upper(coalesce(j.raw_data ->> 'source_product_code', '')),
        '[^A-Z0-9]', '', 'g'
      ) = 'MA01'
        OR regexp_replace(
          upper(coalesce(j.raw_data ->> 'source_product_name', '')),
          '[^A-Z0-9]', '', 'g'
        ) = 'MA01'
        THEN 'MA01'
      WHEN regexp_replace(
        upper(coalesce(j.raw_data ->> 'source_product_code', '')),
        '[^A-Z0-9]', '', 'g'
      ) ~ '^(KM|KM0*1)$'
        OR regexp_replace(
          upper(coalesce(j.raw_data ->> 'source_product_name', '')),
          '[^A-Z0-9]', '', 'g'
        ) ~ '^(KM|KM0*1)$'
        THEN 'KM'
      WHEN regexp_replace(
        upper(coalesce(j.raw_data ->> 'source_product_code', '')),
        '[^A-Z0-9]', '', 'g'
      ) ~ '^(SE|SE0*1)$'
        OR regexp_replace(
          upper(coalesce(j.raw_data ->> 'source_product_name', '')),
          '[^A-Z0-9]', '', 'g'
        ) ~ '^(SE|SE0*1)$'
        OR regexp_replace(
          upper(coalesce(j.raw_data ->> 'source_product_name', '')),
          '[^A-Z0-9]', '', 'g'
        ) = 'SERVICIOTERCERIZADO'
        THEN 'SE'
      ELSE NULL
    END AS origen_participante
  FROM public.comisiones_jornadas j
  WHERE j.origen_sistema = 'new_xml_ordenes_servicio'
    AND nullif(j.raw_data ->> 'source_participant_origin', '') IS NULL
), normalizadas AS (
  UPDATE public.comisiones_jornadas j
  SET raw_data = j.raw_data || jsonb_build_object(
        'source_participant_origin', c.origen_participante,
        'inherited_from_ma01', c.origen_participante <> 'MA01',
        'metadata_normalizada_por_migracion', '20260825180000',
        'metadata_normalizada_en', now()
      ),
      actualizado_en = now()
  FROM clasificacion c
  WHERE c.id = j.id
    AND c.origen_participante IS NOT NULL
  RETURNING j.id
)
SELECT count(*) AS jornadas_con_origen_normalizado
FROM normalizadas;

-- La función instalada por la migración anterior ahora puede reconocer las
-- jornadas MA01 y sus participantes KM/SE, materializar las horas heredadas y
-- desactivar la fila antigua sin horario.
SELECT public.comisiones_reconstruir_participantes_heredados();

NOTIFY pgrst, 'reload schema';
