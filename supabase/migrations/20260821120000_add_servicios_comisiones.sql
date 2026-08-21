-- Comisiones de técnicos: ledger de jornadas calculadas desde las marcas de
-- tiempo del XML de OS. No duplica clientes, productos, facturación ni la OS
-- consolidada; conserva solamente el detalle necesario para liquidar horas.

CREATE TABLE IF NOT EXISTS public.comisiones_jornadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fuente_clave text NOT NULL UNIQUE,
  importacion_id uuid REFERENCES public.importaciones(id) ON DELETE SET NULL,
  origen_sistema text NOT NULL DEFAULT 'new_xml_ordenes_servicio',
  sucursal text,
  os_numero text NOT NULL,
  estado_os text,
  fecha_cierre date,
  fecha_inicio date,
  hora_inicio time,
  fecha_fin date,
  hora_fin time,
  tecnico_codigo text,
  tecnico_nombre text NOT NULL,
  tecnico_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  rol_tecnico text NOT NULL DEFAULT 'PRINCIPAL'
    CHECK (rol_tecnico IN ('PRINCIPAL', 'AUXILIAR')),
  tipo_tiempo text NOT NULL DEFAULT 'Desconocido'
    CHECK (tipo_tiempo IN ('Cliente', 'Garantia', 'Interno', 'Desconocido')),
  horas_reportadas numeric(10,4),
  horas_calculadas numeric(10,4),
  horas_validas numeric(10,4),
  estado_validacion text NOT NULL DEFAULT 'REVISAR'
    CHECK (estado_validacion IN ('VALIDA', 'REVISAR', 'INVALIDA')),
  motivos_validacion text[] NOT NULL DEFAULT '{}',
  validado_por uuid,
  validado_en timestamptz,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  vigente boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comisiones_jornadas_cierre_idx
  ON public.comisiones_jornadas(fecha_cierre, estado_os);
CREATE INDEX IF NOT EXISTS comisiones_jornadas_tecnico_idx
  ON public.comisiones_jornadas(tecnico_profile_id, tecnico_nombre);
CREATE INDEX IF NOT EXISTS comisiones_jornadas_validacion_idx
  ON public.comisiones_jornadas(estado_validacion);
CREATE INDEX IF NOT EXISTS comisiones_jornadas_os_idx
  ON public.comisiones_jornadas(os_numero);
CREATE INDEX IF NOT EXISTS comisiones_jornadas_vigente_idx
  ON public.comisiones_jornadas(vigente, fecha_cierre);

CREATE TABLE IF NOT EXISTS public.comisiones_liquidaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_desde date NOT NULL,
  periodo_hasta date NOT NULL,
  estado text NOT NULL DEFAULT 'PAGADA'
    CHECK (estado IN ('BORRADOR', 'PAGADA', 'ANULADA')),
  total_horas numeric(12,4) NOT NULL DEFAULT 0,
  observacion text,
  creado_por uuid NOT NULL DEFAULT auth.uid(),
  creado_en timestamptz NOT NULL DEFAULT now(),
  pagado_en timestamptz,
  CHECK (periodo_hasta >= periodo_desde)
);

CREATE INDEX IF NOT EXISTS comisiones_liquidaciones_periodo_idx
  ON public.comisiones_liquidaciones(periodo_desde, periodo_hasta);

CREATE TABLE IF NOT EXISTS public.comisiones_liquidacion_detalle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liquidacion_id uuid NOT NULL REFERENCES public.comisiones_liquidaciones(id) ON DELETE CASCADE,
  jornada_id uuid NOT NULL REFERENCES public.comisiones_jornadas(id) ON DELETE RESTRICT,
  horas_pagadas numeric(10,4) NOT NULL CHECK (horas_pagadas > 0),
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (jornada_id)
);

CREATE INDEX IF NOT EXISTS comisiones_detalle_liquidacion_idx
  ON public.comisiones_liquidacion_detalle(liquidacion_id);

ALTER TABLE public.comisiones_jornadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comisiones_liquidaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comisiones_liquidacion_detalle ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.comisiones_jornadas FROM anon;
REVOKE ALL ON TABLE public.comisiones_liquidaciones FROM anon;
REVOKE ALL ON TABLE public.comisiones_liquidacion_detalle FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.comisiones_jornadas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.comisiones_liquidaciones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.comisiones_liquidacion_detalle TO authenticated;

DROP POLICY IF EXISTS "Admins gestionan jornadas de comisiones" ON public.comisiones_jornadas;
CREATE POLICY "Admins gestionan jornadas de comisiones"
  ON public.comisiones_jornadas FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
  );

DROP POLICY IF EXISTS "Admins gestionan liquidaciones" ON public.comisiones_liquidaciones;
CREATE POLICY "Admins gestionan liquidaciones"
  ON public.comisiones_liquidaciones FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
  );

