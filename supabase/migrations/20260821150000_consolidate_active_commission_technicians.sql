-- Una sola definicion de integrante activo de Servicios. Se usa tanto para
-- armar la nomina como para impedir que una persona desvinculada vuelva a
-- entrar accidentalmente en una liquidacion de comisiones.
CREATE OR REPLACE FUNCTION public.servicios_es_tecnico_activo(
  p_profile_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_profile_id
      AND p.activo IS DISTINCT FROM false
      AND lower(trim(p.nombre)) NOT LIKE '%pasante%'
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id IN (p.id, p.auth_user_id)
          AND ur.role IN (
            'admin'::public.app_role,
            'superadmin'::public.app_role,
            'jefatura'::public.app_role,
            'gerencia'::public.app_role
          )
      )
      AND (
        p.auth_user_id IS NULL
        OR (
          EXISTS (
            SELECT 1
            FROM public.user_roles ur
            WHERE ur.user_id IN (p.id, p.auth_user_id)
              AND ur.role = 'operativo'::public.app_role
          )
          AND EXISTS (
            SELECT 1
            FROM public.user_modulo_acceso uma
            WHERE uma.user_id IN (p.id, p.auth_user_id)
              AND uma.modulo_id = 'servicios'
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.servicios_es_tecnico_activo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.servicios_es_tecnico_activo(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.servicios_listar_tecnicos_activos()
RETURNS TABLE (
  id uuid,
  nombre text,
  sucursal public.sucursal
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.nombre, p.sucursal
  FROM public.profiles p
  WHERE public.has_module_access(auth.uid(), 'servicios')
    AND public.servicios_es_tecnico_activo(p.id)
  ORDER BY p.nombre;
$$;

REVOKE ALL ON FUNCTION public.servicios_listar_tecnicos_activos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.servicios_listar_tecnicos_activos() TO authenticated;

-- Las jornadas ya pagadas son evidencia historica y no se modifican. Las no
-- pagadas de personas que hoy estan fuera de nomina quedan solo para auditoria.
UPDATE public.comisiones_jornadas j
SET estado_validacion = 'REVISAR',
    horas_validas = NULL,
    validado_por = NULL,
    validado_en = NULL,
    motivos_validacion = CASE
      WHEN 'TECNICO_FUERA_DE_NOMINA_ACTIVA' = ANY(j.motivos_validacion)
        THEN j.motivos_validacion
      ELSE array_append(j.motivos_validacion, 'TECNICO_FUERA_DE_NOMINA_ACTIVA')
    END,
    actualizado_en = now()
WHERE NOT public.servicios_es_tecnico_activo(j.tecnico_profile_id)
  AND NOT EXISTS (
    SELECT 1
    FROM public.comisiones_liquidacion_detalle d
    WHERE d.jornada_id = j.id
  );

-- Defensa final: aun si alguien intenta insertar un pago fuera de la pantalla,
-- la base rechaza jornadas cuyo tecnico ya no pertenece a la nomina activa.
CREATE OR REPLACE FUNCTION public.comisiones_exigir_tecnico_activo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tecnico_profile_id uuid;
BEGIN
  SELECT j.tecnico_profile_id
  INTO v_tecnico_profile_id
  FROM public.comisiones_jornadas j
  WHERE j.id = NEW.jornada_id;

  IF NOT public.servicios_es_tecnico_activo(v_tecnico_profile_id) THEN
    RAISE EXCEPTION 'La jornada pertenece a un tecnico fuera de la nomina activa'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comisiones_detalle_tecnico_activo_trigger
  ON public.comisiones_liquidacion_detalle;
CREATE TRIGGER comisiones_detalle_tecnico_activo_trigger
  BEFORE INSERT OR UPDATE OF jornada_id
  ON public.comisiones_liquidacion_detalle
  FOR EACH ROW
  EXECUTE FUNCTION public.comisiones_exigir_tecnico_activo();

NOTIFY pgrst, 'reload schema';
