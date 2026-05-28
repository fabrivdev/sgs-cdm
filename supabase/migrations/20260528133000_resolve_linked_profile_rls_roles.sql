-- Las politicas RLS historicas usan auth.uid(), pero los usuarios nuevos pueden
-- tener sus roles y sucursal asociados al profile.id mediante profiles.auth_user_id.
-- Estas funciones hacen que ambos modelos funcionen igual.

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.role = _role
      AND (
        ur.user_id = _user_id
        OR ur.user_id IN (
          SELECT p.id
          FROM public.profiles p
          WHERE p.auth_user_id = _user_id
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_sucursal(_user_id uuid)
RETURNS public.sucursal
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.sucursal
  FROM public.profiles p
  WHERE p.id = _user_id OR p.auth_user_id = _user_id
  ORDER BY CASE WHEN p.auth_user_id = _user_id THEN 0 ELSE 1 END
  LIMIT 1
$$;

NOTIFY pgrst, 'reload schema';
