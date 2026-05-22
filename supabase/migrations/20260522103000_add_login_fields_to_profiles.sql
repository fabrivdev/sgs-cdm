ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS login_mode text NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS has_login_access boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_login_mode_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_login_mode_check
  CHECK (login_mode IN ('email', 'username'));

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique_idx
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

UPDATE public.profiles
SET
  has_login_access = COALESCE(has_login_access, true),
  must_change_password = COALESCE(must_change_password, false),
  login_mode = CASE
    WHEN username IS NOT NULL AND btrim(username) <> '' THEN 'username'
    ELSE 'email'
  END;
