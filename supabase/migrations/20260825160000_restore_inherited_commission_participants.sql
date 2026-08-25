-- Restaura participantes KM/SE que una reimportacion parcial dejo inactivos.
-- No modifica liquidaciones ni jornadas ya pagadas. A futuro el importador
-- vuelve a materializar estos participantes sobre los bloques MA01 recibidos.

WITH ranked AS (
  SELECT
    j.id,
    row_number() OVER (
      PARTITION BY
        j.os_numero,
        upper(btrim(j.tecnico_nombre)),
        j.fecha_inicio,
        j.hora_inicio,
        j.fecha_fin,
        j.hora_fin,
        j.tipo_tiempo
      ORDER BY j.actualizado_en DESC NULLS LAST, j.creado_en DESC, j.id DESC
    ) AS position
  FROM public.comisiones_jornadas j
  WHERE j.vigente = false
    AND j.origen_sistema = 'new_xml_ordenes_servicio'
    AND j.raw_data ->> 'source_participant_origin' IN ('KM', 'SE')
    AND NOT EXISTS (
      SELECT 1
      FROM public.comisiones_liquidacion_detalle d
      WHERE d.jornada_id = j.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.comisiones_jornadas active
      WHERE active.vigente = true
        AND active.os_numero = j.os_numero
        AND upper(btrim(active.tecnico_nombre)) = upper(btrim(j.tecnico_nombre))
        AND active.fecha_inicio IS NOT DISTINCT FROM j.fecha_inicio
        AND active.hora_inicio IS NOT DISTINCT FROM j.hora_inicio
        AND active.fecha_fin IS NOT DISTINCT FROM j.fecha_fin
        AND active.hora_fin IS NOT DISTINCT FROM j.hora_fin
        AND active.tipo_tiempo = j.tipo_tiempo
    )
), restored AS (
  UPDATE public.comisiones_jornadas j
  SET vigente = true,
      actualizado_en = now(),
      raw_data = j.raw_data || jsonb_build_object(
        'restaurado_por_migracion', '20260825160000',
        'restaurado_en', now()
      )
  FROM ranked r
  WHERE r.id = j.id
    AND r.position = 1
  RETURNING j.id
)
SELECT count(*) AS jornadas_heredadas_restauradas
FROM restored;

NOTIFY pgrst, 'reload schema';
