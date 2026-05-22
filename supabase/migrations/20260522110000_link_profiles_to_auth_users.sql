ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_auth_user_id_unique_idx
  ON public.profiles (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

UPDATE public.profiles p
SET auth_user_id = p.id
WHERE auth_user_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = p.id
  );

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  v_profile_id := NULLIF(NEW.raw_user_meta_data->>'profile_id', '')::uuid;

  IF v_profile_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE id = v_profile_id) THEN
    UPDATE public.profiles
    SET auth_user_id = NEW.id
    WHERE id = v_profile_id;
  ELSE
    INSERT INTO public.profiles (id, auth_user_id, nombre, sucursal)
    VALUES (
      NEW.id,
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)),
      (NEW.raw_user_meta_data->>'sucursal')::public.sucursal
    );
  END IF;

  RETURN NEW;
END;
$$;
