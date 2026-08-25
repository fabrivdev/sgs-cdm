-- Recupera los tipos de tiempo del corte validado sin perder las correcciones
-- que un administrador realizo realmente desde la interfaz.
--
-- La migracion anterior interpreto toda fila con tipo_tiempo_ajustado = true
-- como una edicion manual. Ese indicador tambien habia sido utilizado por
-- reparaciones automaticas, por lo que 13 bloques automaticos terminaron con
-- mayor prioridad que la validacion por OS del Excel ya aprobado.

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
  -- Solo un ajuste asociado a un usuario autenticado es una decision manual.
  -- Los registros automaticos recuperados con ajustado_por NULL no deben
  -- desplazar una validacion de OS ya confirmada.
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
  )
    AND a.ajustado_por IS NOT NULL;

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
      NEW.raw_data := (
        coalesce(NEW.raw_data, '{}'::jsonb)
        - 'tipo_tiempo_ajuste_persistente'
        - 'tipo_tiempo_ultima_edicion'
      ) || jsonb_build_object(
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

-- Elimina todos los falsos overrides automaticos. Esta tabla representa
-- decisiones manuales persistentes: una fila sin usuario no puede ser una
-- seleccion hecha desde la app. Los ajustes reales se conservan intactos.
DELETE FROM public.comisiones_tipo_tiempo_ajustes a
WHERE a.ajustado_por IS NULL;

-- Reactiva el trigger sobre todas las jornadas del corte. En ausencia de un
-- ajuste manual real, vuelve a aplicar el tipo validado de la OS completa.
UPDATE public.comisiones_jornadas j
SET tipo_tiempo = j.tipo_tiempo,
    actualizado_en = now()
FROM public.comisiones_tipo_tiempo_validaciones_os v
WHERE upper(btrim(v.os_numero)) = upper(btrim(j.os_numero))
  AND NOT EXISTS (
    SELECT 1
    FROM public.comisiones_tipo_tiempo_ajustes a
    WHERE a.ajuste_clave = public.comisiones_clave_ajuste_tipo_tiempo(
      j.os_numero,
      j.tecnico_profile_id,
      j.tecnico_codigo,
      j.tecnico_nombre,
      j.fecha_inicio,
      j.hora_inicio,
      j.fecha_fin,
      j.hora_fin
    )
      AND a.ajustado_por IS NOT NULL
  );

NOTIFY pgrst, 'reload schema';

-- Control esperado:
-- * jornadas_sin_ajuste_manual_que_difieren = 0
-- * los ajustes manuales reales permanecen contabilizados aparte.
SELECT
  (SELECT count(*)
   FROM public.comisiones_tipo_tiempo_ajustes a
   WHERE a.ajustado_por IS NOT NULL) AS ajustes_manuales_preservados,
  (SELECT count(*)
   FROM public.comisiones_tipo_tiempo_ajustes a
   WHERE a.ajustado_por IS NULL) AS ajustes_automaticos_restantes,
  (SELECT count(*)
   FROM public.comisiones_jornadas j
   JOIN public.comisiones_tipo_tiempo_validaciones_os v
     ON upper(btrim(v.os_numero)) = upper(btrim(j.os_numero))
   WHERE j.vigente = true) AS jornadas_vigentes_del_corte,
  (SELECT count(*)
   FROM public.comisiones_jornadas j
   JOIN public.comisiones_tipo_tiempo_validaciones_os v
     ON upper(btrim(v.os_numero)) = upper(btrim(j.os_numero))
   WHERE j.vigente = true
     AND j.tipo_tiempo IS DISTINCT FROM v.tipo_tiempo
     AND NOT EXISTS (
       SELECT 1
       FROM public.comisiones_tipo_tiempo_ajustes a
       WHERE a.ajuste_clave = public.comisiones_clave_ajuste_tipo_tiempo(
         j.os_numero,
         j.tecnico_profile_id,
         j.tecnico_codigo,
         j.tecnico_nombre,
         j.fecha_inicio,
         j.hora_inicio,
         j.fecha_fin,
         j.hora_fin
       )
         AND a.ajustado_por IS NOT NULL
     )) AS jornadas_sin_ajuste_manual_que_difieren;
