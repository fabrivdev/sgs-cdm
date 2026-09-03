-- Cada etapa documental admite un solo archivo vigente:
-- pedido: NP y factura al cliente;
-- importación: OC y factura del proveedor.

-- Conserva el documento más reciente cuando existen duplicados históricos.
WITH duplicados AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY operacion_id, tipo
           ORDER BY creado_en DESC, id DESC
         ) AS posicion
  FROM public.maquinaria_documentos
  WHERE operacion_id IS NOT NULL
    AND tipo IN ('NP', 'FACTURA_VENTA')
)
DELETE FROM public.maquinaria_documentos documento
USING duplicados
WHERE documento.id = duplicados.id
  AND duplicados.posicion > 1;

WITH duplicados AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY importacion_linea_id, tipo
           ORDER BY creado_en DESC, id DESC
         ) AS posicion
  FROM public.maquinaria_documentos
  WHERE importacion_linea_id IS NOT NULL
    AND tipo IN ('OC', 'FACTURA_IMPORTACION')
)
DELETE FROM public.maquinaria_documentos documento
USING duplicados
WHERE documento.id = duplicados.id
  AND duplicados.posicion > 1;

CREATE UNIQUE INDEX IF NOT EXISTS maquinaria_documentos_comerciales_unico_idx
  ON public.maquinaria_documentos (operacion_id, tipo)
  WHERE operacion_id IS NOT NULL
    AND tipo IN ('NP', 'FACTURA_VENTA');

CREATE UNIQUE INDEX IF NOT EXISTS maquinaria_documentos_importacion_unico_idx
  ON public.maquinaria_documentos (importacion_linea_id, tipo)
  WHERE importacion_linea_id IS NOT NULL
    AND tipo IN ('OC', 'FACTURA_IMPORTACION');

DROP POLICY IF EXISTS "Documentos maquinaria eliminables" ON storage.objects;
CREATE POLICY "Documentos maquinaria eliminables"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'maquinaria-documentos'
  AND public.has_module_access(auth.uid(), 'parque')
);

NOTIFY pgrst, 'reload schema';
