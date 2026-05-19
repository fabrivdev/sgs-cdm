-- Enums
CREATE TYPE public.estado_trabajo AS ENUM (
  'nuevo','pendiente_diagnostico','pendiente_programar','programado',
  'en_ejecucion','bloqueado','terminado_pendiente_validar','cerrado'
);
CREATE TYPE public.prioridad_trabajo AS ENUM ('baja','media','alta','urgente');
CREATE TYPE public.estado_programacion AS ENUM ('programada','cumplida','reprogramada','cancelada');
CREATE TYPE public.estado_jornada AS ENUM ('en_curso','completada','incompleta');
CREATE TYPE public.tipo_evento_historial AS ENUM (
  'creacion','cambio_estado','cambio_responsable','programacion_creada',
  'programacion_actualizada','reprogramacion','jornada_creada',
  'jornada_actualizada','cierre','observacion'
);

-- Tablas (sin policies aún)
CREATE TABLE public.trabajos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID,
  maquina_id UUID,
  marca public.marca NOT NULL,
  sucursal public.sucursal NOT NULL,
  tipo_trabajo public.tipo_trabajo NOT NULL DEFAULT 'Visita de campo',
  descripcion_problema TEXT NOT NULL,
  prioridad public.prioridad_trabajo NOT NULL DEFAULT 'media',
  estado_general public.estado_trabajo NOT NULL DEFAULT 'nuevo',
  fecha_compromiso DATE,
  responsable_principal_id UUID,
  motivo_bloqueo TEXT,
  proxima_accion TEXT,
  creado_por UUID,
  cerrado_por UUID,
  cerrado_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  legacy_servicio_id UUID UNIQUE
);
CREATE INDEX idx_trabajos_estado ON public.trabajos(estado_general);
CREATE INDEX idx_trabajos_sucursal ON public.trabajos(sucursal);
CREATE INDEX idx_trabajos_cliente ON public.trabajos(cliente_id);
CREATE INDEX idx_trabajos_responsable ON public.trabajos(responsable_principal_id);

CREATE TABLE public.programaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajo_id UUID NOT NULL REFERENCES public.trabajos(id) ON DELETE CASCADE,
  fecha_programada DATE NOT NULL,
  tecnico_principal_id UUID,
  auxiliares UUID[] NOT NULL DEFAULT '{}',
  accion_programada TEXT,
  horas_estimadas NUMERIC,
  estado public.estado_programacion NOT NULL DEFAULT 'programada',
  motivo_reprogramacion TEXT,
  observacion TEXT,
  reemplaza_a UUID REFERENCES public.programaciones(id) ON DELETE SET NULL,
  creado_por UUID,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_prog_trabajo ON public.programaciones(trabajo_id);
CREATE INDEX idx_prog_fecha ON public.programaciones(fecha_programada);
CREATE INDEX idx_prog_tecnico ON public.programaciones(tecnico_principal_id);
CREATE INDEX idx_prog_estado ON public.programaciones(estado);

CREATE TABLE public.jornadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajo_id UUID NOT NULL REFERENCES public.trabajos(id) ON DELETE CASCADE,
  programacion_id UUID REFERENCES public.programaciones(id) ON DELETE SET NULL,
  tecnico_id UUID NOT NULL,
  fecha_real DATE NOT NULL,
  hora_inicio TIME,
  hora_fin TIME,
  horas_reales NUMERIC,
  actividad_realizada TEXT,
  resultado TEXT,
  estado_jornada public.estado_jornada NOT NULL DEFAULT 'completada',
  observaciones TEXT,
  evidencia_urls TEXT[] NOT NULL DEFAULT '{}',
  creado_por UUID,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jor_trabajo ON public.jornadas(trabajo_id);
CREATE INDEX idx_jor_prog ON public.jornadas(programacion_id);
CREATE INDEX idx_jor_tecnico ON public.jornadas(tecnico_id);
CREATE INDEX idx_jor_fecha ON public.jornadas(fecha_real);

CREATE TABLE public.trabajo_historial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajo_id UUID NOT NULL REFERENCES public.trabajos(id) ON DELETE CASCADE,
  tipo_evento public.tipo_evento_historial NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  usuario_id UUID,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_hist_trabajo ON public.trabajo_historial(trabajo_id, creado_en DESC);

-- RLS
ALTER TABLE public.trabajos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jornadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trabajo_historial ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trabajos select" ON public.trabajos FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR (public.has_role(auth.uid(),'cabecilla') AND sucursal = public.get_user_sucursal(auth.uid()))
  OR responsable_principal_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.programaciones p WHERE p.trabajo_id = trabajos.id
             AND (p.tecnico_principal_id = auth.uid() OR auth.uid() = ANY(p.auxiliares)))
);
CREATE POLICY "Trabajos insert" ON public.trabajos FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin')
  OR (public.has_role(auth.uid(),'cabecilla') AND sucursal = public.get_user_sucursal(auth.uid())));
