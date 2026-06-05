ALTER TABLE public.facturacion
  ADD COLUMN IF NOT EXISTS cantidad numeric NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS facturacion_cantidad_idx
  ON public.facturacion(cantidad)
  WHERE cantidad <> 0;
