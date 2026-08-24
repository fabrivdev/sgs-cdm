-- Permite corregir el tipo de tiempo de una jornada desde Comisiones sin que
-- una reimportacion posterior vuelva a imponer el valor del archivo.

ALTER TABLE public.comisiones_jornadas
  ADD COLUMN IF NOT EXISTS tipo_tiempo_importado text,
  ADD COLUMN IF NOT EXISTS tipo_tiempo_ajustado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tipo_tiempo_ajustado_por uuid,
  ADD COLUMN IF NOT EXISTS tipo_tiempo_ajustado_en timestamptz;

UPDATE public.comisiones_jornadas
SET tipo_tiempo_importado = tipo_tiempo
WHERE tipo_tiempo_importado IS NULL;

ALTER TABLE public.comisiones_jornadas
  ALTER COLUMN tipo_tiempo_importado SET DEFAULT 'Desconocido',
  ALTER COLUMN tipo_tiempo_importado SET NOT NULL;

ALTER TABLE public.comisiones_jornadas
  DROP CONSTRAINT IF EXISTS comisiones_jornadas_tipo_tiempo_importado_check;

ALTER TABLE public.comisiones_jornadas
  ADD CONSTRAINT comisiones_jornadas_tipo_tiempo_importado_check
  CHECK (tipo_tiempo_importado IN ('Cliente', 'Garantia', 'Interno', 'Desconocido'));

COMMENT ON COLUMN public.comisiones_jornadas.tipo_tiempo_importado IS
  'Valor recibido del archivo. Se actualiza al reimportar aun cuando exista una correccion manual.';
COMMENT ON COLUMN public.comisiones_jornadas.tipo_tiempo_ajustado IS
  'Indica que tipo_tiempo fue corregido por un administrador y debe prevalecer sobre la importacion.';

CREATE OR REPLACE FUNCTION public.comisiones_actualizar_tipo_tiempo(
  p_jornada_id uuid,
  p_tipo_tiempo text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tipo text := initcap(lower(btrim(coalesce(p_tipo_tiempo, ''))));
  v_resultado text;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (
       public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
     ) THEN
    RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501';
  END IF;

  IF v_tipo = 'Garantia' THEN
    v_tipo := 'Garantia';
  ELSIF v_tipo NOT IN ('Cliente', 'Interno', 'Desconocido') THEN
    RAISE EXCEPTION 'Tipo de tiempo invalido' USING ERRCODE = '22023';
  END IF;

  UPDATE public.comisiones_jornadas
  SET tipo_tiempo = v_tipo,
      tipo_tiempo_ajustado = (v_tipo IS DISTINCT FROM tipo_tiempo_importado),
      tipo_tiempo_ajustado_por = CASE
        WHEN v_tipo IS DISTINCT FROM tipo_tiempo_importado THEN auth.uid()
        ELSE NULL
      END,
      tipo_tiempo_ajustado_en = CASE
        WHEN v_tipo IS DISTINCT FROM tipo_tiempo_importado THEN now()
        ELSE NULL
      END,
      actualizado_en = now(),
      raw_data = raw_data || jsonb_build_object(
        'tipo_tiempo_ultima_edicion', jsonb_build_object(
          'valor', v_tipo,
          'valor_importado', tipo_tiempo_importado,
          'manual', v_tipo IS DISTINCT FROM tipo_tiempo_importado,
          'usuario_id', auth.uid(),
          'fecha', now()
        )
      )
  WHERE id = p_jornada_id
  RETURNING tipo_tiempo INTO v_resultado;

  IF v_resultado IS NULL THEN
    RAISE EXCEPTION 'Jornada no encontrada' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.comisiones_actualizar_tipo_tiempo(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comisiones_actualizar_tipo_tiempo(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