CREATE POLICY "Trabajos update" ON public.trabajos FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin')
  OR (public.has_role(auth.uid(),'cabecilla') AND sucursal = public.get_user_sucursal(auth.uid()))
  OR responsable_principal_id = auth.uid());
CREATE POLICY "Trabajos delete" ON public.trabajos FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin')
  OR (public.has_role(auth.uid(),'cabecilla') AND sucursal = public.get_user_sucursal(auth.uid())));

CREATE POLICY "Programaciones select" ON public.programaciones FOR SELECT TO authenticated
USING (
  tecnico_principal_id = auth.uid() OR auth.uid() = ANY(auxiliares)
  OR EXISTS (SELECT 1 FROM public.trabajos t WHERE t.id = programaciones.trabajo_id
    AND (public.has_role(auth.uid(),'admin')
      OR (public.has_role(auth.uid(),'cabecilla') AND t.sucursal = public.get_user_sucursal(auth.uid()))
      OR t.responsable_principal_id = auth.uid()))
);
CREATE POLICY "Programaciones insert" ON public.programaciones FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.trabajos t WHERE t.id = programaciones.trabajo_id
    AND (public.has_role(auth.uid(),'admin')
      OR (public.has_role(auth.uid(),'cabecilla') AND t.sucursal = public.get_user_sucursal(auth.uid()))))
);
CREATE POLICY "Programaciones update" ON public.programaciones FOR UPDATE TO authenticated
USING (
  tecnico_principal_id = auth.uid() OR auth.uid() = ANY(auxiliares)
  OR EXISTS (SELECT 1 FROM public.trabajos t WHERE t.id = programaciones.trabajo_id
    AND (public.has_role(auth.uid(),'admin')
      OR (public.has_role(auth.uid(),'cabecilla') AND t.sucursal = public.get_user_sucursal(auth.uid()))))
);
CREATE POLICY "Programaciones delete" ON public.programaciones FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.trabajos t WHERE t.id = programaciones.trabajo_id
    AND (public.has_role(auth.uid(),'admin')
      OR (public.has_role(auth.uid(),'cabecilla') AND t.sucursal = public.get_user_sucursal(auth.uid()))))
);

CREATE POLICY "Jornadas select" ON public.jornadas FOR SELECT TO authenticated
USING (
  tecnico_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.trabajos t WHERE t.id = jornadas.trabajo_id
    AND (public.has_role(auth.uid(),'admin')
      OR (public.has_role(auth.uid(),'cabecilla') AND t.sucursal = public.get_user_sucursal(auth.uid()))
      OR t.responsable_principal_id = auth.uid()))
);
CREATE POLICY "Jornadas insert" ON public.jornadas FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.trabajos t WHERE t.id = jornadas.trabajo_id
    AND (public.has_role(auth.uid(),'admin')
      OR (public.has_role(auth.uid(),'cabecilla') AND t.sucursal = public.get_user_sucursal(auth.uid()))
      OR t.responsable_principal_id = auth.uid()
      OR tecnico_id = auth.uid()))
);
CREATE POLICY "Jornadas update" ON public.jornadas FOR UPDATE TO authenticated
USING (
  tecnico_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.trabajos t WHERE t.id = jornadas.trabajo_id
    AND (public.has_role(auth.uid(),'admin')
      OR (public.has_role(auth.uid(),'cabecilla') AND t.sucursal = public.get_user_sucursal(auth.uid()))))
);
CREATE POLICY "Jornadas delete" ON public.jornadas FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.trabajos t WHERE t.id = jornadas.trabajo_id
    AND (public.has_role(auth.uid(),'admin')
      OR (public.has_role(auth.uid(),'cabecilla') AND t.sucursal = public.get_user_sucursal(auth.uid()))))
);

CREATE POLICY "Historial select" ON public.trabajo_historial FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.trabajos t WHERE t.id = trabajo_historial.trabajo_id
    AND (public.has_role(auth.uid(),'admin')
      OR (public.has_role(auth.uid(),'cabecilla') AND t.sucursal = public.get_user_sucursal(auth.uid()))
      OR t.responsable_principal_id = auth.uid()))
);
CREATE POLICY "Historial insert" ON public.trabajo_historial FOR INSERT TO authenticated WITH CHECK (true);

