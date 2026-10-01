-- Ejecutar despues de 01_migration.sql. Solo verifica estructura y permisos.
DO $verification$
DECLARE
  v_authenticated_privileges text[];
BEGIN
  IF to_regclass('public.user_presence') IS NULL THEN
    RAISE EXCEPTION 'No existe public.user_presence';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'user_presence'
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS/FORCE RLS no esta habilitado';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_presence'
      AND policyname = 'user_presence_admin_read'
      AND cmd = 'SELECT' AND 'authenticated' = ANY(roles)
  ) THEN
    RAISE EXCEPTION 'Falta la politica de lectura admin';
  END IF;
  IF to_regprocedure('public.touch_user_presence(timestamp with time zone)') IS NULL
     OR to_regprocedure('public.disconnect_user_presence()') IS NULL THEN
    RAISE EXCEPTION 'Faltan funciones de presencia';
  END IF;

  SELECT array_agg(privilege_type ORDER BY privilege_type)
  INTO v_authenticated_privileges
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'user_presence'
    AND grantee = 'authenticated';

  IF v_authenticated_privileges IS DISTINCT FROM ARRAY['SELECT']::text[] THEN
    RAISE EXCEPTION 'authenticated tiene privilegios inesperados: %', v_authenticated_privileges;
  END IF;
END;
$verification$;

SELECT
  'VERIFY_OK' AS resultado,
  'authenticated solo SELECT bajo RLS admin; escrituras unicamente por RPC ligada a auth.uid()' AS alcance;
