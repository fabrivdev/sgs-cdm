ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS desactivado_en timestamptz;

UPDATE public.profiles
SET desactivado_en = actualizado_en
WHERE activo = false
  AND desactivado_en IS NULL;

COMMENT ON COLUMN public.profiles.desactivado_en IS
  'Fecha estable desde la cual el tecnico deja de aportar capacidad operativa.';

CREATE OR REPLACE FUNCTION public.sync_profile_deactivated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.activo = false THEN
      NEW.desactivado_en := COALESCE(NEW.desactivado_en, now());
    ELSE
      NEW.desactivado_en := NULL;
    END IF;
  ELSIF OLD.activo IS DISTINCT FROM NEW.activo THEN
    IF NEW.activo = false THEN
      NEW.desactivado_en := COALESCE(NEW.desactivado_en, now());
    ELSE
      NEW.desactivado_en := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_deactivated_at ON public.profiles;
CREATE TRIGGER trg_profiles_deactivated_at
BEFORE INSERT OR UPDATE OF activo ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_deactivated_at();
