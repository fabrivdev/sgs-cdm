-- Una NP puede contener varias máquinas y recibir una factura distinta por unidad.
-- La NP sigue teniendo un único archivo vigente; las facturas se agregan y se
-- vinculan a las unidades que realmente fueron facturadas.

DROP INDEX IF EXISTS public.maquinaria_documentos_comerciales_unico_idx;

CREATE UNIQUE INDEX IF NOT EXISTS maquinaria_documentos_np_unico_idx
  ON public.maquinaria_documentos (operacion_id, tipo)
  WHERE operacion_id IS NOT NULL AND tipo = 'NP';

CREATE INDEX IF NOT EXISTS maquinaria_documentos_factura_venta_idx
  ON public.maquinaria_documentos (operacion_id, creado_en DESC)
  WHERE operacion_id IS NOT NULL AND tipo = 'FACTURA_VENTA';

CREATE TABLE IF NOT EXISTS public.maquinaria_facturas_venta_unidades (
  documento_id uuid NOT NULL REFERENCES public.maquinaria_documentos(id) ON DELETE CASCADE,
  unidad_operacion_id uuid NOT NULL REFERENCES public.maquinaria_unidades_operacion(id) ON DELETE CASCADE,
  estado_unidad_anterior text NOT NULL,
  creado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  creado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (documento_id, unidad_operacion_id),
  CONSTRAINT maquinaria_factura_unidad_unica UNIQUE (unidad_operacion_id)
);

CREATE INDEX IF NOT EXISTS maquinaria_facturas_venta_documento_idx
  ON public.maquinaria_facturas_venta_unidades (documento_id);

ALTER TABLE public.maquinaria_facturas_venta_unidades ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.maquinaria_facturas_venta_unidades TO authenticated;
DROP POLICY IF EXISTS "Acceso modulo parque" ON public.maquinaria_facturas_venta_unidades;
CREATE POLICY "Acceso modulo parque"
ON public.maquinaria_facturas_venta_unidades FOR ALL TO authenticated
USING (public.has_module_access(auth.uid(), 'parque'))
WITH CHECK (public.has_module_access(auth.uid(), 'parque'));

CREATE OR REPLACE FUNCTION public.maquinaria_vincular_factura_venta(
  p_documento_id uuid,
  p_unidad_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_operacion_id uuid;
  v_solicitadas integer;
  v_validas integer;
BEGIN
  IF NOT public.maquinaria_puede_gestionar_flujo() THEN
    RAISE EXCEPTION 'Solo admin o jefatura pueden registrar facturas';
  END IF;

  SELECT operacion_id INTO v_operacion_id
  FROM public.maquinaria_documentos
  WHERE id = p_documento_id AND tipo = 'FACTURA_VENTA'
  FOR UPDATE;

  IF v_operacion_id IS NULL THEN
    RAISE EXCEPTION 'La factura no existe o no corresponde a una venta';
  END IF;

  SELECT count(DISTINCT solicitado.unidad_id) INTO v_solicitadas
  FROM unnest(coalesce(p_unidad_ids, ARRAY[]::uuid[])) AS solicitado(unidad_id);
  IF v_solicitadas = 0 THEN
    RAISE EXCEPTION 'Selecciona al menos una maquina facturada';
  END IF;

  SELECT count(*) INTO v_validas
  FROM public.maquinaria_unidades_operacion unidad
  JOIN public.maquinaria_operacion_lineas linea ON linea.id = unidad.linea_id
  WHERE linea.operacion_id = v_operacion_id
    AND unidad.id = ANY(p_unidad_ids);
  IF v_validas <> v_solicitadas THEN
    RAISE EXCEPTION 'Una unidad no pertenece a este pedido';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.maquinaria_facturas_venta_unidades vinculo
    WHERE vinculo.unidad_operacion_id = ANY(p_unidad_ids)
      AND vinculo.documento_id <> p_documento_id
  ) THEN
    RAISE EXCEPTION 'Una de las maquinas seleccionadas ya tiene factura';
  END IF;

  INSERT INTO public.maquinaria_facturas_venta_unidades (
    documento_id, unidad_operacion_id, estado_unidad_anterior
  )
  SELECT p_documento_id, unidad.id, unidad.estado
  FROM public.maquinaria_unidades_operacion unidad
  JOIN public.maquinaria_operacion_lineas linea ON linea.id = unidad.linea_id
  WHERE linea.operacion_id = v_operacion_id
    AND unidad.id = ANY(p_unidad_ids)
  ON CONFLICT (documento_id, unidad_operacion_id) DO NOTHING;

  UPDATE public.maquinaria_unidades_operacion unidad
  SET estado = 'FACTURADA', actualizado_en = now()
  FROM public.maquinaria_operacion_lineas linea
  WHERE linea.id = unidad.linea_id
    AND linea.operacion_id = v_operacion_id
    AND unidad.id = ANY(p_unidad_ids)
    AND unidad.estado NOT IN ('EN_PARQUE', 'TRANSFERIDA', 'CANCELADA');

  IF NOT EXISTS (
    SELECT 1
    FROM public.maquinaria_operacion_lineas linea
    JOIN public.maquinaria_unidades_operacion unidad ON unidad.linea_id = linea.id
    WHERE linea.operacion_id = v_operacion_id
      AND unidad.estado NOT IN ('FACTURADA', 'EN_PARQUE', 'TRANSFERIDA', 'CANCELADA')
  ) THEN
    UPDATE public.maquinaria_operaciones
    SET estado = 'FACTURADA', actualizado_en = now()
    WHERE id = v_operacion_id AND estado NOT IN ('CERRADA', 'CANCELADA');
  END IF;

  RETURN jsonb_build_object('vinculadas', v_solicitadas);