-- Triggers updated_at
CREATE TRIGGER trg_trabajos_upd BEFORE UPDATE ON public.trabajos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_prog_upd BEFORE UPDATE ON public.programaciones
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_jor_upd BEFORE UPDATE ON public.jornadas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Validar cierre
CREATE OR REPLACE FUNCTION public.validar_cierre_trabajo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.estado_general = 'cerrado' AND COALESCE(OLD.estado_general,'nuevo'::public.estado_trabajo) <> 'cerrado' THEN
    IF OLD.estado_general <> 'terminado_pendiente_validar' THEN
      RAISE EXCEPTION 'Solo se puede cerrar un trabajo en estado terminado_pendiente_validar';
    END IF;
    IF NOT (public.has_role(auth.uid(),'admin')
            OR (public.has_role(auth.uid(),'cabecilla') AND NEW.sucursal = public.get_user_sucursal(auth.uid()))) THEN
      RAISE EXCEPTION 'No autorizado para cerrar este trabajo';
    END IF;
    NEW.cerrado_por := auth.uid();
    NEW.cerrado_en := now();
  END IF;
  RETURN NEW;
END;$$;
CREATE TRIGGER trg_validar_cierre BEFORE UPDATE ON public.trabajos
FOR EACH ROW EXECUTE FUNCTION public.validar_cierre_trabajo();

-- Historial triggers
CREATE OR REPLACE FUNCTION public.log_trabajo_historial()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.trabajo_historial(trabajo_id,tipo_evento,payload,usuario_id)
    VALUES (NEW.id,'creacion',
      jsonb_build_object('estado',NEW.estado_general,'responsable_principal_id',NEW.responsable_principal_id),
      COALESCE(auth.uid(),NEW.creado_por));
    RETURN NEW;
  END IF;
  IF NEW.estado_general IS DISTINCT FROM OLD.estado_general THEN
    INSERT INTO public.trabajo_historial(trabajo_id,tipo_evento,payload,usuario_id)
    VALUES (NEW.id,
      CASE WHEN NEW.estado_general='cerrado' THEN 'cierre'::public.tipo_evento_historial
           ELSE 'cambio_estado'::public.tipo_evento_historial END,
      jsonb_build_object('de',OLD.estado_general,'a',NEW.estado_general,
                         'motivo_bloqueo',NEW.motivo_bloqueo,'proxima_accion',NEW.proxima_accion),
      auth.uid());
  END IF;
  IF NEW.responsable_principal_id IS DISTINCT FROM OLD.responsable_principal_id THEN
    INSERT INTO public.trabajo_historial(trabajo_id,tipo_evento,payload,usuario_id)
    VALUES (NEW.id,'cambio_responsable',
      jsonb_build_object('de',OLD.responsable_principal_id,'a',NEW.responsable_principal_id),
      auth.uid());
  END IF;
  RETURN NEW;
END;$$;
CREATE TRIGGER trg_log_trabajo AFTER INSERT OR UPDATE ON public.trabajos
FOR EACH ROW EXECUTE FUNCTION public.log_trabajo_historial();

CREATE OR REPLACE FUNCTION public.log_programacion_historial()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO public.trabajo_historial(trabajo_id,tipo_evento,payload,usuario_id)
    VALUES (NEW.trabajo_id,
      CASE WHEN NEW.reemplaza_a IS NOT NULL THEN 'reprogramacion'::public.tipo_evento_historial
           ELSE 'programacion_creada'::public.tipo_evento_historial END,
      jsonb_build_object('programacion_id',NEW.id,'fecha',NEW.fecha_programada,
        'tecnico_principal_id',NEW.tecnico_principal_id,'auxiliares',NEW.auxiliares,
        'reemplaza_a',NEW.reemplaza_a,'accion',NEW.accion_programada),
      COALESCE(auth.uid(),NEW.creado_por));
  ELSIF TG_OP='UPDATE' THEN
    IF NEW.estado IS DISTINCT FROM OLD.estado
       OR NEW.fecha_programada IS DISTINCT FROM OLD.fecha_programada
       OR NEW.tecnico_principal_id IS DISTINCT FROM OLD.tecnico_principal_id THEN
      INSERT INTO public.trabajo_historial(trabajo_id,tipo_evento,payload,usuario_id)
      VALUES (NEW.trabajo_id,'programacion_actualizada',
        jsonb_build_object('programacion_id',NEW.id,
          'estado',jsonb_build_object('de',OLD.estado,'a',NEW.estado),
          'fecha',jsonb_build_object('de',OLD.fecha_programada,'a',NEW.fecha_programada),
          'tecnico',jsonb_build_object('de',OLD.tecnico_principal_id,'a',NEW.tecnico_principal_id),
          'motivo_reprogramacion',NEW.motivo_reprogramacion),
        auth.uid());
    END IF;
  END IF;
  RETURN NEW;
END;$$;
CREATE TRIGGER trg_log_prog AFTER INSERT OR UPDATE ON public.programaciones
FOR EACH ROW EXECUTE FUNCTION public.log_programacion_historial();

