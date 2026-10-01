-- Ejecutar primero. Solo valida dependencias; no modifica datos ni permisos.
DO $preflight$
BEGIN
  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'Falta auth.users';
  END IF;
  IF to_regprocedure('public.has_role(uuid,public.app_role)') IS NULL THEN
    RAISE EXCEPTION 'Falta public.has_role(uuid, public.app_role)';
  END IF;
  IF to_regprocedure('public.is_active_app_user(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta public.is_active_app_user(uuid)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION 'Falta el rol authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'Falta el rol service_role';
  END IF;
END;
$preflight$;

SELECT 'PRECHECK_OK' AS resultado;
