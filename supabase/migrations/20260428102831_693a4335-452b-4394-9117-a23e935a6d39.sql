
CREATE TABLE public.servicio_jornadas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  servicio_id UUID NOT NULL,
  fecha DATE NOT NULL,
  horas_trabajadas NUMERIC NULL,
  estado public.estado_servicio NOT NULL DEFAULT 'Pendiente',
  observaciones TEXT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (servicio_id, fecha)
);

-- FK con cascade (referencia explícita a servicios)
ALTER TABLE public.servicio_jornadas
  ADD CONSTRAINT servicio_jornadas_servicio_id_fkey
  FOREIGN KEY (servicio_id) REFERENCES public.servicios(id) ON DELETE CASCADE;

CREATE INDEX idx_servicio_jornadas_servicio ON public.servicio_jornadas(servicio_id);
CREATE INDEX idx_servicio_jornadas_fecha ON public.servicio_jornadas(fecha);

-- Trigger updated_at
CREATE TRIGGER trg_servicio_jornadas_updated_at
BEFORE UPDATE ON public.servicio_jornadas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill: una jornada por cada servicio existente
INSERT INTO public.servicio_jornadas (servicio_id, fecha, horas_trabajadas, estado, observaciones)
SELECT id, fecha_programada, horas_trabajadas, estado, observaciones
FROM public.servicios
ON CONFLICT (servicio_id, fecha) DO NOTHING;

-- RLS
ALTER TABLE public.servicio_jornadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Jornadas select by servicio access"
ON public.servicio_jornadas
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.servicios s
    WHERE s.id = servicio_jornadas.servicio_id
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR (public.has_role(auth.uid(), 'cabecilla'::public.app_role) AND s.sucursal = public.get_user_sucursal(auth.uid()))
        OR s.tecnico_responsable_id = auth.uid()
        OR auth.uid() = ANY (s.auxiliares)
      )
  )
);

CREATE POLICY "Jornadas update by servicio access"
ON public.servicio_jornadas
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.servicios s
    WHERE s.id = servicio_jornadas.servicio_id
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR (public.has_role(auth.uid(), 'cabecilla'::public.app_role) AND s.sucursal = public.get_user_sucursal(auth.uid()))
        OR s.tecnico_responsable_id = auth.uid()
        OR auth.uid() = ANY (s.auxiliares)
      )
  )
);

CREATE POLICY "Jornadas insert admin/cabecilla"
ON public.servicio_jornadas
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.servicios s
    WHERE s.id = servicio_jornadas.servicio_id
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR (public.has_role(auth.uid(), 'cabecilla'::public.app_role) AND s.sucursal = public.get_user_sucursal(auth.uid()))
      )
  )
);

CREATE POLICY "Jornadas delete admin/cabecilla"
ON public.servicio_jornadas
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.servicios s
    WHERE s.id = servicio_jornadas.servicio_id
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR (public.has_role(auth.uid(), 'cabecilla'::public.app_role) AND s.sucursal = public.get_user_sucursal(auth.uid()))
      )
  )
);