CREATE OR REPLACE FUNCTION public.log_jornada_historial()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO public.trabajo_historial(trabajo_id,tipo_evento,payload,usuario_id)
    VALUES (NEW.trabajo_id,'jornada_creada',
      jsonb_build_object('jornada_id',NEW.id,'tecnico_id',NEW.tecnico_id,
        'fecha_real',NEW.fecha_real,'horas_reales',NEW.horas_reales,'estado',NEW.estado_jornada),
      COALESCE(auth.uid(),NEW.creado_por));
  ELSIF TG_OP='UPDATE' THEN
    IF NEW.estado_jornada IS DISTINCT FROM OLD.estado_jornada
       OR NEW.horas_reales IS DISTINCT FROM OLD.horas_reales THEN
      INSERT INTO public.trabajo_historial(trabajo_id,tipo_evento,payload,usuario_id)
      VALUES (NEW.trabajo_id,'jornada_actualizada',
        jsonb_build_object('jornada_id',NEW.id,
          'estado',jsonb_build_object('de',OLD.estado_jornada,'a',NEW.estado_jornada),
          'horas_reales',jsonb_build_object('de',OLD.horas_reales,'a',NEW.horas_reales)),
        auth.uid());
    END IF;
  END IF;
  RETURN NEW;
END;$$;
CREATE TRIGGER trg_log_jornada AFTER INSERT OR UPDATE ON public.jornadas
FOR EACH ROW EXECUTE FUNCTION public.log_jornada_historial();

-- Vista de horas reales por trabajo
CREATE OR REPLACE VIEW public.trabajos_horas AS
SELECT t.id AS trabajo_id,
       COALESCE(SUM(j.horas_reales),0) AS horas_reales_total,
       COUNT(j.id) AS jornadas_count
FROM public.trabajos t LEFT JOIN public.jornadas j ON j.trabajo_id = t.id
GROUP BY t.id;

-- Migración: servicios → trabajos
INSERT INTO public.trabajos (
  cliente_id, marca, sucursal, tipo_trabajo, descripcion_problema,
  prioridad, estado_general, responsable_principal_id,
  creado_por, creado_en, actualizado_en, legacy_servicio_id)
SELECT s.cliente_id, s.marca, s.sucursal, s.tipo_trabajo, s.trabajo_descripcion,
  'media'::public.prioridad_trabajo,
  CASE s.estado
    WHEN 'Pendiente'  THEN 'programado'::public.estado_trabajo
    WHEN 'Iniciado'   THEN 'en_ejecucion'::public.estado_trabajo
    WHEN 'Completado' THEN 'cerrado'::public.estado_trabajo
  END,
  s.tecnico_responsable_id, s.creado_por, s.creado_en, s.actualizado_en, s.id
FROM public.servicios s;

UPDATE public.trabajos t
SET cerrado_en = s.actualizado_en, cerrado_por = s.creado_por
FROM public.servicios s
WHERE t.legacy_servicio_id = s.id AND t.estado_general = 'cerrado';

-- Migración: servicios → programaciones
INSERT INTO public.programaciones (
  trabajo_id, fecha_programada, tecnico_principal_id, auxiliares,
  accion_programada, estado, observacion, creado_por, creado_en, actualizado_en)
SELECT t.id, s.fecha_programada, s.tecnico_responsable_id,
  COALESCE(s.auxiliares,'{}'::uuid[]), s.trabajo_descripcion,
  CASE s.estado WHEN 'Completado' THEN 'cumplida'::public.estado_programacion
                ELSE 'programada'::public.estado_programacion END,
  s.observaciones, s.creado_por, s.creado_en, s.actualizado_en
FROM public.servicios s JOIN public.trabajos t ON t.legacy_servicio_id = s.id;

-- Migración: servicio_jornadas → jornadas
INSERT INTO public.jornadas (
  trabajo_id, tecnico_id, fecha_real, horas_reales,
  actividad_realizada, estado_jornada, observaciones,
  creado_por, creado_en, actualizado_en)
SELECT t.id, s.tecnico_responsable_id, sj.fecha, sj.horas_trabajadas,
  s.trabajo_descripcion,
  CASE sj.estado WHEN 'Completado' THEN 'completada'::public.estado_jornada
                 WHEN 'Iniciado'   THEN 'en_curso'::public.estado_jornada
                 ELSE 'incompleta'::public.estado_jornada END,
  sj.observaciones, s.creado_por, sj.creado_en, sj.actualizado_en
FROM public.servicio_jornadas sj
JOIN public.servicios s ON s.id = sj.servicio_id
JOIN public.trabajos  t ON t.legacy_servicio_id = s.id
WHERE s.tecnico_responsable_id IS NOT NULL;