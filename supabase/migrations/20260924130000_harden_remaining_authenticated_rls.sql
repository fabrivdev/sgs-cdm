-- Cierra policies incondicionales sin asumir que todas las tablas opcionales
-- existen en la instalación. Cada regla se aplica solamente si su tabla está
-- presente; así una base con migraciones parciales no revierte todo el bloque.

BEGIN;

DO $bootstrap$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'auth_user_id'
    ) THEN
      EXECUTE $function$
        CREATE OR REPLACE FUNCTION public.is_active_app_user(_user_id uuid)
        RETURNS boolean
        LANGUAGE sql
        STABLE
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $body$
          SELECT _user_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.profiles p
              WHERE p.activo = true
                AND (p.id = _user_id OR p.auth_user_id = _user_id)
            );
        $body$
      $function$;
    ELSE
      EXECUTE $function$
        CREATE OR REPLACE FUNCTION public.is_active_app_user(_user_id uuid)
        RETURNS boolean
        LANGUAGE sql
        STABLE
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $body$
          SELECT _user_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.profiles p
              WHERE p.activo = true
                AND p.id = _user_id
            );
        $body$
      $function$;
    END IF;

    EXECUTE 'REVOKE ALL ON FUNCTION public.is_active_app_user(uuid) FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_active_app_user(uuid) TO authenticated';
  END IF;
END;
$bootstrap$;

-- Clientes y Trabajos ya tienen policies funcionales más específicas en el
-- historial de migraciones. Antes de quitar aliases abiertos creados desde la
-- consola, se comprueba que cada operación conserve al menos una policy
-- permisiva con alcance real; si falta, la transacción se revierte sin cortar
-- el uso de la aplicación.
DO $preflight$
DECLARE
  required_cmd text;
BEGIN
  IF to_regclass('public.clientes') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'clientes'
         AND cmd = 'SELECT'
         AND permissive = 'PERMISSIVE'
         AND 'authenticated' = ANY (roles)
         AND lower(regexp_replace(coalesce(qual, ''), '[[:space:]]', '', 'g'))
           NOT IN ('', 'true', '(true)', 'auth.uid()isnotnull', '(auth.uid()isnotnull)')
     ) THEN
    RAISE EXCEPTION 'No se quitó clientes_read_authenticated: falta una policy SELECT restringida para authenticated';
  END IF;

  IF to_regclass('public.trabajos') IS NOT NULL THEN
    FOREACH required_cmd IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'trabajos'
          AND cmd = required_cmd
          AND permissive = 'PERMISSIVE'
          AND 'authenticated' = ANY (roles)
          AND lower(regexp_replace(
                coalesce(CASE WHEN required_cmd = 'INSERT' THEN with_check ELSE qual END, ''),
                '[[:space:]]',
                '',
                'g'
              )) NOT IN ('', 'true', '(true)', 'auth.uid()isnotnull', '(auth.uid()isnotnull)')
      ) THEN
        RAISE EXCEPTION 'No se quitaron aliases abiertos de trabajos: falta una policy % restringida para authenticated', required_cmd;
      END IF;
    END LOOP;
  END IF;
END;
$preflight$;

-- Algunas instalaciones productivas conservaron policies creadas desde la
-- consola con otros nombres. Se eliminan únicamente condiciones literalmente
-- incondicionales de las tablas auditadas que realmente existen.
DO $cleanup$
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
        'clientes',
        'dias_no_laborales',
        'maquinaria_marcas_catalogo',
        'modulos',
        'ordenes_servicio_importadas',
        'parque_modelos_alias',
        'parque_modelos_catalogo',
        'profiles',
        'trabajo_historial',
        'trabajos'
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
$cleanup$;

