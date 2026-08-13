-- Hotfix para proyectos donde la funcion optimizada ya fue aplicada.
-- Supabase safeupdate bloquea DELETE sin WHERE. Las claves primarias son
-- NOT NULL, por lo que estas condiciones vacian las tablas sin desactivar
-- la proteccion global de la base de datos.

DO $$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.repuestos_refrescar_historial_unificado()'::regprocedure
  )
  INTO v_definition;

  v_definition := replace(
    v_definition,
    'DELETE FROM public.repuestos_ventas_vinculacion;',
    E'DELETE FROM public.repuestos_ventas_vinculacion\n  WHERE linea_id IS NOT NULL;'
  );

  v_definition := replace(
    v_definition,
    'DELETE FROM public.repuestos_demanda_mensual;',
    E'DELETE FROM public.repuestos_demanda_mensual\n  WHERE producto_codigo IS NOT NULL;'
  );

  EXECUTE v_definition;
END;
$$;

REVOKE ALL ON FUNCTION public.repuestos_refrescar_historial_unificado() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repuestos_refrescar_historial_unificado() TO authenticated;

NOTIFY pgrst, 'reload schema';
