CREATE TABLE public.dias_no_laborales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha DATE NOT NULL UNIQUE,
  motivo TEXT,
  creado_por UUID,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dias_no_laborales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dias no laborales select authenticated"
ON public.dias_no_laborales FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Dias no laborales insert admin/cabecilla"
ON public.dias_no_laborales FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'cabecilla'::app_role)
);

CREATE POLICY "Dias no laborales delete admin/cabecilla"
ON public.dias_no_laborales FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'cabecilla'::app_role)
);