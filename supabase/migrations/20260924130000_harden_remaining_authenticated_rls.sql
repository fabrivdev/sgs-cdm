-- Cierra las policies que el escaner de seguridad interpreta como acceso
-- irrestricto para cualquier sesion autenticada. La aplicacion conserva sus
-- lecturas mediante permisos reales de modulo/seccion y no por USING (true).

BEGIN;

CREATE OR REPLACE FUNCTION public.is_active_app_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT _user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.activo = true
        AND (p.id = _user_id OR p.auth_user_id = _user_id)
    );
$$;

REVOKE ALL ON FUNCTION public.is_active_app_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_app_user(uuid) TO authenticated;

-- Algunas instalaciones productivas conservaron policies creadas desde la
-- consola con otros nombres. Se eliminan solamente las condiciones literalmente
-- incondicionales de las tablas auditadas; luego se recrean las reglas canónicas.
DO $$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY[
        'app_configuracion',
        'app_secciones',
        'dias_no_laborales',
        'maquinaria_marcas_catalogo',
        'modulos',
        'ordenes_servicio_importadas',
        'parque_modelos_alias',
        'parque_modelos_catalogo',
        'profiles',
        'trabajo_historial'
      ])
      AND (
        lower(regexp_replace(coalesce(qual, ''), '[[:space:]]', '', 'g')) IN ('true', '(true)')
        OR lower(regexp_replace(coalesce(with_check, ''), '[[:space:]]', '', 'g')) IN ('true', '(true)')
      )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "Authenticated users read app settings" ON public.app_configuracion;
CREATE POLICY "Authenticated users read app settings"
ON public.app_configuracion
FOR SELECT TO authenticated
USING (
  (
    clave = 'meta_horas_mensual_tecnico'
    AND public.has_section_access(auth.uid(), 'servicios.dashboard')
  )
  OR public.has_section_access(auth.uid(), 'admin.parametros')
);

DROP POLICY IF EXISTS "Authenticated read app sections" ON public.app_secciones;
CREATE POLICY "Authenticated read app sections"
ON public.app_secciones
FOR SELECT TO authenticated
USING (public.has_module_access(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Dias no laborales select authenticated" ON public.dias_no_laborales;
CREATE POLICY "Dias no laborales select authenticated"
ON public.dias_no_laborales
FOR SELECT TO authenticated
USING (public.has_section_access(auth.uid(), 'servicios.calendario'));

DROP POLICY IF EXISTS "Catalogo marcas select authenticated" ON public.maquinaria_marcas_catalogo;
CREATE POLICY "Catalogo marcas select authenticated"
ON public.maquinaria_marcas_catalogo
FOR SELECT TO authenticated
USING (public.has_module_access(auth.uid(), 'parque'));

DROP POLICY IF EXISTS "Authenticated read modulos" ON public.modulos;
CREATE POLICY "Authenticated read modulos"
ON public.modulos
FOR SELECT TO authenticated
USING (public.has_module_access(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Ordenes servicio select" ON public.ordenes_servicio_importadas;
CREATE POLICY "Ordenes servicio select"
ON public.ordenes_servicio_importadas
FOR SELECT TO authenticated
USING (
  public.has_module_access(auth.uid(), 'servicios')
  OR public.has_section_access(auth.uid(), 'admin.importaciones')
);

DROP POLICY IF EXISTS "Catalogo alias select authenticated" ON public.parque_modelos_alias;
CREATE POLICY "Catalogo alias select authenticated"
ON public.parque_modelos_alias
FOR SELECT TO authenticated
USING (public.has_module_access(auth.uid(), 'parque'));

DROP POLICY IF EXISTS "Catalogo modelos select authenticated" ON public.parque_modelos_catalogo;
CREATE POLICY "Catalogo modelos select authenticated"
ON public.parque_modelos_catalogo
FOR SELECT TO authenticated
USING (public.has_module_access(auth.uid(), 'parque'));

DROP POLICY IF EXISTS "Authenticated can view profiles" ON public.profiles;
DROP POLICY IF EXISTS profiles_read_authenticated ON public.profiles;
CREATE POLICY "Authenticated can view profiles"
ON public.profiles
FOR SELECT TO authenticated
USING (
  public.is_active_app_user(auth.uid())
  AND (
    id = auth.uid()
    OR auth_user_id = auth.uid()
    OR public.has_module_access(auth.uid(), 'servicios')
    OR public.has_module_access(auth.uid(), 'parque')
    OR public.has_module_access(auth.uid(), 'repuestos')
    OR public.has_module_access(auth.uid(), 'admin')
  )
);

DROP POLICY IF EXISTS "Historial insert" ON public.trabajo_historial;
CREATE POLICY "Historial insert"
ON public.trabajo_historial
FOR INSERT TO authenticated
WITH CHECK (
  (
    public.has_module_access(auth.uid(), 'servicios')
    AND EXISTS (
      SELECT 1
      FROM public.trabajos t
      WHERE t.id = trabajo_historial.trabajo_id
    )
  )
  OR public.has_section_access(auth.uid(), 'admin.importaciones')
);

-- Esta tabla ya estaba limitada al modulo Parque, pero el predicado redundante
-- auth.uid() IS NOT NULL tambien es marcado como acceso amplio por el escaner.
DROP POLICY IF EXISTS parque_factura_os_cliente_select ON public.parque_factura_os_cliente;
CREATE POLICY parque_factura_os_cliente_select
ON public.parque_factura_os_cliente
FOR SELECT TO authenticated
USING (
  public.has_module_access(auth.uid(), 'parque')
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
);

COMMIT;
