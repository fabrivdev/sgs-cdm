-- Conserva las correcciones manuales de tipo de tiempo fuera de las filas
-- reemplazables de comisiones_jornadas. La identidad no incluye el tipo
-- importado ni fuente_clave: ambos pueden cambiar durante una reimportacion o
-- al reconstruir participantes KM/SE.

CREATE OR REPLACE FUNCTION public.comisiones_clave_ajuste_tipo_tiempo(
  p_os_numero text,
  p_tecnico_profile_id uuid,
  p_tecnico_codigo text,
  p_tecnico_nombre text,
  p_fecha_inicio date,
  p_hora_inicio time,
  p_fecha_fin date,
  p_hora_fin time
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT concat_ws('|',
    'COMISION_TIPO_TIEMPO',
    upper(regexp_replace(btrim(coalesce(p_os_numero, '')), '\s+', ' ', 'g')),
    upper(regexp_replace(
      btrim(coalesce(
        nullif(p_tecnico_nombre, ''),
        nullif(p_tecnico_codigo, ''),
        p_tecnico_profile_id::text,
        ''
      )),
      '\s+', ' ', 'g'
    )),
    coalesce(p_fecha_inicio::text, ''),
    coalesce(p_hora_inicio::text, ''),
    coalesce(p_fecha_fin::text, ''),
    coalesce(p_hora_fin::text, '')
  );
$$;

CREATE TABLE IF NOT EXISTS public.comisiones_tipo_tiempo_ajustes (
  ajuste_clave text PRIMARY KEY,
  os_numero text NOT NULL,
  tecnico_profile_id uuid,
  tecnico_codigo text,
  tecnico_nombre text NOT NULL,
  fecha_inicio date,
  hora_inicio time,
  fecha_fin date,
  hora_fin time,
  tipo_tiempo text NOT NULL
    CHECK (tipo_tiempo IN ('Cliente', 'Garantia', 'Interno', 'Desconocido')),
  valor_importado_al_ajustar text NOT NULL
    CHECK (valor_importado_al_ajustar IN ('Cliente', 'Garantia', 'Interno', 'Desconocido')),
  ajustado_por uuid,
  ajustado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.comisiones_tipo_tiempo_ajustes IS
  'Correcciones manuales persistentes por OS, tecnico y bloque horario. Sobreviven a reimportaciones y reconstrucciones de jornadas.';

ALTER TABLE public.comisiones_tipo_tiempo_ajustes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.comisiones_tipo_tiempo_ajustes FROM PUBLIC, anon, authenticated;

-- Respaldo del corte que el usuario ya habia validado y exportado antes de la
-- reimportacion. El archivo
-- comisiones-resumen-cerradas-2026-07-21-a-2026-08-20.xlsx contiene 80 OS y
-- todas tienen un unico tipo de tiempo (sin casos mixtos). Este respaldo se
-- aplica solo cuando no existe una correccion manual mas especifica por
-- tecnico y bloque horario.
-- SHA256 del archivo validado:
-- BC71695D289E538E17B7BB1044D3643A566291F5CBF7E3DDC10AABCD0E130CA4
CREATE TABLE IF NOT EXISTS public.comisiones_tipo_tiempo_validaciones_os (
  os_numero text PRIMARY KEY,
  tipo_tiempo text NOT NULL
    CHECK (tipo_tiempo IN ('Cliente', 'Garantia', 'Interno', 'Desconocido')),
  fuente text NOT NULL,
  periodo_desde date,
  periodo_hasta date,
  validado_en timestamptz NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.comisiones_tipo_tiempo_validaciones_os IS
  'Tipos de tiempo ya validados en cortes exportados. Sirven como respaldo de una OS completa y tienen menor prioridad que un ajuste manual por jornada.';

ALTER TABLE public.comisiones_tipo_tiempo_validaciones_os ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.comisiones_tipo_tiempo_validaciones_os
  FROM PUBLIC, anon, authenticated;

INSERT INTO public.comisiones_tipo_tiempo_validaciones_os (
  os_numero,
  tipo_tiempo,
  fuente,
  periodo_desde,
  periodo_hasta,
  validado_en,
  actualizado_en
)
SELECT
  os_numero,
  tipo_tiempo,
  'comisiones-resumen-cerradas-2026-07-21-a-2026-08-20.xlsx',
  DATE '2026-07-21',
  DATE '2026-08-20',
  TIMESTAMPTZ '2026-08-24 17:12:12-03',
  now()
FROM (VALUES
  ('01-00000094', 'Cliente'),
  ('01-00000096', 'Garantia'),
  ('01-00000108', 'Garantia'),
  ('01-00000129', 'Interno'),
  ('01-00000130', 'Interno'),
  ('01-00000131', 'Cliente'),
  ('01-00000132', 'Interno'),
  ('01-00000133', 'Interno'),
  ('01-00000071', 'Garantia'),
  ('01-00000076', 'Garantia'),
  ('01-00000088', 'Garantia'),
  ('01-00000099', 'Interno'),
  ('01-00000102', 'Garantia'),
  ('01-00000122', 'Garantia'),
  ('01-00000123', 'Interno'),
  ('01-00000124', 'Cliente'),
  ('01-00000126', 'Cliente'),
  ('02-00000028', 'Cliente'),
  ('02-00000031', 'Cliente'),
  ('01-00000073', 'Cliente'),
  ('01-00000075', 'Garantia'),
  ('01-00000081', 'Garantia'),
  ('01-00000082', 'Garantia'),
  ('01-00000093', 'Cliente'),
  ('01-00000112', 'Cliente'),
  ('01-00000114', 'Garantia'),
  ('01-00000120', 'Cliente'),
  ('01-00000049', 'Cliente'),
  ('01-00000077', 'Garantia'),
  ('01-00000097', 'Garantia'),
  ('01-00000100', 'Interno'),
  ('01-00000119', 'Cliente'),
  ('01-00000045', 'Cliente'),
  ('01-00000111', 'Cliente'),
  ('01-00000083', 'Interno'),
  ('01-00000107', 'Interno'),
  ('01-00000018', 'Interno'),
  ('01-00000105', 'Interno'),
  ('01-00000068', 'Garantia'),
  ('01-00000052', 'Garantia'),
  ('02-00000029', 'Garantia'),
  ('02-00000030', 'Garantia'),
  ('01-00000009', 'Cliente'),
  ('01-00000053', 'Cliente'),
  ('02-00000027', 'Interno'),
  ('01-00000051', 'Garantia'),
  ('01-00000072', 'Cliente'),
  ('02-00000006', 'Garantia'),
  ('02-00000007', 'Garantia'),
  ('02-00000008', 'Interno'),
  ('02-00000010', 'Garantia'),
  ('02-00000025', 'Interno'),
  ('02-00000026', 'Interno'),
  ('01-00000029', 'Garantia'),
  ('01-00000059', 'Interno'),
  ('01-00000066', 'Garantia'),
  ('01-00000067', 'Garantia'),
  ('01-00000070', 'Garantia'),
  ('02-00000009', 'Interno'),
  ('02-00000012', 'Interno'),
  ('01-00000063', 'Garantia'),
  ('01-00000064', 'Garantia'),
  ('01-00000065', 'Garantia'),
  ('01-00000056', 'Cliente'),
  ('01-00000060', 'Interno'),
  ('02-00000023', 'Cliente'),
  ('01-00000012', 'Cliente'),
  ('01-00000046', 'Interno'),
  ('02-00000005', 'Cliente'),
  ('02-00000022', 'Cliente'),
  ('05-00000003', 'Cliente'),
  ('01-00000010', 'Garantia'),
  ('01-00000025', 'Garantia'),
  ('01-00000048', 'Cliente'),
  ('01-00000050', 'Garantia'),
  ('05-00000001', 'Cliente'),
  ('05-00000004', 'Cliente'),
  ('05-00000005', 'Cliente'),
  ('05-00000006', 'Cliente'),
  ('05-00000007', 'Cliente')
) AS validacion(os_numero, tipo_tiempo)
ON CONFLICT (os_numero) DO UPDATE
SET tipo_tiempo = excluded.tipo_tiempo,
    fuente = excluded.fuente,
    periodo_desde = excluded.periodo_desde,
    periodo_hasta = excluded.periodo_hasta,
    validado_en = excluded.validado_en,
    actualizado_en = now();

-- Recupera los ajustes que todavia existen en filas activas o historicas. Se
-- toma la edicion manual mas reciente de cada identidad estable.
INSERT INTO public.comisiones_tipo_tiempo_ajustes (
  ajuste_clave,
  os_numero,
  tecnico_profile_id,
  tecnico_codigo,
  tecnico_nombre,
  fecha_inicio,
  hora_inicio,
  fecha_fin,
  hora_fin,
  tipo_tiempo,
  valor_importado_al_ajustar,
  ajustado_por,
  ajustado_en,
  actualizado_en
)
SELECT DISTINCT ON (clave)
  clave,
  j.os_numero,
  j.tecnico_profile_id,
  j.tecnico_codigo,
  j.tecnico_nombre,
  j.fecha_inicio,
  j.hora_inicio,
  j.fecha_fin,
  j.hora_fin,
  j.tipo_tiempo,
  j.tipo_tiempo_importado,
  j.tipo_tiempo_ajustado_por,
  coalesce(j.tipo_tiempo_ajustado_en, j.actualizado_en, j.creado_en, now()),
  now()
FROM public.comisiones_jornadas j
CROSS JOIN LATERAL (
  SELECT public.comisiones_clave_ajuste_tipo_tiempo(
    j.os_numero,
    j.tecnico_profile_id,
    j.tecnico_codigo,
    j.tecnico_nombre,
    j.fecha_inicio,
    j.hora_inicio,
    j.fecha_fin,
    j.hora_fin
  ) AS clave
) identidad
WHERE j.tipo_tiempo_ajustado = true
ORDER BY
  clave,
  j.tipo_tiempo_ajustado_en DESC NULLS LAST,
  j.actualizado_en DESC NULLS LAST,
  j.creado_en DESC
ON CONFLICT (ajuste_clave) DO UPDATE
SET tipo_tiempo = excluded.tipo_tiempo,
    valor_importado_al_ajustar = excluded.valor_importado_al_ajustar,
    ajustado_por = excluded.ajustado_por,
    ajustado_en = excluded.ajustado_en,
    actualizado_en = now();

CREATE OR REPLACE FUNCTION public.comisiones_aplicar_ajuste_tipo_tiempo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ajuste public.comisiones_tipo_tiempo_ajustes%ROWTYPE;
  v_validacion public.comisiones_tipo_tiempo_validaciones_os%ROWTYPE;
BEGIN
  SELECT a.*
  INTO v_ajuste
  FROM public.comisiones_tipo_tiempo_ajustes a
  WHERE a.ajuste_clave = public.comisiones_clave_ajuste_tipo_tiempo(
    NEW.os_numero,
    NEW.tecnico_profile_id,
    NEW.tecnico_codigo,
    NEW.tecnico_nombre,
    NEW.fecha_inicio,
    NEW.hora_inicio,
    NEW.fecha_fin,
    NEW.hora_fin
  );

  IF FOUND THEN
    NEW.tipo_tiempo := v_ajuste.tipo_tiempo;
    NEW.tipo_tiempo_ajustado := true;
    NEW.tipo_tiempo_ajustado_por := v_ajuste.ajustado_por;
    NEW.tipo_tiempo_ajustado_en := v_ajuste.ajustado_en;
    NEW.raw_data := coalesce(NEW.raw_data, '{}'::jsonb) || jsonb_build_object(
      'tipo_tiempo_ajuste_persistente', jsonb_build_object(
        'clave', v_ajuste.ajuste_clave,
        'valor', v_ajuste.tipo_tiempo,
        'valor_importado_al_ajustar', v_ajuste.valor_importado_al_ajustar,
        'usuario_id', v_ajuste.ajustado_por,
        'fecha', v_ajuste.ajustado_en
      )
    );
  ELSE
    SELECT v.*
    INTO v_validacion
    FROM public.comisiones_tipo_tiempo_validaciones_os v
    WHERE upper(btrim(v.os_numero)) = upper(btrim(NEW.os_numero));

    IF FOUND THEN
      NEW.tipo_tiempo := v_validacion.tipo_tiempo;
      NEW.tipo_tiempo_ajustado := true;
      NEW.tipo_tiempo_ajustado_por := NULL;
      NEW.tipo_tiempo_ajustado_en := v_validacion.validado_en;
      NEW.raw_data := coalesce(NEW.raw_data, '{}'::jsonb) || jsonb_build_object(
        'tipo_tiempo_validacion_os', jsonb_build_object(
          'valor', v_validacion.tipo_tiempo,
          'fuente', v_validacion.fuente,
          'periodo_desde', v_validacion.periodo_desde,
          'periodo_hasta', v_validacion.periodo_hasta,
          'fecha', v_validacion.validado_en
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comisiones_aplicar_ajuste_tipo_tiempo_trigger
  ON public.comisiones_jornadas;
CREATE TRIGGER comisiones_aplicar_ajuste_tipo_tiempo_trigger
BEFORE INSERT OR UPDATE OF
  os_numero,
  tecnico_profile_id,
  tecnico_codigo,
  tecnico_nombre,
  fecha_inicio,
  hora_inicio,
  fecha_fin,
  hora_fin,
  tipo_tiempo,
  tipo_tiempo_importado,
  tipo_tiempo_ajustado,
  tipo_tiempo_ajustado_por,
  tipo_tiempo_ajustado_en
ON public.comisiones_jornadas
FOR EACH ROW
EXECUTE FUNCTION public.comisiones_aplicar_ajuste_tipo_tiempo();

CREATE OR REPLACE FUNCTION public.comisiones_actualizar_tipo_tiempo(
  p_jornada_id uuid,
  p_tipo_tiempo text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tipo text := initcap(lower(btrim(coalesce(p_tipo_tiempo, ''))));
  v_jornada public.comisiones_jornadas%ROWTYPE;
  v_clave text;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (
       public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
     ) THEN
    RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501';
  END IF;

  IF v_tipo = 'Garantia' THEN
    v_tipo := 'Garantia';
  ELSIF v_tipo NOT IN ('Cliente', 'Interno', 'Desconocido') THEN
    RAISE EXCEPTION 'Tipo de tiempo invalido' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_jornada
  FROM public.comisiones_jornadas
  WHERE id = p_jornada_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jornada no encontrada' USING ERRCODE = 'P0002';
  END IF;

  v_clave := public.comisiones_clave_ajuste_tipo_tiempo(
    v_jornada.os_numero,
    v_jornada.tecnico_profile_id,
    v_jornada.tecnico_codigo,
    v_jornada.tecnico_nombre,
    v_jornada.fecha_inicio,
    v_jornada.hora_inicio,
    v_jornada.fecha_fin,
    v_jornada.hora_fin
  );

  -- Toda seleccion hecha desde la interfaz es una decision explicita. Se
  -- conserva incluso si casualmente coincide con el valor importado actual,
  -- porque una importacion futura puede clasificarlo de otra forma.
  INSERT INTO public.comisiones_tipo_tiempo_ajustes (
    ajuste_clave,
    os_numero,
    tecnico_profile_id,
    tecnico_codigo,
    tecnico_nombre,
    fecha_inicio,
    hora_inicio,
    fecha_fin,
    hora_fin,
    tipo_tiempo,
    valor_importado_al_ajustar,
    ajustado_por,
    ajustado_en,
    actualizado_en
  ) VALUES (
    v_clave,
    v_jornada.os_numero,
    v_jornada.tecnico_profile_id,
    v_jornada.tecnico_codigo,
    v_jornada.tecnico_nombre,
    v_jornada.fecha_inicio,
    v_jornada.hora_inicio,
    v_jornada.fecha_fin,
    v_jornada.hora_fin,
    v_tipo,
    v_jornada.tipo_tiempo_importado,
    auth.uid(),
    now(),
    now()
  )
  ON CONFLICT (ajuste_clave) DO UPDATE
  SET tipo_tiempo = excluded.tipo_tiempo,
      valor_importado_al_ajustar = excluded.valor_importado_al_ajustar,
      ajustado_por = excluded.ajustado_por,
      ajustado_en = excluded.ajustado_en,
      actualizado_en = now();

  UPDATE public.comisiones_jornadas j
  SET tipo_tiempo = v_tipo,
      tipo_tiempo_ajustado = true,
      tipo_tiempo_ajustado_por = auth.uid(),
      tipo_tiempo_ajustado_en = now(),
      actualizado_en = now(),
      raw_data = coalesce(j.raw_data, '{}'::jsonb) || jsonb_build_object(
        'tipo_tiempo_ultima_edicion', jsonb_build_object(
          'valor', v_tipo,
          'valor_importado', j.tipo_tiempo_importado,
          'manual', true,
          'usuario_id', auth.uid(),
          'fecha', now(),
          'clave_persistente', v_clave
        )
      )
  WHERE public.comisiones_clave_ajuste_tipo_tiempo(
    j.os_numero,
    j.tecnico_profile_id,
    j.tecnico_codigo,
    j.tecnico_nombre,
    j.fecha_inicio,
    j.hora_inicio,
    j.fecha_fin,
    j.hora_fin
  ) = v_clave;

  RETURN v_tipo;
END;
$$;

-- Aplica inmediatamente los ajustes recuperados a la fila vigente. El UPDATE
-- no cambia datos por si mismo; activa el trigger para cada jornada existente.
UPDATE public.comisiones_jornadas
SET tipo_tiempo = tipo_tiempo
WHERE vigente = true;

REVOKE ALL ON FUNCTION public.comisiones_clave_ajuste_tipo_tiempo(
  text, uuid, text, text, date, time, date, time
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comisiones_clave_ajuste_tipo_tiempo(
  text, uuid, text, text, date, time, date, time
) TO authenticated;

REVOKE ALL ON FUNCTION public.comisiones_actualizar_tipo_tiempo(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comisiones_actualizar_tipo_tiempo(uuid, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT
  (SELECT count(*)
   FROM public.comisiones_tipo_tiempo_ajustes) AS ajustes_especificos_recuperados,
  (SELECT count(*)
   FROM public.comisiones_tipo_tiempo_validaciones_os) AS os_recuperadas_desde_excel,
  (SELECT count(*)
   FROM public.comisiones_jornadas j
   WHERE j.vigente = true
     AND j.tipo_tiempo_ajustado = true) AS jornadas_vigentes_con_tipo_protegido,
  (SELECT count(DISTINCT upper(btrim(j.os_numero)))
   FROM public.comisiones_jornadas j
   JOIN public.comisiones_tipo_tiempo_validaciones_os v
     ON upper(btrim(v.os_numero)) = upper(btrim(j.os_numero))
   WHERE j.vigente = true
     AND j.tipo_tiempo = v.tipo_tiempo) AS os_del_excel_aplicadas;
