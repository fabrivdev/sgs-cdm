-- Hace atómica la reimportación de comisiones y reconstruye participantes
-- KM/SE que quedaron activos pero sin horario. Una falla ya no puede dejar
-- una OS desactivada entre el borrado lógico y el upsert.

CREATE OR REPLACE FUNCTION public.comisiones_reemplazar_jornadas(
  p_os_numeros text[],
  p_jornadas jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_desactivadas integer := 0;
  v_guardadas integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (
       public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
     ) THEN
    RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(coalesce(p_jornadas, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Las jornadas deben enviarse como un arreglo JSON'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(coalesce(p_jornadas, '[]'::jsonb)) AS x(os_numero text)
    WHERE x.os_numero IS NULL
       OR NOT (x.os_numero = ANY(coalesce(p_os_numeros, '{}'::text[])))
  ) THEN
    RAISE EXCEPTION 'El contenido incluye una OS fuera del reemplazo solicitado'
      USING ERRCODE = '22023';
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
  GET DIAGNOSTICS v_desactivadas = ROW_COUNT;

  INSERT INTO public.comisiones_jornadas (
    fuente_clave,
    importacion_id,
    origen_sistema,
    sucursal,
    os_numero,
    cliente_nombre,
    nro_chasis,
    estado_os,
    fecha_cierre,
    fecha_inicio,
    hora_inicio,
    fecha_fin,
    hora_fin,
    tecnico_codigo,
    tecnico_nombre,
    tecnico_profile_id,
    rol_tecnico,
    tipo_tiempo,
    tipo_tiempo_importado,
    tipo_tiempo_ajustado,
    tipo_tiempo_ajustado_por,
    tipo_tiempo_ajustado_en,
    horas_reportadas,
    horas_calculadas,
    horas_validas,
    estado_validacion,
    motivos_validacion,
    validado_por,
    validado_en,
    raw_data,
    vigente,
    actualizado_en
  )
  SELECT
    x.fuente_clave,
    x.importacion_id,
    coalesce(x.origen_sistema, 'new_xml_ordenes_servicio'),
    x.sucursal,
    x.os_numero,
    x.cliente_nombre,
    x.nro_chasis,
    x.estado_os,
    x.fecha_cierre,
    x.fecha_inicio,
    x.hora_inicio,
    x.fecha_fin,
    x.hora_fin,
    x.tecnico_codigo,
    x.tecnico_nombre,
    x.tecnico_profile_id,
    x.rol_tecnico,
    x.tipo_tiempo,
    coalesce(x.tipo_tiempo_importado, x.tipo_tiempo),
    coalesce(x.tipo_tiempo_ajustado, false),
    x.tipo_tiempo_ajustado_por,
    x.tipo_tiempo_ajustado_en,
    x.horas_reportadas,
    x.horas_calculadas,
    x.horas_validas,
    x.estado_validacion,
    coalesce(x.motivos_validacion, '{}'::text[]),
    x.validado_por,
    x.validado_en,
    coalesce(x.raw_data, '{}'::jsonb),
    true,
    now()
  FROM jsonb_to_recordset(coalesce(p_jornadas, '[]'::jsonb)) AS x(
    fuente_clave text,
    importacion_id uuid,
    origen_sistema text,
    sucursal text,
    os_numero text,
    cliente_nombre text,
    nro_chasis text,
    estado_os text,
    fecha_cierre date,
    fecha_inicio date,
    hora_inicio time,
    fecha_fin date,
    hora_fin time,
    tecnico_codigo text,
    tecnico_nombre text,
    tecnico_profile_id uuid,
    rol_tecnico text,
    tipo_tiempo text,
    tipo_tiempo_importado text,
    tipo_tiempo_ajustado boolean,
    tipo_tiempo_ajustado_por uuid,
    tipo_tiempo_ajustado_en timestamptz,
    horas_reportadas numeric,
    horas_calculadas numeric,
    horas_validas numeric,
    estado_validacion text,
    motivos_validacion text[],
    validado_por uuid,
    validado_en timestamptz,
    raw_data jsonb,
    vigente boolean
  )
  ON CONFLICT (fuente_clave) DO UPDATE
  SET importacion_id = excluded.importacion_id,
      origen_sistema = excluded.origen_sistema,
      sucursal = excluded.sucursal,
      os_numero = excluded.os_numero,
      cliente_nombre = excluded.cliente_nombre,
      nro_chasis = excluded.nro_chasis,
      estado_os = excluded.estado_os,
      fecha_cierre = excluded.fecha_cierre,
      fecha_inicio = excluded.fecha_inicio,
      hora_inicio = excluded.hora_inicio,
      fecha_fin = excluded.fecha_fin,
      hora_fin = excluded.hora_fin,
      tecnico_codigo = excluded.tecnico_codigo,
      tecnico_nombre = excluded.tecnico_nombre,
      tecnico_profile_id = excluded.tecnico_profile_id,
      rol_tecnico = excluded.rol_tecnico,
      tipo_tiempo = CASE
        WHEN comisiones_jornadas.tipo_tiempo_ajustado THEN comisiones_jornadas.tipo_tiempo
        ELSE excluded.tipo_tiempo
      END,
      tipo_tiempo_importado = excluded.tipo_tiempo_importado,
      tipo_tiempo_ajustado = comisiones_jornadas.tipo_tiempo_ajustado,
      tipo_tiempo_ajustado_por = comisiones_jornadas.tipo_tiempo_ajustado_por,
      tipo_tiempo_ajustado_en = comisiones_jornadas.tipo_tiempo_ajustado_en,
      horas_reportadas = excluded.horas_reportadas,
      horas_calculadas = excluded.horas_calculadas,
      horas_validas = CASE
        WHEN comisiones_jornadas.validado_por IS NOT NULL
          THEN comisiones_jornadas.horas_validas
        ELSE excluded.horas_validas
      END,
      estado_validacion = CASE
        WHEN comisiones_jornadas.validado_por IS NOT NULL
          THEN comisiones_jornadas.estado_validacion
        ELSE excluded.estado_validacion
      END,
      motivos_validacion = excluded.motivos_validacion,
      validado_por = coalesce(comisiones_jornadas.validado_por, excluded.validado_por),
      validado_en = coalesce(comisiones_jornadas.validado_en, excluded.validado_en),
      raw_data = excluded.raw_data,
      vigente = true,
      actualizado_en = now()
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.comisiones_liquidacion_detalle d
    WHERE d.jornada_id = comisiones_jornadas.id
  );
  GET DIAGNOSTICS v_guardadas = ROW_COUNT;

  RETURN jsonb_build_object(
    'desactivadas', v_desactivadas,
    'guardadas', v_guardadas
  );
END;
$$;

REVOKE ALL ON FUNCTION public.comisiones_reemplazar_jornadas(text[], jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comisiones_reemplazar_jornadas(text[], jsonb)
  TO authenticated;

-- Reparación auditable de participantes KM/SE actualmente inválidos. El
-- horario se toma de cada bloque MA01 vigente de la misma OS; nunca de la
-- cantidad ni de los ceros de la línea KM/SE.
CREATE OR REPLACE FUNCTION public.comisiones_reconstruir_participantes_heredados()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reconstruidas integer := 0;
  v_invalidas_desactivadas integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (
       public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
     ) THEN
    RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501';
  END IF;

  WITH participantes AS (
    SELECT DISTINCT ON (
      j.os_numero,
      upper(regexp_replace(btrim(j.tecnico_nombre), '\s+', ' ', 'g'))
    )
      j.os_numero,
      j.tecnico_codigo,
      j.tecnico_nombre,
      j.tecnico_profile_id,
      j.raw_data ->> 'source_participant_origin' AS origen_participante,
      coalesce(
        nullif(j.raw_data ->> 'source_technician', ''),
        j.tecnico_nombre
      ) AS tecnico_fuente
    FROM public.comisiones_jornadas j
    WHERE j.origen_sistema = 'new_xml_ordenes_servicio'
      AND j.raw_data ->> 'source_participant_origin' IN ('KM', 'SE')
    ORDER BY
      j.os_numero,
      upper(regexp_replace(btrim(j.tecnico_nombre), '\s+', ' ', 'g')),
      j.vigente DESC,
      j.actualizado_en DESC NULLS LAST,
      j.creado_en DESC
  ), bloques_ma01 AS (
    SELECT j.*
    FROM public.comisiones_jornadas j
    WHERE j.vigente = true
      AND j.origen_sistema = 'new_xml_ordenes_servicio'
      AND j.raw_data ->> 'source_participant_origin' = 'MA01'
      AND j.horas_calculadas > 0
      AND j.estado_validacion <> 'INVALIDA'
  )
  INSERT INTO public.comisiones_jornadas (
    fuente_clave,
    importacion_id,
    origen_sistema,
    sucursal,
    os_numero,
    cliente_nombre,
    nro_chasis,
    estado_os,
    fecha_cierre,
    fecha_inicio,
    hora_inicio,
    fecha_fin,
    hora_fin,
    tecnico_codigo,
    tecnico_nombre,
    tecnico_profile_id,
    rol_tecnico,
    tipo_tiempo,
    tipo_tiempo_importado,
    tipo_tiempo_ajustado,
    horas_reportadas,
    horas_calculadas,
    horas_validas,
    estado_validacion,
    motivos_validacion,
    raw_data,
    vigente,
    actualizado_en
  )
  SELECT
    'COMISION|HEREDADA|' || b.id::text || '|'
      || md5(upper(regexp_replace(btrim(p.tecnico_nombre), '\s+', ' ', 'g'))),
    b.importacion_id,
    b.origen_sistema,
    b.sucursal,
    b.os_numero,
    b.cliente_nombre,
    b.nro_chasis,
    b.estado_os,
    b.fecha_cierre,
    b.fecha_inicio,
    b.hora_inicio,
    b.fecha_fin,
    b.hora_fin,
    p.tecnico_codigo,
    p.tecnico_nombre,
    p.tecnico_profile_id,
    'AUXILIAR',
    b.tipo_tiempo,
    coalesce(b.tipo_tiempo_importado, b.tipo_tiempo),
    false,
    b.horas_reportadas,
    b.horas_calculadas,
    CASE WHEN p.tecnico_profile_id IS NULL THEN NULL ELSE b.horas_calculadas END,
    CASE WHEN p.tecnico_profile_id IS NULL THEN 'REVISAR' ELSE 'VALIDA' END,
    CASE
      WHEN p.tecnico_profile_id IS NULL
        THEN ARRAY['TECNICO_FUERA_DE_NOMINA_ACTIVA']::text[]
      ELSE '{}'::text[]
    END,
    b.raw_data || jsonb_build_object(
      'source_technician', p.tecnico_fuente,
      'source_participant_origin', p.origen_participante,
      'inherited_from_ma01', true,
      'reconstruido_por_migracion', '20260825170000',
      'reconstruido_desde_jornada', b.id
    ),
    true,
    now()
  FROM bloques_ma01 b
  JOIN participantes p ON p.os_numero = b.os_numero
  WHERE upper(regexp_replace(btrim(p.tecnico_nombre), '\s+', ' ', 'g'))
        <> upper(regexp_replace(btrim(b.tecnico_nombre), '\s+', ' ', 'g'))
    AND NOT EXISTS (
      SELECT 1
      FROM public.comisiones_jornadas actual
      WHERE actual.vigente = true
        AND actual.horas_calculadas > 0
        AND actual.os_numero = b.os_numero
        AND upper(regexp_replace(btrim(actual.tecnico_nombre), '\s+', ' ', 'g'))
            = upper(regexp_replace(btrim(p.tecnico_nombre), '\s+', ' ', 'g'))
        AND actual.fecha_inicio IS NOT DISTINCT FROM b.fecha_inicio
        AND actual.hora_inicio IS NOT DISTINCT FROM b.hora_inicio
        AND actual.fecha_fin IS NOT DISTINCT FROM b.fecha_fin
        AND actual.hora_fin IS NOT DISTINCT FROM b.hora_fin
        AND actual.tipo_tiempo = b.tipo_tiempo
    )
  ON CONFLICT (fuente_clave) DO UPDATE
  SET importacion_id = excluded.importacion_id,
      fecha_cierre = excluded.fecha_cierre,
      horas_reportadas = excluded.horas_reportadas,
      horas_calculadas = excluded.horas_calculadas,
      horas_validas = excluded.horas_validas,
      estado_validacion = excluded.estado_validacion,
      motivos_validacion = excluded.motivos_validacion,
      raw_data = excluded.raw_data,
      vigente = true,
      actualizado_en = now();
  GET DIAGNOSTICS v_reconstruidas = ROW_COUNT;

  UPDATE public.comisiones_jornadas invalida
  SET vigente = false,
      actualizado_en = now(),
      raw_data = invalida.raw_data || jsonb_build_object(
        'reemplazada_por_jornada_heredada', true,
        'reemplazada_en', now()
      )
  WHERE invalida.vigente = true
    AND invalida.raw_data ->> 'source_participant_origin' IN ('KM', 'SE')
    AND coalesce(invalida.horas_calculadas, 0) <= 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.comisiones_liquidacion_detalle d
      WHERE d.jornada_id = invalida.id
    )
    AND EXISTS (
      SELECT 1
      FROM public.comisiones_jornadas valida
      WHERE valida.vigente = true
        AND valida.os_numero = invalida.os_numero
        AND valida.horas_calculadas > 0
        AND upper(regexp_replace(btrim(valida.tecnico_nombre), '\s+', ' ', 'g'))
            = upper(regexp_replace(btrim(invalida.tecnico_nombre), '\s+', ' ', 'g'))
    );
  GET DIAGNOSTICS v_invalidas_desactivadas = ROW_COUNT;

  RETURN jsonb_build_object(
    'jornadas_reconstruidas', v_reconstruidas,
    'filas_invalidas_desactivadas', v_invalidas_desactivadas
  );
END;
$$;

REVOKE ALL ON FUNCTION public.comisiones_reconstruir_participantes_heredados()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comisiones_reconstruir_participantes_heredados()
  TO authenticated;

SELECT public.comisiones_reconstruir_participantes_heredados();

NOTIFY pgrst, 'reload schema';
