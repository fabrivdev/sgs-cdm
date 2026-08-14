-- Fuente unica de tecnicos seleccionables en Servicios.
-- Los perfiles sin acceso siguen representando integrantes operativos.
-- Un perfil con usuario solo es tecnico cuando su nivel es Operativo y tiene
-- acceso explicito al modulo Servicios. Admin, Gerencia, Jefatura y usuarios
-- de otros modulos no deben aparecer en planificacion ni indicadores.

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
    AND p.activo IS DISTINCT FROM false
    AND lower(trim(p.nombre)) NOT LIKE '%pasante%'
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
  ORDER BY p.nombre;
$$;

COMMENT ON FUNCTION public.servicios_listar_tecnicos_activos() IS
  'Nomina unica de tecnicos asignables: equipo sin acceso o usuarios Operativos con modulo Servicios.';

REVOKE ALL ON FUNCTION public.servicios_listar_tecnicos_activos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.servicios_listar_tecnicos_activos() TO authenticated;

NOTIFY pgrst, 'reload schema';
