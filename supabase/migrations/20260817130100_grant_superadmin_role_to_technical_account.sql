-- Paso 1b de 2. Requiere que 20260817130000_add_superadmin_role_value.sql
-- ya haya sido aplicada y comiteada (archivo separado a proposito, ver su
-- comentario).
--
-- Otorga el rol 'superadmin' a la cuenta tecnica de emergencia, via grant
-- normal y auditable en user_roles -- igual criterio que el backfill de
-- user_modulo_acceso en 20260812130000_enforce_role_module_matrix.sql:30-36
-- ("la cuenta tecnica conserva acceso mediante grants normales y
-- auditables, no mediante un bypass oculto"). Es un backfill one-shot por
-- email, igual que aquel: el CHEQUEO en runtime (paso 3, frontend, en una
-- tanda separada) va a leer el rol desde la base, no el email.
--
-- Este archivo tampoco cambia ningun comportamiento observable todavia:
-- otorga el rol, pero ningun codigo lo consulta aun.

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'superadmin'::public.app_role
FROM auth.users u
WHERE lower(coalesce(u.email, '')) = 'fabrizio.vega@cdm.com.py'
ON CONFLICT (user_id, role) DO NOTHING;
