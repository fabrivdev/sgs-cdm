CREATE TABLE IF NOT EXISTS public.tecnico_disponibilidad (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tecnico_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  fecha_inicio date NOT NULL,
  fecha_fin date NOT NULL,
  tipo text NOT NULL DEFAULT 'Capacitacion',
  observacion text,
  bloquea_agenda boolean NOT NULL DEFAULT true,
  creado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tecnico_disponibilidad_tipo_check
    CHECK (tipo IN ('Capacitacion', 'Vacaciones', 'Permiso', 'Taller interno', 'Otro')),
  CONSTRAINT tecnico_disponibilidad_fechas_check
    CHECK (fecha_fin >= fecha_inicio)
);

CREATE INDEX IF NOT EXISTS tecnico_disponibilidad_tecnico_fecha_idx
  ON public.tecnico_disponibilidad (tecnico_id, fecha_inicio, fecha_fin);

ALTER TABLE public.tecnico_disponibilidad ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tecnico disponibilidad select" ON public.tecnico_disponibilidad;
CREATE POLICY "Tecnico disponibilidad select"
  ON public.tecnico_disponibilidad
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'cabecilla'::public.app_role)
    OR tecnico_id = auth.uid()
  );

DROP POLICY IF EXISTS "Tecnico disponibilidad manage" ON public.tecnico_disponibilidad;
CREATE POLICY "Tecnico disponibilidad manage"
  ON public.tecnico_disponibilidad
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'cabecilla'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'cabecilla'::public.app_role)
  );
