BEGIN;

-- Mantiene cerrada la escritura directa por RLS. Esta RPC es el único camino
-- para que un administrador asigne secciones y valida también al destinatario.
CREATE OR REPLACE FUNCTION public.admin_actualizar_acceso_seccion(
  p_user_id uuid,
  p_seccion_id text,
  p_activo boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_modulo_id text;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Solo un administrador puede modificar accesos'
      USING ERRCODE = '42501';
  END IF;

  IF public.has_role(p_user_id, 'superadmin'::public.app_role) THEN
    RAISE EXCEPTION 'Los accesos del superadministrador están protegidos'
      USING ERRCODE = '42501';
  END IF;

  SELECT s.modulo_id INTO v_modulo_id
  FROM public.app_secciones s
  WHERE s.id = p_seccion_id AND s.activo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La sección no existe o está inactiva' USING ERRCODE = '22023';
  END IF;

  IF p_activo THEN
    INSERT INTO public.user_seccion_acceso (user_id, seccion_id)
    VALUES (p_user_id, p_seccion_id)
    ON CONFLICT (user_id, seccion_id) DO NOTHING;

    IF v_modulo_id IN ('servicios', 'parque', 'repuestos') THEN
      INSERT INTO public.user_modulo_acceso (user_id, modulo_id)
      VALUES (p_user_id, v_modulo_id)
      ON CONFLICT (user_id, modulo_id) DO NOTHING;
    END IF;
  ELSE
    DELETE FROM public.user_seccion_acceso
    WHERE user_id = p_user_id AND seccion_id = p_seccion_id;

    IF v_modulo_id IN ('servicios', 'parque', 'repuestos')
       AND NOT EXISTS (
         SELECT 1
         FROM public.user_seccion_acceso usa
         JOIN public.app_secciones s ON s.id = usa.seccion_id
         WHERE usa.user_id = p_user_id
           AND s.modulo_id = v_modulo_id
           AND s.activo
       ) THEN
      DELETE FROM public.user_modulo_acceso
      WHERE user_id = p_user_id AND modulo_id::text = v_modulo_id;
    END IF;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_actualizar_acceso_seccion(uuid, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_actualizar_acceso_seccion(uuid, text, boolean)
  TO authenticated;

-- Las páginas de Ventas se crearon después del backfill inicial. Se habilitan
-- únicamente para quienes ya tenían acceso al módulo correspondiente.
INSERT INTO public.user_seccion_acceso (user_id, seccion_id)
SELECT DISTINCT uma.user_id, s.id
FROM public.user_modulo_acceso uma
JOIN public.app_secciones s ON s.modulo_id = uma.modulo_id
WHERE s.id IN ('servicios.ventas', 'parque.ventas', 'repuestos.ventas')
  AND s.activo
ON CONFLICT (user_id, seccion_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
