CREATE SCHEMA auth;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END;
$roles$;

CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

CREATE TYPE public.app_role AS ENUM ('superadmin', 'admin', 'gerencia', 'jefatura', 'operativo');
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  auth_user_id uuid,
  activo boolean NOT NULL DEFAULT true
);
CREATE TABLE public.user_roles (user_id uuid NOT NULL, role public.app_role NOT NULL);

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND (role = _role OR (_role = 'admin' AND role = 'superadmin'))
  )
$$;

CREATE FUNCTION public.is_active_app_user(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE activo AND (id = _user_id OR auth_user_id = _user_id)
  )
$$;

INSERT INTO auth.users (id) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
INSERT INTO public.profiles (id, auth_user_id, activo) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', NULL, true),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', NULL, true),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', NULL, false);
INSERT INTO public.user_roles (user_id, role) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'admin');

GRANT USAGE ON SCHEMA public TO authenticated;

\ir ../docs/sql/user-presence/00_preflight.sql
\ir ../docs/sql/user-presence/01_migration.sql
\ir ../docs/sql/user-presence/02_verification.sql

SET ROLE authenticated;
SET "request.jwt.claim.sub" = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
SELECT public.touch_user_presence(statement_timestamp());
DO $test_user_cannot_read$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_presence) THEN
    RAISE EXCEPTION 'Un usuario normal pudo leer presencia';
  END IF;
END;
$test_user_cannot_read$;
SELECT public.disconnect_user_presence();
RESET ROLE;

SET ROLE authenticated;
SET "request.jwt.claim.sub" = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SELECT public.touch_user_presence(statement_timestamp());
DO $test_admin_read$
BEGIN
  IF (SELECT count(*) FROM public.user_presence) <> 2 THEN
    RAISE EXCEPTION 'El admin no ve las dos presencias';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_presence
    WHERE user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      AND disconnected_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Logout no marco desconexion';
  END IF;
END;
$test_admin_read$;
RESET ROLE;

SELECT 'RLS_BEHAVIOR_OK' AS resultado;
