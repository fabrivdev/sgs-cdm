ALTER TABLE public.seguimiento_comercial
  ADD COLUMN IF NOT EXISTS trabajo_id uuid REFERENCES public.trabajos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS seguimiento_comercial_trabajo_id_idx
  ON public.seguimiento_comercial(trabajo_id)
  WHERE trabajo_id IS NOT NULL;
