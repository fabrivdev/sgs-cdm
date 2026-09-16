BEGIN;
-- Los cruces de la fuente usan id::text; estos índices permiten búsquedas
-- puntuales sin recorrer el catálogo completo por cada línea de la fuente.
CREATE INDEX IF NOT EXISTS dashboard_lineas_id_text_idx
  ON public.facturacion_lineas_importadas ((id::text));
CREATE INDEX IF NOT EXISTS dashboard_legacy_id_text_idx
  ON public.facturacion ((id::text));

-- Un valor JSON escalar: PostgREST no lo recorta a 1.000 registros ni necesita
-- ejecutar de nuevo el reporte para cada página. Fuente monetaria sin cambios.
CREATE OR REPLACE FUNCTION public.dashboard_facturacion_lote_v1(p_desde date, p_hasta date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp SET statement_timeout='25s' AS $$
DECLARE resultado jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(),'servicios.dashboard') THEN
    RAISE EXCEPTION 'No tenés acceso al Dashboard' USING errcode='42501';
  END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_desde>p_hasta
    OR extract(year FROM p_desde)<>extract(year FROM p_hasta) THEN
    RAISE EXCEPTION 'Seleccioná un rango válido dentro de un año.' USING errcode='22023';
  END IF;
  SELECT jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb),'count',count(*))
    INTO resultado FROM public.dashboard_facturacion_fuente_v1(p_desde,p_hasta) m;
  RETURN resultado;
END;
$$;
REVOKE ALL ON FUNCTION public.dashboard_facturacion_lote_v1(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dashboard_facturacion_lote_v1(date,date) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
