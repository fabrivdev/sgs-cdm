BEGIN;

-- La ausencia de evidencia no es Cliente ni una cuarta categoria comercial.
-- No modifica historicos ni tablas de comisiones.
ALTER TABLE public.facturacion_lineas_importadas
  ALTER COLUMN tipo_tiempo DROP DEFAULT,
  ALTER COLUMN tipo_tiempo DROP NOT NULL;

ALTER TABLE public.facturacion_lineas_importadas
  DROP CONSTRAINT IF EXISTS facturacion_lineas_tipo_tiempo_check;

ALTER TABLE public.facturacion_lineas_importadas
  ADD CONSTRAINT facturacion_lineas_tipo_tiempo_check
  CHECK (tipo_tiempo IS NULL OR tipo_tiempo IN ('Cliente', 'Garantia', 'Interno'));

COMMIT;