END;
$$;

CREATE OR REPLACE FUNCTION public.maquinaria_eliminar_factura_venta(
  p_documento_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_operacion_id uuid;
  v_storage_path text;
BEGIN
  IF NOT public.maquinaria_puede_gestionar_flujo() THEN
    RAISE EXCEPTION 'Solo admin o jefatura pueden eliminar facturas';
  END IF;

  SELECT operacion_id, storage_path INTO v_operacion_id, v_storage_path
  FROM public.maquinaria_documentos
  WHERE id = p_documento_id AND tipo = 'FACTURA_VENTA'
  FOR UPDATE;
  IF v_operacion_id IS NULL THEN
    RAISE EXCEPTION 'La factura ya no existe';
  END IF;

  UPDATE public.maquinaria_unidades_operacion unidad
  SET estado = vinculo.estado_unidad_anterior,
      actualizado_en = now()
  FROM public.maquinaria_facturas_venta_unidades vinculo
  WHERE vinculo.documento_id = p_documento_id
    AND vinculo.unidad_operacion_id = unidad.id
    AND unidad.estado = 'FACTURADA';

  DELETE FROM public.maquinaria_documentos WHERE id = p_documento_id;

  UPDATE public.maquinaria_operaciones operacion
  SET estado = CASE
        WHEN EXISTS (
          SELECT 1 FROM public.maquinaria_operacion_lineas linea
          JOIN public.maquinaria_unidades_operacion unidad ON unidad.linea_id = linea.id
          WHERE linea.operacion_id = v_operacion_id AND unidad.estado = 'EN_TRANSITO'
        ) THEN 'EN_IMPORTACION'
        ELSE 'ABASTECIMIENTO'
      END,
      actualizado_en = now()
  WHERE operacion.id = v_operacion_id
    AND operacion.estado = 'FACTURADA'
    AND EXISTS (
      SELECT 1 FROM public.maquinaria_operacion_lineas linea
      JOIN public.maquinaria_unidades_operacion unidad ON unidad.linea_id = linea.id
      WHERE linea.operacion_id = v_operacion_id
        AND unidad.estado NOT IN ('FACTURADA', 'EN_PARQUE', 'TRANSFERIDA', 'CANCELADA')
    );

  RETURN jsonb_build_object('storage_path', v_storage_path);
END;
$$;

REVOKE ALL ON FUNCTION public.maquinaria_vincular_factura_venta(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.maquinaria_eliminar_factura_venta(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maquinaria_vincular_factura_venta(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.maquinaria_eliminar_factura_venta(uuid) TO authenticated;

COMMENT ON TABLE public.maquinaria_facturas_venta_unidades IS
  'Relaciona cada factura al cliente con las unidades concretas facturadas dentro de una NP.';

NOTIFY pgrst, 'reload schema';
