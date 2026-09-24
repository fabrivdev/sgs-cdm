-- Producción conservó aliases abiertos de Trabajos, pero no una policy INSERT
-- restringida. Primero restablece el alcance funcional y después elimina las
-- policies incondicionales detectadas por el escáner.

BEGIN;

DO $trabajos_policies$
BEGIN
  IF to_regclass('public.trabajos') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS trabajos_select_scoped ON public.trabajos';

    IF to_regclass('public.programaciones') IS NOT NULL THEN
      EXECUTE $policy$
        CREATE POLICY trabajos_select_scoped
        ON public.trabajos
        FOR SELECT TO authenticated
        USING (
          public.has_module_access(auth.uid(), 'servicios')
          AND (
            public.has_role(auth.uid(), 'superadmin'::public.app_role)
            OR public.has_role(auth.uid(), 'admin'::public.app_role)
            OR public.has_role(auth.uid(), 'gerencia'::public.app_role)
            OR (
              public.has_role(auth.uid(), 'jefatura'::public.app_role)
              AND sucursal = public.get_user_sucursal(auth.uid())
            )
            OR responsable_principal_id = auth.uid()
            OR EXISTS (
              SELECT 1
              FROM public.programaciones p
              WHERE p.trabajo_id = trabajos.id
                AND (
                  p.tecnico_principal_id = auth.uid()
                  OR auth.uid() = ANY (p.auxiliares)
                )
            )
          )
        )
      $policy$;
    ELSE
      EXECUTE $policy$
        CREATE POLICY trabajos_select_scoped
        ON public.trabajos
        FOR SELECT TO authenticated
        USING (
          public.has_module_access(auth.uid(), 'servicios')
          AND (
            public.has_role(auth.uid(), 'superadmin'::public.app_role)
            OR public.has_role(auth.uid(), 'admin'::public.app_role)
            OR public.has_role(auth.uid(), 'gerencia'::public.app_role)
            OR (
              public.has_role(auth.uid(), 'jefatura'::public.app_role)
              AND sucursal = public.get_user_sucursal(auth.uid())
            )
            OR responsable_principal_id = auth.uid()
          )
        )
      $policy$;
    END IF;

    EXECUTE 'DROP POLICY IF EXISTS trabajos_insert_scoped ON public.trabajos';
    EXECUTE $policy$
      CREATE POLICY trabajos_insert_scoped
      ON public.trabajos
      FOR INSERT TO authenticated
      WITH CHECK (
        public.has_module_access(auth.uid(), 'servicios')
        AND (
          public.has_role(auth.uid(), 'superadmin'::public.app_role)
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
          OR (
            public.has_role(auth.uid(), 'jefatura'::public.app_role)
            AND sucursal = public.get_user_sucursal(auth.uid())
          )
        )
      )
    $policy$;

    EXECUTE 'DROP POLICY IF EXISTS trabajos_update_scoped ON public.trabajos';
    EXECUTE $policy$
      CREATE POLICY trabajos_update_scoped
      ON public.trabajos
      FOR UPDATE TO authenticated
      USING (
        public.has_module_access(auth.uid(), 'servicios')
        AND (
          public.has_role(auth.uid(), 'superadmin'::public.app_role)
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
          OR (
            public.has_role(auth.uid(), 'jefatura'::public.app_role)
            AND sucursal = public.get_user_sucursal(auth.uid())
          )
          OR responsable_principal_id = auth.uid()
        )
      )
      WITH CHECK (
        public.has_module_access(auth.uid(), 'servicios')
        AND (
          public.has_role(auth.uid(), 'superadmin'::public.app_role)
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
          OR (
            public.has_role(auth.uid(), 'jefatura'::public.app_role)
            AND sucursal = public.get_user_sucursal(auth.uid())
          )
          OR responsable_principal_id = auth.uid()
        )
      )
    $policy$;

    EXECUTE 'DROP POLICY IF EXISTS trabajos_delete_scoped ON public.trabajos';
    EXECUTE $policy$
      CREATE POLICY trabajos_delete_scoped
      ON public.trabajos
      FOR DELETE TO authenticated
      USING (
        public.has_module_access(auth.uid(), 'servicios')
        AND (
          public.has_role(auth.uid(), 'superadmin'::public.app_role)
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
          OR (
            public.has_role(auth.uid(), 'jefatura'::public.app_role)
            AND sucursal = public.get_user_sucursal(auth.uid())
          )
        )
      )
    $policy$;
  END IF;
END;
$trabajos_policies$;

DO $preflight_clientes$
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
    RAISE EXCEPTION 'No se quitaron aliases abiertos: falta una policy SELECT restringida para clientes';
  END IF;
END;
$preflight_clientes$;

DO $cleanup$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY['clientes', 'trabajos'])
      AND (
        lower(regexp_replace(coalesce(qual, ''), '[[:space:]]', '', 'g'))
          IN ('true', '(true)', 'auth.uid()isnotnull', '(auth.uid()isnotnull)')
        OR lower(regexp_replace(coalesce(with_check, ''), '[[:space:]]', '', 'g'))
          IN ('true', '(true)', 'auth.uid()isnotnull', '(auth.uid()isnotnull)')
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

COMMIT;
