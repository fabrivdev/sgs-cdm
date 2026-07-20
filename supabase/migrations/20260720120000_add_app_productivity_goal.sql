CREATE TABLE IF NOT EXISTS public.app_configuracion (
  clave text PRIMARY KEY,
  valor_numero numeric NOT NULL,
  descripcion text,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_configuracion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users read app settings" ON public.app_configuracion;
CREATE POLICY "Authenticated users read app settings"
  ON public.app_configuracion FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins manage app settings" ON public.app_configuracion;
CREATE POLICY "Admins manage app settings"
  ON public.app_configuracion FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

INSERT INTO public.app_configuracion (clave, valor_numero, descripcion)
VALUES ('meta_horas_mensual_tecnico', 132, 'Meta mensual de horas registradas por tecnico')
ON CONFLICT (clave) DO NOTHING;
