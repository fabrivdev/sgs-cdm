-- Run manually in Cloud. Preserve every existing value; do not insert a guessed goal.
BEGIN;

CREATE TABLE IF NOT EXISTS public.app_configuracion (
  clave text PRIMARY KEY,
  valor_numero numeric NOT NULL,
  descripcion text,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_configuracion ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.app_configuracion TO authenticated;

DROP POLICY IF EXISTS "Authenticated users read app settings" ON public.app_configuracion;
CREATE POLICY "Authenticated users read app settings"
  ON public.app_configuracion FOR SELECT TO authenticated
  USING (
    (clave = 'meta_horas_mensual_tecnico'
      AND public.has_section_access(auth.uid(), 'servicios.ordenes'))
    OR public.has_section_access(auth.uid(), 'admin.parametros')
  );

-- Add only goal writes for administrators, including when the table was absent.
DROP POLICY IF EXISTS "Administrators insert productivity goal" ON public.app_configuracion;
CREATE POLICY "Administrators insert productivity goal"
  ON public.app_configuracion FOR INSERT TO authenticated
  WITH CHECK (
    clave = 'meta_horas_mensual_tecnico'
    AND (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'superadmin'::public.app_role))
  );
DROP POLICY IF EXISTS "Administrators update productivity goal" ON public.app_configuracion;
CREATE POLICY "Administrators update productivity goal"
  ON public.app_configuracion FOR UPDATE TO authenticated
  USING (
    clave = 'meta_horas_mensual_tecnico'
    AND (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'superadmin'::public.app_role))
  ) WITH CHECK (
    clave = 'meta_horas_mensual_tecnico'
    AND (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'superadmin'::public.app_role))
  );

COMMIT;
