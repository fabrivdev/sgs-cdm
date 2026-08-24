-- Alinea las OS ya importadas con la fuente persistida de Comisiones.
-- Completa participantes MA01/KM, copia las horas de reloj por tecnico y
-- conserva la duracion de la OS una sola vez (no suma horas-persona).
--
-- Es idempotente y no reimporta XML, no liquida comisiones y no modifica
-- jornadas ni pagos. Las OS sin cobertura en comisiones_jornadas no cambian.

DO $$
DECLARE
  v_os_actualizadas integer := 0;
  v_tecnicos_alineados integer := 0;
  v_inconsistencias integer := 0;
BEGIN
  CREATE TEMP TABLE _comision_tecnico_os ON COMMIT DROP AS
  WITH base AS (
    SELECT
      j.os_numero,
      upper(btrim(j.tecnico_nombre)) AS tecnico_nombre,
      CASE
        WHEN normalizado = 'DENNIS BENITEZ' THEN 'DENIS DE LA CRUZ BENITEZ ARAUJO'
        WHEN normalizado IN ('DANIEL MOLINAS', 'EVARISTO DANIEL') THEN 'EVARISTO DANIEL MOLINAS'
        ELSE normalizado
      END AS tecnico_clave,
      j.rol_tecnico,
      j.horas_calculadas
    FROM public.comisiones_jornadas j
    CROSS JOIN LATERAL (
      SELECT btrim(regexp_replace(
        translate(upper(btrim(j.tecnico_nombre)), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'),
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
  )
  SELECT
    os_numero,
    tecnico_nombre,
    tecnico_clave,
    sum(horas_calculadas)::numeric(12,4) AS horas,
    bool_or(rol_tecnico = 'PRINCIPAL') AS es_principal
  FROM base
  WHERE tecnico_clave <> ''
  GROUP BY os_numero, tecnico_nombre, tecnico_clave;

  CREATE UNIQUE INDEX ON _comision_tecnico_os(os_numero, tecnico_nombre);
  CREATE INDEX ON _comision_tecnico_os(os_numero, tecnico_clave);

  -- Busca los totales raw preexistentes por nombre normalizado para conservar
  -- kilometros y valores. Si el raw contiene dos claves equivalentes, no elige
  -- una arbitrariamente: las horas siguen viniendo de Comisiones y los demas
  -- campos quedan vacios en la nueva clave canonica.
  CREATE TEMP TABLE _raw_tecnico_os ON COMMIT DROP AS
  SELECT *
  FROM (
    SELECT
      osi.os_numero,
      tecnico.key AS tecnico_raw,
      tecnico.value AS totales_raw,
      CASE
        WHEN normalizado = 'DENNIS BENITEZ' THEN 'DENIS DE LA CRUZ BENITEZ ARAUJO'
        WHEN normalizado IN ('DANIEL MOLINAS', 'EVARISTO DANIEL') THEN 'EVARISTO DANIEL MOLINAS'
        ELSE normalizado
      END AS tecnico_clave,
      count(*) OVER (
        PARTITION BY osi.os_numero,
        CASE
          WHEN normalizado = 'DENNIS BENITEZ' THEN 'DENIS DE LA CRUZ BENITEZ ARAUJO'
          WHEN normalizado IN ('DANIEL MOLINAS', 'EVARISTO DANIEL') THEN 'EVARISTO DANIEL MOLINAS'
          ELSE normalizado
        END
      ) AS coincidencias
    FROM public.ordenes_servicio_importadas osi
    CROSS JOIN LATERAL jsonb_each(
      CASE
        WHEN jsonb_typeof(osi.raw_data -> 'totales_por_tecnico') = 'object'
          THEN osi.raw_data -> 'totales_por_tecnico'
        ELSE '{}'::jsonb
      END
    ) tecnico(key, value)
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
  ) candidatos
  WHERE coincidencias = 1;

  CREATE UNIQUE INDEX ON _raw_tecnico_os(os_numero, tecnico_clave);

  CREATE TEMP TABLE _os_dashboard_payload ON COMMIT DROP AS
  SELECT
    c.os_numero,
    jsonb_object_agg(
      c.tecnico_nombre,
      (CASE
        WHEN jsonb_typeof(r.totales_raw) = 'object' THEN r.totales_raw
        ELSE '{}'::jsonb
      END) || jsonb_build_object('horas', c.horas)
      ORDER BY c.tecnico_nombre
    ) AS totales_corregidos,
    jsonb_agg(c.tecnico_nombre ORDER BY c.tecnico_nombre) AS participantes,
    jsonb_agg(c.tecnico_nombre ORDER BY c.tecnico_nombre)
      FILTER (WHERE NOT c.es_principal) AS auxiliares,
    jsonb_agg(c.tecnico_nombre ORDER BY c.tecnico_nombre)
      FILTER (WHERE c.es_principal) AS responsables,
    max(c.horas)::numeric(12,4) AS horas_os
  FROM _comision_tecnico_os c
  LEFT JOIN _raw_tecnico_os r
    ON r.os_numero = c.os_numero
   AND r.tecnico_clave = c.tecnico_clave
  GROUP BY c.os_numero;

  SELECT count(*) INTO v_tecnicos_alineados FROM _comision_tecnico_os;

  UPDATE public.ordenes_servicio_importadas osi
  SET
    servicios_cantidad = payload.horas_os,
    raw_data = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              COALESCE(osi.raw_data, '{}'::jsonb),
              '{totales_por_tecnico}',
              (CASE
                WHEN jsonb_typeof(osi.raw_data -> 'totales_por_tecnico') = 'object'
                  THEN osi.raw_data -> 'totales_por_tecnico'
                ELSE '{}'::jsonb
              END) || payload.totales_corregidos,
              true
            ),
            '{tecnicos_participantes}', payload.participantes, true
          ),
          '{tecnicos_auxiliares}', COALESCE(payload.auxiliares, '[]'::jsonb), true
        ),
        '{tecnicos_responsables}', COALESCE(payload.responsables, '[]'::jsonb), true
      ),
      '{alineacion_dashboard_comisiones}',
      jsonb_build_object(
        'aplicado_en', clock_timestamp(),
        'fuente', 'comisiones_jornadas.horas_calculadas',
        'criterio_fecha_dashboard', 'cierre_para_cerradas_apertura_para_abiertas',
        'horas_os', payload.horas_os
      ),
      true
    ),
    actualizado_en = now()
  FROM _os_dashboard_payload payload
  WHERE payload.os_numero = osi.os_numero;

  GET DIAGNOSTICS v_os_actualizadas = ROW_COUNT;

  SELECT count(*)
  INTO v_inconsistencias
  FROM _comision_tecnico_os c
  JOIN public.ordenes_servicio_importadas osi
    ON osi.os_numero = c.os_numero
  WHERE NOT (COALESCE(osi.raw_data -> 'tecnicos_participantes', '[]'::jsonb) ? c.tecnico_nombre)
     OR COALESCE(
          (osi.raw_data -> 'totales_por_tecnico' -> c.tecnico_nombre ->> 'horas')::numeric,
          -1
        ) IS DISTINCT FROM c.horas;

  IF v_inconsistencias > 0 THEN
    RAISE EXCEPTION
      'Alineacion cancelada: % participantes u horas no coinciden con Comisiones',
      v_inconsistencias;
  END IF;

  RAISE NOTICE
    'Alineacion lista. OS actualizadas: %, tecnicos alineados: %, inconsistencias: 0.',
    v_os_actualizadas,
    v_tecnicos_alineados;
END;
$$;

NOTIFY pgrst, 'reload schema';
