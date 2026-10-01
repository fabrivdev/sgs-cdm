-- Presencia minima de usuarios autenticados.
-- Guarda solo identidad tecnica y timestamps; no captura contenido, rutas, IP ni geolocalizacion.

CREATE TABLE IF NOT EXISTS public.user_presence (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_activity_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  last_heartbeat_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  disconnected_at timestamptz
);

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_presence FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_presence FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.user_presence TO authenticated;
GRANT ALL ON TABLE public.user_presence TO service_role;

DROP POLICY IF EXISTS user_presence_admin_read ON public.user_presence;
CREATE POLICY user_presence_admin_read
ON public.user_presence
FOR SELECT
TO authenticated
USING (
  public.is_active_app_user(auth.uid())
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE OR REPLACE FUNCTION public.touch_user_presence(p_last_activity_at timestamptz DEFAULT statement_timestamp())
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
  v_activity_at timestamptz;
BEGIN
  IF v_user_id IS NULL OR NOT public.is_active_app_user(v_user_id) THEN
    RAISE EXCEPTION 'Usuario autenticado activo requerido' USING ERRCODE = '42501';
  END IF;

  -- El servidor limita el valor recibido: nunca acepta actividad futura ni retrocede el ultimo uso.
  v_activity_at := LEAST(COALESCE(p_last_activity_at, v_now), v_now);

  INSERT INTO public.user_presence (
    user_id,
    last_activity_at,
    last_heartbeat_at,
    disconnected_at
  )
  VALUES (
    v_user_id,
    v_activity_at,
    v_now,
    NULL
  )
  ON CONFLICT (user_id) DO UPDATE
  SET last_activity_at = GREATEST(user_presence.last_activity_at, EXCLUDED.last_activity_at),
      last_heartbeat_at = v_now,
      disconnected_at = NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.disconnect_user_presence()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario autenticado requerido' USING ERRCODE = '42501';
  END IF;

  UPDATE public.user_presence
  SET disconnected_at = statement_timestamp()
  WHERE user_id = v_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.touch_user_presence(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.disconnect_user_presence() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_user_presence(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disconnect_user_presence() TO authenticated;
