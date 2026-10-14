-- Una factura del proveedor puede cubrir cualquier subconjunto de un lote.
-- Solo se asignan automaticamente documentos historicos de lineas con una unidad.
DROP INDEX IF EXISTS public.maquinaria_documentos_importacion_unico_idx;
CREATE UNIQUE INDEX IF NOT EXISTS maquinaria_documentos_oc_unico_idx
  ON public.maquinaria_documentos (importacion_linea_id)
  WHERE importacion_linea_id IS NOT NULL AND tipo = 'OC';

CREATE TABLE IF NOT EXISTS public.maquinaria_documentos_factura_importacion_unidades (
  documento_id uuid NOT NULL REFERENCES public.maquinaria_documentos(id) ON DELETE CASCADE,
  importacion_unidad_id uuid NOT NULL REFERENCES public.maquinaria_importacion_unidades(id) ON DELETE CASCADE,
  creado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (documento_id, importacion_unidad_id),
  UNIQUE (importacion_unidad_id)
);
CREATE INDEX IF NOT EXISTS maquinaria_doc_factura_importacion_unidad_idx
  ON public.maquinaria_documentos_factura_importacion_unidades (importacion_unidad_id);

ALTER TABLE public.maquinaria_documentos_factura_importacion_unidades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura facturas proveedor por unidad" ON public.maquinaria_documentos_factura_importacion_unidades;
CREATE POLICY "Lectura facturas proveedor por unidad"
  ON public.maquinaria_documentos_factura_importacion_unidades FOR SELECT TO authenticated
  USING (public.has_module_access(auth.uid(), 'parque'));
GRANT SELECT ON public.maquinaria_documentos_factura_importacion_unidades TO authenticated;

INSERT INTO public.maquinaria_documentos_factura_importacion_unidades (documento_id, importacion_unidad_id)
SELECT d.id, u.id
FROM public.maquinaria_documentos d
JOIN public.maquinaria_importacion_unidades u
  ON u.importacion_linea_id = d.importacion_linea_id AND u.activa
WHERE d.tipo = 'FACTURA_IMPORTACION'
  AND (SELECT count(*) FROM public.maquinaria_importacion_unidades sibling
       WHERE sibling.importacion_linea_id = u.importacion_linea_id AND sibling.activa) = 1
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.maquinaria_vincular_documento_factura_importacion(
  p_documento_id uuid, p_unidad_ids uuid[]
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_linea_id uuid;
  v_cantidad integer;
BEGIN
  IF NOT public.maquinaria_puede_gestionar_flujo() THEN
    RAISE EXCEPTION 'Solo admin o jefatura pueden gestionar facturas del proveedor' USING ERRCODE = '42501';
  END IF;
  SELECT importacion_linea_id INTO v_linea_id
  FROM public.maquinaria_documentos
  WHERE id = p_documento_id AND tipo = 'FACTURA_IMPORTACION' FOR UPDATE;
  IF v_linea_id IS NULL THEN
    RAISE EXCEPTION 'El documento no es una factura de importacion';
  END IF;
  SELECT count(DISTINCT id) INTO v_cantidad
  FROM unnest(coalesce(p_unidad_ids, ARRAY[]::uuid[])) AS selected(id);
  IF v_cantidad = 0 OR v_cantidad <> coalesce(array_length(p_unidad_ids, 1), 0) THEN
    RAISE EXCEPTION 'Selecciona unidades sin repetir';
  END IF;
  IF (SELECT count(*) FROM public.maquinaria_importacion_unidades u
      WHERE u.id = ANY(p_unidad_ids) AND u.importacion_linea_id = v_linea_id AND u.activa) <> v_cantidad THEN
    RAISE EXCEPTION 'Hay una unidad inactiva o ajena a este lote';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.maquinaria_documentos_factura_importacion_unidades l
    WHERE l.importacion_unidad_id = ANY(p_unidad_ids) AND l.documento_id <> p_documento_id
  ) THEN
    RAISE EXCEPTION 'Una unidad seleccionada ya tiene otro archivo de factura';
  END IF;
  DELETE FROM public.maquinaria_documentos_factura_importacion_unidades
  WHERE documento_id = p_documento_id AND importacion_unidad_id <> ALL(p_unidad_ids);
  INSERT INTO public.maquinaria_documentos_factura_importacion_unidades (documento_id, importacion_unidad_id)
  SELECT p_documento_id, id FROM unnest(p_unidad_ids) AS selected(id)
  ON CONFLICT (documento_id, importacion_unidad_id) DO NOTHING;
  RETURN v_cantidad;
END;
$$;
REVOKE ALL ON FUNCTION public.maquinaria_vincular_documento_factura_importacion(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maquinaria_vincular_documento_factura_importacion(uuid, uuid[]) TO authenticated;
NOTIFY pgrst, 'reload schema';
