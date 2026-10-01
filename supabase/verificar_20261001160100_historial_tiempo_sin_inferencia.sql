-- Expected result: preserves_source_time = true and failures = [].
WITH casos(tipo,esperado) AS (VALUES
  ('Cliente'::text,'origen_explicito'::text),
  ('Garantia','origen_explicito'),
  ('Interno','origen_explicito'),
  (NULL,'no_informado_origen'),
  ('Desconocido','no_informado_origen'),
  ('Sin tipo','no_informado_origen'),
  ('Por confirmar','revision_pendiente'),
  ('Revision pendiente','revision_pendiente')
), resultados AS (
  SELECT tipo,esperado,
    public.ventas_historial_tipo_tiempo_procedencia(tipo) AS obtenido
  FROM casos
)
SELECT bool_and(obtenido=esperado) AS preserves_source_time,
  coalesce(jsonb_agg(to_jsonb(resultados)) FILTER (WHERE obtenido<>esperado),'[]'::jsonb) AS failures
FROM resultados;
