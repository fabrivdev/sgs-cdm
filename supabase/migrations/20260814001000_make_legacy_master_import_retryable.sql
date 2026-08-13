-- Permite reintentar inmediatamente la carga unica del maestro anterior
-- cuando el navegador, la red o un lote RPC interrumpieron el intento previo.

-- Desbloqueo inmediato del intento que motivo este parche. Las filas parciales
-- quedan auditables bajo una carga FALLIDA y no participan del maestro activo.
UPDATE public.repuestos_maestro_legacy_cargas
SET estado = 'FALLIDO'
WHERE estado = 'PROCESANDO';

CREATE OR REPLACE FUNCTION public.repuestos_iniciar_maestro_legacy(p_archivo_nombre text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede cargar el maestro anterior'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.repuestos_maestro_legacy_cargas
    WHERE estado = 'COMPLETADO'
  ) THEN
    RAISE EXCEPTION 'El maestro anterior ya fue cargado. Esta operacion se realiza una sola vez.';
  END IF;

  UPDATE public.repuestos_maestro_legacy_cargas
  SET estado = 'FALLIDO'
  WHERE estado = 'PROCESANDO'
    AND creado_por IS NOT DISTINCT FROM auth.uid();

  IF EXISTS (
    SELECT 1 FROM public.repuestos_maestro_legacy_cargas
    WHERE estado = 'PROCESANDO'
  ) THEN
    RAISE EXCEPTION 'Existe una carga del maestro anterior en proceso iniciada por otro usuario';
  END IF;

  INSERT INTO public.repuestos_maestro_legacy_cargas(archivo_nombre, creado_por)
  VALUES (coalesce(nullif(trim(p_archivo_nombre), ''), 'Lista Mercadoria.xls'), auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.repuestos_iniciar_maestro_legacy(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repuestos_iniciar_maestro_legacy(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