DO $policies$
BEGIN
  IF to_regclass('public.app_configuracion') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users read app settings" ON public.app_configuracion';
    EXECUTE $policy$
      CREATE POLICY "Authenticated users read app settings"
      ON public.app_configuracion
      FOR SELECT TO authenticated
      USING (
        (
          clave = 'meta_horas_mensual_tecnico'
          AND public.has_section_access(auth.uid(), 'servicios.dashboard')
        )
        OR public.has_section_access(auth.uid(), 'admin.parametros')
      )
    $policy$;
  END IF;

  IF to_regclass('public.app_secciones') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated read app sections" ON public.app_secciones';
    EXECUTE $policy$
      CREATE POLICY "Authenticated read app sections"
      ON public.app_secciones
      FOR SELECT TO authenticated
      USING (public.has_module_access(auth.uid(), 'admin'))
    $policy$;
  END IF;

  IF to_regclass('public.dias_no_laborales') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Dias no laborales select authenticated" ON public.dias_no_laborales';
    EXECUTE $policy$
      CREATE POLICY "Dias no laborales select authenticated"
      ON public.dias_no_laborales
      FOR SELECT TO authenticated
      USING (public.has_section_access(auth.uid(), 'servicios.calendario'))
    $policy$;
  END IF;

  IF to_regclass('public.maquinaria_marcas_catalogo') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Catalogo marcas select authenticated" ON public.maquinaria_marcas_catalogo';
    EXECUTE $policy$
      CREATE POLICY "Catalogo marcas select authenticated"
      ON public.maquinaria_marcas_catalogo
      FOR SELECT TO authenticated
      USING (public.has_module_access(auth.uid(), 'parque'))
    $policy$;
  END IF;

  IF to_regclass('public.modulos') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated read modulos" ON public.modulos';
    EXECUTE $policy$
      CREATE POLICY "Authenticated read modulos"
      ON public.modulos
      FOR SELECT TO authenticated
      USING (public.has_module_access(auth.uid(), 'admin'))
    $policy$;
  END IF;

  IF to_regclass('public.ordenes_servicio_importadas') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Ordenes servicio select" ON public.ordenes_servicio_importadas';
    EXECUTE $policy$
      CREATE POLICY "Ordenes servicio select"
      ON public.ordenes_servicio_importadas
      FOR SELECT TO authenticated
      USING (
        public.has_module_access(auth.uid(), 'servicios')
        OR public.has_section_access(auth.uid(), 'admin.importaciones')
      )
    $policy$;
  END IF;

  IF to_regclass('public.parque_modelos_alias') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Catalogo alias select authenticated" ON public.parque_modelos_alias';
    EXECUTE $policy$
      CREATE POLICY "Catalogo alias select authenticated"
      ON public.parque_modelos_alias
      FOR SELECT TO authenticated
      USING (public.has_module_access(auth.uid(), 'parque'))
    $policy$;
  END IF;

  IF to_regclass('public.parque_modelos_catalogo') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Catalogo modelos select authenticated" ON public.parque_modelos_catalogo';
    EXECUTE $policy$
      CREATE POLICY "Catalogo modelos select authenticated"
      ON public.parque_modelos_catalogo
      FOR SELECT TO authenticated
      USING (public.has_module_access(auth.uid(), 'parque'))
    $policy$;
  END IF;

  IF to_regclass('public.profiles') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated can view profiles" ON public.profiles';
    EXECUTE 'DROP POLICY IF EXISTS profiles_read_authenticated ON public.profiles';

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'auth_user_id'
    ) THEN
      EXECUTE $policy$
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
        )
      $policy$;
    ELSE
      EXECUTE $policy$
        CREATE POLICY "Authenticated can view profiles"
        ON public.profiles
        FOR SELECT TO authenticated
        USING (
          public.is_active_app_user(auth.uid())
          AND (
            id = auth.uid()
            OR public.has_module_access(auth.uid(), 'servicios')
            OR public.has_module_access(auth.uid(), 'parque')
            OR public.has_module_access(auth.uid(), 'repuestos')
            OR public.has_module_access(auth.uid(), 'admin')
          )
        )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.trabajo_historial') IS NOT NULL
     AND to_regclass('public.trabajos') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Historial insert" ON public.trabajo_historial';
    EXECUTE $policy$
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
      )
    $policy$;
  END IF;

  IF to_regclass('public.parque_factura_os_cliente') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS parque_factura_os_cliente_select ON public.parque_factura_os_cliente';
    EXECUTE $policy$
      CREATE POLICY parque_factura_os_cliente_select
      ON public.parque_factura_os_cliente
      FOR SELECT TO authenticated
      USING (
        public.has_module_access(auth.uid(), 'parque')
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
      )
    $policy$;
  END IF;
END;
$policies$;

COMMIT;
