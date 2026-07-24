-- FCHCIERRE existe en el archivo de origen de OS del sistema nuevo (yyyymmdd) pero
-- nunca se importaba. OS importadas antes de este cambio quedan sin este dato hasta
-- que se reimporten.
ALTER TABLE public.ordenes_servicio_importadas
  ADD COLUMN IF NOT EXISTS fecha_cierre_os timestamptz;
