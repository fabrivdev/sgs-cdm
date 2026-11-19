BEGIN;
-- Permite confirmar el tipo aunque la marca de la máquina no esté acreditada.
ALTER TABLE public.ventas_servicios_clasificaciones_confirmadas
  ALTER COLUMN marca DROP NOT NULL;
COMMIT;
