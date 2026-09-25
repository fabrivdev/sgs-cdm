-- Aplicación manual en Lovable Cloud. No modifica órdenes, facturas ni roles.
BEGIN;

DO $section$
DECLARE
  nueva boolean;
BEGIN
  -- La existencia de la sección es el checkpoint: repetir no repone accesos revocados.
  SELECT NOT EXISTS (
    SELECT 1 FROM public.app_secciones WHERE id = 'servicios.ordenes'
  ) INTO nueva;

  INSERT INTO public.app_secciones (id, modulo_id, nombre, orden, activo)
  VALUES ('servicios.ordenes', 'servicios', 'Órdenes de servicio', 40, true)
  ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, orden = EXCLUDED.orden;

  IF nueva THEN
    INSERT INTO public.user_seccion_acceso (user_id, seccion_id, otorgado_en, otorgado_por)
    SELECT user_id, 'servicios.ordenes', otorgado_en, otorgado_por
    FROM public.user_seccion_acceso WHERE seccion_id = 'servicios.dashboard'
    ON CONFLICT (user_id, seccion_id) DO NOTHING;
  END IF;

  -- Conserva los grants anteriores para trazabilidad. La nueva ruta mantiene
  -- los mismos controles de módulo y rol (admin/gerencia/superadmin).
  UPDATE public.app_secciones SET activo = false WHERE id = 'servicios.dashboard';

  IF to_regclass('public.app_configuracion') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users read app settings" ON public.app_configuracion';
    EXECUTE $policy$
      CREATE POLICY "Authenticated users read app settings"
      ON public.app_configuracion FOR SELECT TO authenticated
      USING (
        (clave = 'meta_horas_mensual_tecnico'
         AND public.has_section_access(auth.uid(), 'servicios.ordenes'))
        OR public.has_section_access(auth.uid(), 'admin.parametros')
      )
    $policy$;
  END IF;
END;
$section$;

COMMIT;
