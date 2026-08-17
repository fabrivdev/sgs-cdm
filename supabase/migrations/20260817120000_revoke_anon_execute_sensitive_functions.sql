-- Auditoria de seguridad (2026-08-17): 4 funciones SECURITY DEFINER quedaron
-- con EXECUTE otorgado a PUBLIC/anon (confirmado en produccion via
-- information_schema.routine_privileges) y sin chequeo interno de auth.uid().
-- Dos son de solo lectura (has_role, get_user_sucursal) y dos son de escritura
-- (recalcular_estado_trabajo, repuestos_preparar_planificacion_neutral), lo que
-- permitia a un caller sin sesion, usando solo la anon key, invocarlas
-- directo via PostgREST RPC y mutar datos o enumerar roles/sucursales
-- bypaseando RLS por completo.
--
-- Verificado antes de este cambio que ninguna de las 4 depende de acceso
-- anon/PUBLIC: las llamadas directas desde el frontend (recalcular_estado_trabajo,
-- has_role, get_user_sucursal vía policies RLS) siempre corren con sesion
-- autenticada, y los unicos llamadores internos (programar_jornada,
-- repuestos_preparar_planificacion_corrida_trigger) son a su vez SECURITY
-- DEFINER, por lo que ejecutan como el dueno de la funcion y no necesitan el
-- grant del caller externo.
--
-- Este cambio SOLO ajusta permisos de ejecucion (REVOKE/GRANT) y agrega un
-- guard de auth.uid() en las dos funciones de escritura, como defensa en
-- profundidad ademas del revoke. No toca ninguna otra logica de negocio.

-- 1) Cerrar EXECUTE a PUBLIC/anon en las 4 funciones, dejando solo authenticated.

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

REVOKE ALL ON FUNCTION public.get_user_sucursal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_sucursal(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.recalcular_estado_trabajo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalcular_estado_trabajo(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.repuestos_preparar_planificacion_neutral(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repuestos_preparar_planificacion_neutral(text) TO authenticated;

-- 2) Defensa en profundidad: agregar guard de auth.uid() en las dos funciones
--    de escritura, igual patron que ya usa programar_jornada. Se preserva el
--    resto de la logica de cada funcion sin cambios.

CREATE OR REPLACE FUNCTION public.recalcular_estado_trabajo(p_trabajo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_legacy_servicio_id uuid;
  v_estado_actual public.estado_trabajo;
  v_motivo_bloqueo text;
  v_realizadas int := 0;
  v_pendientes int := 0;
  v_pendientes_vigentes int := 0;
  v_nuevo public.estado_trabajo;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT legacy_servicio_id, estado_general, motivo_bloqueo
  INTO v_legacy_servicio_id, v_estado_actual, v_motivo_bloqueo
  FROM public.trabajos
  WHERE id = p_trabajo_id;

  IF v_estado_actual IN ('bloqueado'::public.estado_trabajo, 'en_pausa'::public.estado_trabajo)
     OR NULLIF(btrim(COALESCE(v_motivo_bloqueo, '')), '') IS NOT NULL THEN
    RETURN;
  END IF;

  IF v_legacy_servicio_id IS NULL THEN
    v_nuevo := 'pendiente'::public.estado_trabajo;
  ELSE
    SELECT
      COUNT(*) FILTER (WHERE estado = 'Completado'),
      COUNT(*) FILTER (WHERE estado = 'Pendiente'),
      COUNT(*) FILTER (
        WHERE estado = 'Pendiente'
          AND fecha >= (CURRENT_DATE - INTERVAL '7 days')
      )
    INTO v_realizadas, v_pendientes, v_pendientes_vigentes
    FROM public.servicio_jornadas
    WHERE servicio_id = v_legacy_servicio_id;

    IF v_realizadas > 0 AND v_pendientes = 0 THEN
      v_nuevo := 'completado'::public.estado_trabajo;
    ELSIF v_realizadas > 0 AND v_pendientes > 0 THEN
      v_nuevo := 'iniciado'::public.estado_trabajo;
    ELSIF v_pendientes_vigentes > 0 THEN
      v_nuevo := 'programado'::public.estado_trabajo;
    ELSE
      v_nuevo := 'pendiente'::public.estado_trabajo;
    END IF;
  END IF;

  UPDATE public.trabajos
  SET estado_general = v_nuevo,
      cerrado_en = CASE WHEN v_nuevo = 'completado' THEN COALESCE(cerrado_en, now()) ELSE NULL END
  WHERE id = p_trabajo_id
    AND estado_general IS DISTINCT FROM v_nuevo;
END;
$function$;

CREATE OR REPLACE FUNCTION public.repuestos_preparar_planificacion_neutral(p_marca text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  INSERT INTO public.repuestos_articulo_planificacion (
    producto_codigo, criticidad, origen, stock_minimo_estrategico,
    criticidad_fuente, criticidad_confianza, actualizado_por
  )
  SELECT
    p.codigo_interno, 'E', 'ALEMANIA', 0, 'MANUAL', 1, auth.uid()
  FROM public.productos p
  WHERE p.activo
    AND p.codigo_interno ILIKE 'REP%'
    AND p.marca::text = upper(trim(p_marca))
  ON CONFLICT (producto_codigo) DO UPDATE SET
    criticidad = 'E',
    criticidad_fuente = 'MANUAL',
    criticidad_confianza = 1,
    actualizado_en = now();
END;
$$;

-- Re-otorgar EXECUTE a authenticated despues del CREATE OR REPLACE, por si el
-- driver de Postgres reinicia los privilegios al recrear la funcion (no
-- deberia con CREATE OR REPLACE, pero es gratis y evita sorpresas).
GRANT EXECUTE ON FUNCTION public.recalcular_estado_trabajo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_preparar_planificacion_neutral(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
