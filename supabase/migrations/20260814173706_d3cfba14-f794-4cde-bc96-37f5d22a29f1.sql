CREATE OR REPLACE FUNCTION public.servicios_listar_tecnicos_activos()
 RETURNS TABLE(id uuid, nombre text, sucursal sucursal)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    p.id,
    p.nombre,
    p.sucursal
  FROM public.profiles p
  WHERE public.has_module_access(auth.uid(), 'servicios')
    AND p.activo IS DISTINCT FROM false
    AND lower(trim(p.nombre)) NOT LIKE '%pasante%'
    -- Nunca listar perfiles con rol administrativo.
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id IN (p.id, p.auth_user_id)
        AND ur.role IN ('admin'::public.app_role, 'jefatura'::public.app_role, 'gerencia'::public.app_role)
    )
    AND (
      -- Integrante operativo sin usuario de acceso.
      p.auth_user_id IS NULL

      OR (
        -- Usuario con nivel Operativo.
        EXISTS (
          SELECT 1
          FROM public.user_roles ur
          WHERE ur.user_id IN (p.id, p.auth_user_id)
            AND ur.role = 'operativo'::public.app_role
        )

        -- Y con acceso explícito al módulo Servicios.
        AND EXISTS (
          SELECT 1
          FROM public.user_modulo_acceso uma
          WHERE uma.user_id IN (p.id, p.auth_user_id)
            AND uma.modulo_id = 'servicios'
        )
      )
    )
  ORDER BY p.nombre;
$function$;