DROP POLICY IF EXISTS "Admins gestionan detalle de liquidaciones" ON public.comisiones_liquidacion_detalle;
CREATE POLICY "Admins gestionan detalle de liquidaciones"
  ON public.comisiones_liquidacion_detalle FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
  );

CREATE OR REPLACE FUNCTION public.comisiones_validar_jornadas(
  p_jornada_ids uuid[],
  p_observacion text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (
       public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
     ) THEN
    RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501';
  END IF;

  UPDATE public.comisiones_jornadas
  SET estado_validacion = 'VALIDA',
      horas_validas = horas_calculadas,
      validado_por = auth.uid(),
      validado_en = now(),
      actualizado_en = now(),
      raw_data = CASE
        WHEN nullif(btrim(coalesce(p_observacion, '')), '') IS NULL THEN raw_data
        ELSE raw_data || jsonb_build_object('observacion_validacion', btrim(p_observacion))
      END
  WHERE id = ANY(coalesce(p_jornada_ids, '{}'::uuid[]))
    AND horas_calculadas > 0
    AND estado_validacion <> 'INVALIDA';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.comisiones_marcar_pagadas(
  p_jornada_ids uuid[],
  p_periodo_desde date,
  p_periodo_hasta date,
  p_observacion text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_liquidacion_id uuid;
  v_total numeric(12,4);
  v_solicitadas integer;
  v_insertadas integer;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (
       public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
     ) THEN
    RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501';
  END IF;

  IF p_periodo_desde IS NULL OR p_periodo_hasta IS NULL OR p_periodo_hasta < p_periodo_desde THEN
    RAISE EXCEPTION 'Periodo invalido' USING ERRCODE = '22007';
  END IF;

  SELECT count(DISTINCT u.id) INTO v_solicitadas
  FROM unnest(coalesce(p_jornada_ids, '{}'::uuid[])) AS u(id);
  IF v_solicitadas = 0 THEN
    RAISE EXCEPTION 'Selecciona al menos una jornada valida' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(sum(j.horas_validas), 0), count(*)
  INTO v_total, v_insertadas
  FROM public.comisiones_jornadas j
  LEFT JOIN public.comisiones_liquidacion_detalle d ON d.jornada_id = j.id
  WHERE j.id = ANY(p_jornada_ids)
    AND d.id IS NULL
    AND j.estado_validacion = 'VALIDA'
    AND lower(coalesce(j.estado_os, '')) = 'cerrada'
    AND j.fecha_cierre BETWEEN p_periodo_desde AND p_periodo_hasta
    AND j.horas_validas > 0;

  IF v_insertadas <> v_solicitadas THEN
    RAISE EXCEPTION 'La seleccion contiene jornadas fuera del periodo, no validadas o ya pagadas'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.comisiones_liquidaciones (
    periodo_desde, periodo_hasta, estado, total_horas, observacion, creado_por, pagado_en
  ) VALUES (
    p_periodo_desde, p_periodo_hasta, 'PAGADA', v_total, nullif(btrim(coalesce(p_observacion, '')), ''), auth.uid(), now()
  ) RETURNING id INTO v_liquidacion_id;

  INSERT INTO public.comisiones_liquidacion_detalle (liquidacion_id, jornada_id, horas_pagadas)
  SELECT v_liquidacion_id, j.id, j.horas_validas
  FROM public.comisiones_jornadas j
  WHERE j.id = ANY(p_jornada_ids);

  RETURN v_liquidacion_id;
END;
$$;

-- Antes de reemplazar el detalle de una OS se desactivan solamente las
-- jornadas que todavia no fueron liquidadas. Las pagadas son inmutables y
-- siguen constituyendo la evidencia del pago ya realizado.
CREATE OR REPLACE FUNCTION public.comisiones_preparar_reimportacion(
  p_os_numeros text[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (
       public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
     ) THEN
    RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501';
  END IF;

  UPDATE public.comisiones_jornadas j
  SET vigente = false,
      actualizado_en = now()
  WHERE j.os_numero = ANY(coalesce(p_os_numeros, '{}'::text[]))
    AND NOT EXISTS (
      SELECT 1
      FROM public.comisiones_liquidacion_detalle d
      WHERE d.jornada_id = j.id
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.comisiones_validar_jornadas(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comisiones_validar_jornadas(uuid[], text) TO authenticated;
REVOKE ALL ON FUNCTION public.comisiones_marcar_pagadas(uuid[], date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comisiones_marcar_pagadas(uuid[], date, date, text) TO authenticated;
REVOKE ALL ON FUNCTION public.comisiones_preparar_reimportacion(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comisiones_preparar_reimportacion(text[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
