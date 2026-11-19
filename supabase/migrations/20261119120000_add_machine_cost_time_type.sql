BEGIN;
ALTER TABLE public.facturacion_lineas_importadas DROP CONSTRAINT IF EXISTS facturacion_lineas_tipo_tiempo_check;
ALTER TABLE public.facturacion_lineas_importadas ADD CONSTRAINT facturacion_lineas_tipo_tiempo_check
  CHECK(tipo_tiempo IS NULL OR tipo_tiempo IN ('Cliente','Garantia','Interno','Agrega al costo'));
ALTER TABLE public.facturacion DROP CONSTRAINT IF EXISTS facturacion_tipo_tiempo_check;
ALTER TABLE public.facturacion ADD CONSTRAINT facturacion_tipo_tiempo_check
  CHECK(tipo_tiempo IS NULL OR tipo_tiempo IN ('Cliente','Garantia','Interno','Agrega al costo'));

CREATE OR REPLACE FUNCTION public.ventas_tipo_tiempo_normalizado(p_valor text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT CASE
  WHEN upper(btrim(coalesce(p_valor,''))) ~ '^(AGR|AGS)([[:space:]-]|$)'
    OR upper(btrim(p_valor))='AGREGA AL COSTO' THEN 'Agrega al costo'
  WHEN upper(btrim(p_valor)) LIKE '%GARANT%' THEN 'Garantia'
  WHEN upper(btrim(p_valor)) LIKE '%INTERN%' OR upper(btrim(p_valor)) LIKE '%CDM%'
    OR upper(btrim(p_valor)) LIKE '%ABSOR%' THEN 'Interno'
  WHEN upper(btrim(p_valor)) LIKE '%CLIENT%' OR upper(btrim(p_valor)) LIKE '%FACTUR%' THEN 'Cliente'
  ELSE 'No informado' END
$$;

-- Solo OS con un tipo único acreditado. Las mixtas deben reimportarse desde su detalle.
UPDATE public.ordenes_servicio_importadas
SET tipo_tiempo='Agrega al costo',
  raw_data=jsonb_set(jsonb_set(jsonb_set(
    raw_data,
    '{tipos_tiempo}','["Agrega al costo"]'::jsonb),
    '{totales_por_tipo}', CASE WHEN raw_data->'totales_por_tipo' ? 'Garantia'
      THEN ((raw_data->'totales_por_tipo')-'Garantia')
        || jsonb_build_object('Agrega al costo',raw_data->'totales_por_tipo'->'Garantia')
      ELSE coalesce(raw_data->'totales_por_tipo','{}'::jsonb) END),
    '{facturas_por_tipo}', CASE WHEN raw_data->'facturas_por_tipo' ? 'Garantia'
      THEN ((raw_data->'facturas_por_tipo')-'Garantia')
        || jsonb_build_object('Agrega al costo',raw_data->'facturas_por_tipo'->'Garantia')
      ELSE coalesce(raw_data->'facturas_por_tipo','{}'::jsonb) END)
WHERE upper(btrim(raw_data->>'TIPTEM')) ~ '^(AGR|AGS)([[:space:]-]|$)'
  AND jsonb_array_length(CASE WHEN jsonb_typeof(raw_data->'tipos_tiempo')='array'
    THEN raw_data->'tipos_tiempo' ELSE '[]'::jsonb END)=1
  AND tipo_tiempo='Garantia';

UPDATE public.facturacion_lineas_importadas f
SET tipo_tiempo='Agrega al costo',
  raw_data=jsonb_set(f.raw_data,'{canonical_time_type}','"Agrega al costo"'::jsonb)
WHERE f.fecha_factura >= date '2026-07-01'
  AND (upper(btrim(f.raw_data->>'TIPTEM')) ~ '^(AGR|AGS)([[:space:]-]|$)'
    OR EXISTS (
      SELECT 1 FROM public.ordenes_servicio_importadas o
      WHERE o.os_numero=f.raw_data->>'linked_service_order'
        AND o.tipo_tiempo='Agrega al costo'
        AND o.raw_data->'tipos_tiempo'='["Agrega al costo"]'::jsonb
    ));
NOTIFY pgrst,'reload schema';
COMMIT;
