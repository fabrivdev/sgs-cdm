-- Panorama stores only the metrics actually shown to the signed-in user.
-- Source RPCs still enforce their own section permissions; this history cannot
-- grant access to a source or to another user's visit.
CREATE TABLE IF NOT EXISTS public.campi_panorama_visitas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_session_id uuid NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  metrics jsonb NOT NULL CHECK (jsonb_typeof(metrics) = 'array' AND jsonb_array_length(metrics) <= 32),
  UNIQUE (user_id, client_session_id)
);

CREATE INDEX IF NOT EXISTS campi_panorama_visitas_user_time_idx
  ON public.campi_panorama_visitas (user_id, captured_at DESC);

ALTER TABLE public.campi_panorama_visitas ENABLE ROW LEVEL SECURITY;

CREATE POLICY campi_panorama_visitas_select_own ON public.campi_panorama_visitas
  FOR SELECT TO authenticated USING (
    user_id = auth.uid() AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
      OR public.has_role(auth.uid(), 'gerencia'::public.app_role)
    ) AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(metrics) AS metric
      WHERE NOT (
        public.has_module_access(auth.uid(), split_part(metric->>'section', '.', 1))
        AND public.has_section_access(auth.uid(), metric->>'section')
      )
    )
  );

CREATE POLICY campi_panorama_visitas_insert_own ON public.campi_panorama_visitas
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid() AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
      OR public.has_role(auth.uid(), 'gerencia'::public.app_role)
    ) AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(metrics) AS metric
      WHERE NOT (
        public.has_module_access(auth.uid(), split_part(metric->>'section', '.', 1))
        AND public.has_section_access(auth.uid(), metric->>'section')
      )
    )
  );

REVOKE ALL ON public.campi_panorama_visitas FROM anon;
GRANT SELECT, INSERT ON public.campi_panorama_visitas TO authenticated;
