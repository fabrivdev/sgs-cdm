ALTER TABLE public.servicio_jornadas
  ADD COLUMN IF NOT EXISTS tecnico_responsable_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auxiliares uuid[] NOT NULL DEFAULT '{}';
