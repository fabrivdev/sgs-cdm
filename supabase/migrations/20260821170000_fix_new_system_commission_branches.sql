-- Corrige exclusivamente las jornadas de comisiones provenientes del XML
-- del sistema nuevo. El prefijo de os_numero conserva el codigo original de
-- sucursal, por lo que la reparacion es determinista incluso para cargas ya
-- realizadas: 02 = Katuete y 06 = Santa Rosa.

UPDATE public.comisiones_jornadas
SET sucursal = CASE
      WHEN split_part(os_numero, '-', 1) = '02' THEN 'Katuete'
      WHEN split_part(os_numero, '-', 1) = '06' THEN 'Santa Rosa'
      ELSE sucursal
    END,
    raw_data = raw_data || jsonb_build_object(
      'source_branch_code', split_part(os_numero, '-', 1)
    ),
    actualizado_en = now()
WHERE origen_sistema = 'new_xml_ordenes_servicio'
  AND split_part(os_numero, '-', 1) IN ('02', '06')
  AND (
    sucursal IS DISTINCT FROM CASE
      WHEN split_part(os_numero, '-', 1) = '02' THEN 'Katuete'
      WHEN split_part(os_numero, '-', 1) = '06' THEN 'Santa Rosa'
      ELSE sucursal
    END
    OR raw_data->>'source_branch_code' IS DISTINCT FROM split_part(os_numero, '-', 1)
  );

NOTIFY pgrst, 'reload schema';
