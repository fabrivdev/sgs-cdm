-- Expected result: unique_part_identity_guard = true and failures = [].
-- The repeated-number fixtures represent the same OS number in branches A/B.
WITH casos(nombre,coincidencias,factura_sucursal,os_sucursal,os_chasis,solicitado,esperado) AS (VALUES
  ('unica_sin_sucursal',1,NULL::text,NULL::text,'CH-1','CH1',true),
  ('repetida_sucursal_correcta',2,'Santa Rita','Santa Rita','CH-1','CH1',true),
  ('repetida_otra_sucursal',2,'Santa Rita','Katuete','CH-1','CH1',false),
  ('repetida_sin_sucursal',2,NULL,NULL,'CH-1','CH1',false),
  ('sucursal_correcta_chasis_incorrecto',2,'Santa Rita','Santa Rita','CH-2','CH1',false)
), resultados AS (
  SELECT nombre,esperado,
    public.ventas_historial_vinculo_os_publicable(
      coincidencias,factura_sucursal,os_sucursal,os_chasis,solicitado
    ) AS obtenido
  FROM casos
)
SELECT bool_and(obtenido=esperado) AS unique_part_identity_guard,
  coalesce(jsonb_agg(to_jsonb(resultados)) FILTER (WHERE obtenido<>esperado),'[]'::jsonb) AS failures
FROM resultados;
