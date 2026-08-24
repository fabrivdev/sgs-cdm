-- Recalcula, una sola vez, las horas por tecnico del dashboard de OS usando
-- las jornadas de reloj ya persistidas por Comisiones.
--
-- Alcance deliberadamente limitado:
--   * solo OS del sistema nuevo (numero con prefijo de sucursal ##-);
--   * solo jornadas vigentes, no invalidas y con horas de reloj positivas;
--   * solo tecnicos que puedan vincularse de forma univoca dentro de la OS;
--   * solo raw_data.totales_por_tecnico[*].horas.
--
-- No modifica servicios_cantidad (horas de la OS), liquidaciones, jornadas,
-- participantes, importaciones, kilometros ni valores. Las OS/tecnicos sin
-- cobertura permanecen exactamente como estaban y se corregiran al volver a
-- aparecer en una importacion diaria con el importador nuevo.
--
-- La medicion de 116 OS fue una fotografia previa. No se fija ese numero en
-- el SQL porque la cobertura puede crecer antes de aplicar la migracion.

DO $$
DECLARE
  v_os_con_jornadas integer := 0;
  v_os_vinculadas integer := 0;
  v_tecnicos_vinculados integer := 0;
  v_tecnicos_sin_match integer := 0;
  v_os_actualizadas integer := 0;
  v_inconsistencias integer := 0;
BEGIN
  -- La clave reproduce la normalizacion utilizada por el frontend: quita el
  -- codigo interno opcional, acentos, signos y espacios repetidos. Los alias
  -- historicos conocidos se consolidan al mismo nombre activo.
  CREATE TEMP TABLE _comisiones_horas_reloj ON COMMIT DROP AS
  WITH jornadas_base AS (
    SELECT
      j.os_numero,
      CASE
        WHEN normalizado = 'DENNIS BENITEZ' THEN 'DENIS DE LA CRUZ BENITEZ ARAUJO'
        WHEN normalizado IN ('DANIEL MOLINAS', 'EVARISTO DANIEL') THEN 'EVARISTO DANIEL MOLINAS'
        ELSE normalizado
      END AS tecnico_clave,
      j.tipo_tiempo,
      j.horas_calculadas,
      COALESCE(
        j.tecnico_profile_id::text,
        'NOMBRE:' || upper(btrim(j.tecnico_nombre))
      ) AS identidad
    FROM public.comisiones_jornadas j
    CROSS JOIN LATERAL (
      SELECT btrim(regexp_replace(
        regexp_replace(
          translate(
            upper(btrim(COALESCE(NULLIF(j.raw_data ->> 'source_technician', ''), j.tecnico_nombre))),
            'ÁÉÍÓÚÜÑ',
            'AEIOUUN'
          ),
          '^(?:[A-Z]{1,6}[[:space:]-]*)?[0-9]{2,}[[:space:]]*(?:[-:|/][[:space:]]*)?',
          ''
        ),
        '[^A-Z0-9]+',
        ' ',
        'g'
      )) AS normalizado
    ) nombre
    WHERE j.vigente = true
      AND j.origen_sistema = 'new_xml_ordenes_servicio'
      AND j.os_numero ~ '^[0-9]{2}-'
      AND j.estado_validacion <> 'INVALIDA'
      AND j.horas_calculadas > 0
  ),
  fuentes_univocas AS (
    SELECT os_numero, tecnico_clave
    FROM jornadas_base
    WHERE tecnico_clave <> ''
    GROUP BY os_numero, tecnico_clave
    HAVING count(DISTINCT identidad) = 1
  ),
  por_tipo AS (
    SELECT
      j.os_numero,
      j.tecnico_clave,
      j.tipo_tiempo,
      sum(j.horas_calculadas)::numeric(12,4) AS horas,
      count(*)::integer AS jornadas
    FROM jornadas_base j
    JOIN fuentes_univocas u
      ON u.os_numero = j.os_numero
     AND u.tecnico_clave = j.tecnico_clave
    GROUP BY j.os_numero, j.tecnico_clave, j.tipo_tiempo
  )
  SELECT
    os_numero,
    tecnico_clave,
    sum(horas)::numeric(12,4) AS horas,
    sum(jornadas)::integer AS jornadas,
    jsonb_object_agg(tipo_tiempo, to_jsonb(horas) ORDER BY tipo_tiempo) AS horas_por_tipo
  FROM por_tipo
  GROUP BY os_numero, tecnico_clave;

  CREATE UNIQUE INDEX ON _comisiones_horas_reloj(os_numero, tecnico_clave);

  CREATE TEMP TABLE _os_tecnicos_raw ON COMMIT DROP AS
  SELECT
    osi.os_numero,
    tecnico.key AS tecnico_raw,
    tecnico.value AS totales_raw,
    CASE
      WHEN normalizado = 'DENNIS BENITEZ' THEN 'DENIS DE LA CRUZ BENITEZ ARAUJO'
      WHEN normalizado IN ('DANIEL MOLINAS', 'EVARISTO DANIEL') THEN 'EVARISTO DANIEL MOLINAS'
      ELSE normalizado
    END AS tecnico_clave
  FROM public.ordenes_servicio_importadas osi
  CROSS JOIN LATERAL jsonb_each(
    CASE
      WHEN jsonb_typeof(osi.raw_data -> 'totales_por_tecnico') = 'object'
        THEN osi.raw_data -> 'totales_por_tecnico'
      ELSE '{}'::jsonb
    END
  ) AS tecnico(key, value)
  CROSS JOIN LATERAL (
    SELECT btrim(regexp_replace(
      regexp_replace(
        translate(upper(btrim(tecnico.key)), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'),
        '^(?:[A-Z]{1,6}[[:space:]-]*)?[0-9]{2,}[[:space:]]*(?:[-:|/][[:space:]]*)?',
        ''
      ),
      '[^A-Z0-9]+',
      ' ',
      'g'
    )) AS normalizado
  ) nombre
  WHERE osi.os_numero ~ '^[0-9]{2}-'
    AND jsonb_typeof(osi.raw_data -> 'totales_por_tecnico') = 'object';

  CREATE INDEX ON _os_tecnicos_raw(os_numero, tecnico_clave);

  -- Si dos claves raw de una misma OS normalizan al mismo tecnico, no se
  -- decide automaticamente: esa correspondencia queda fuera del backfill.
  CREATE TEMP TABLE _os_comisiones_matches ON COMMIT DROP AS
  WITH raw_univoco AS (
    SELECT os_numero, tecnico_clave
    FROM _os_tecnicos_raw
    WHERE tecnico_clave <> ''
    GROUP BY os_numero, tecnico_clave
    HAVING count(*) = 1
  )
  SELECT
    r.os_numero,
    r.tecnico_raw,
    r.tecnico_clave,
    c.horas,
    c.jornadas,
    c.horas_por_tipo
  FROM _os_tecnicos_raw r
  JOIN raw_univoco u
    ON u.os_numero = r.os_numero
   AND u.tecnico_clave = r.tecnico_clave
  JOIN _comisiones_horas_reloj c
    ON c.os_numero = r.os_numero
   AND c.tecnico_clave = r.tecnico_clave;

  CREATE UNIQUE INDEX ON _os_comisiones_matches(os_numero, tecnico_raw);

  SELECT count(DISTINCT os_numero)
  INTO v_os_con_jornadas
  FROM _comisiones_horas_reloj;

  SELECT count(DISTINCT os_numero), count(*)
  INTO v_os_vinculadas, v_tecnicos_vinculados
  FROM _os_comisiones_matches;

  SELECT count(*)
  INTO v_tecnicos_sin_match
  FROM _comisiones_horas_reloj c
  WHERE NOT EXISTS (
    SELECT 1
    FROM _os_comisiones_matches m
    WHERE m.os_numero = c.os_numero
      AND m.tecnico_clave = c.tecnico_clave
  );

  IF v_tecnicos_vinculados = 0 THEN
    RAISE EXCEPTION
      'Backfill cancelado: no hubo coincidencias univocas entre Comisiones y las OS';
  END IF;

  CREATE TEMP TABLE _os_horas_reconstruidas ON COMMIT DROP AS
  SELECT
    osi.os_numero,
    jsonb_object_agg(
      tecnico.key,
      CASE
        WHEN m.tecnico_raw IS NULL THEN tecnico.value
        ELSE
          (CASE
            WHEN jsonb_typeof(tecnico.value) = 'object' THEN tecnico.value
            ELSE '{}'::jsonb
          END)
          || jsonb_build_object('horas', m.horas)
      END
      ORDER BY tecnico.key
    ) AS totales_por_tecnico,
    jsonb_object_agg(
      m.tecnico_raw,
      jsonb_build_object(
        'horas_reloj', m.horas,
        'jornadas', m.jornadas,
        'horas_por_tipo', m.horas_por_tipo
      )
      ORDER BY m.tecnico_raw
    ) FILTER (WHERE m.tecnico_raw IS NOT NULL) AS detalle_backfill
  FROM public.ordenes_servicio_importadas osi
  CROSS JOIN LATERAL jsonb_each(
    CASE
      WHEN jsonb_typeof(osi.raw_data -> 'totales_por_tecnico') = 'object'
        THEN osi.raw_data -> 'totales_por_tecnico'
      ELSE '{}'::jsonb
    END
  ) AS tecnico(key, value)
  LEFT JOIN _os_comisiones_matches m
    ON m.os_numero = osi.os_numero
   AND m.tecnico_raw = tecnico.key
  WHERE EXISTS (
    SELECT 1
    FROM _os_comisiones_matches candidato
    WHERE candidato.os_numero = osi.os_numero
  )
  GROUP BY osi.os_numero;

  UPDATE public.ordenes_servicio_importadas osi
  SET
    raw_data = jsonb_set(
      jsonb_set(
        COALESCE(osi.raw_data, '{}'::jsonb),
        '{totales_por_tecnico}',
        reconstruida.totales_por_tecnico,
        true
      ),
      '{backfill_horas_comisiones}',
      jsonb_build_object(
        'aplicado_en', clock_timestamp(),
        'fuente', 'comisiones_jornadas.horas_calculadas',
        'criterio', 'OS + tecnico univoco',
        'detalle', reconstruida.detalle_backfill
      ),
      true
    ),
    actualizado_en = now()
  FROM _os_horas_reconstruidas reconstruida
  WHERE reconstruida.os_numero = osi.os_numero;

  GET DIAGNOSTICS v_os_actualizadas = ROW_COUNT;

  -- Verificacion atomica: si una hora escrita no coincide con su fuente, toda
  -- la migracion se revierte en vez de dejar un backfill parcial silencioso.
  SELECT count(*)
  INTO v_inconsistencias
  FROM _os_comisiones_matches m
  JOIN public.ordenes_servicio_importadas osi
    ON osi.os_numero = m.os_numero
  WHERE COALESCE(
    (osi.raw_data -> 'totales_por_tecnico' -> m.tecnico_raw ->> 'horas')::numeric,
    -1
  ) IS DISTINCT FROM m.horas;

  IF v_inconsistencias > 0 THEN
    RAISE EXCEPTION
      'Backfill inconsistente: % horas no coinciden con Comisiones',
      v_inconsistencias;
  END IF;

  RAISE NOTICE
    'Backfill listo. OS con jornadas: %, OS vinculadas/actualizadas: %/%, tecnicos vinculados: %, fuentes sin match univoco: %.',
    v_os_con_jornadas,
    v_os_vinculadas,
    v_os_actualizadas,
    v_tecnicos_vinculados,
    v_tecnicos_sin_match;
END;
$$;
