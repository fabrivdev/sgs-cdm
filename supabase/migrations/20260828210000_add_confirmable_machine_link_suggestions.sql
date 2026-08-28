-- Sub-etapa D: coincidencias exactas y no ambiguas se muestran como
-- sugerencias. Nunca se escriben como vinculo fisico sin confirmacion.

-- Las cargas futuras del maestro crean/actualizan las unidades fisicas, pero
-- ya no copian a ellas el matching historico calculado en la cabecera.
CREATE OR REPLACE FUNCTION public.maquinaria_sincronizar_unidades_importacion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cantidad integer := greatest(coalesce(NEW.cantidad, 1), 1);
BEGIN
  INSERT INTO public.maquinaria_importacion_unidades (
    importacion_linea_id, numero_unidad, chasis, estado_fuente, eta, ata,
    invoice_supplier, costo_final_sin_iva, costo_final
  )
  SELECT
    NEW.id, n,
    CASE WHEN n = 1 THEN NEW.chasis END,
    NEW.estado_fuente, NEW.eta, NEW.ata, NEW.invoice_supplier,
    NEW.costo_final_sin_iva, NEW.costo_final
  FROM generate_series(1, v_cantidad) AS n
  ON CONFLICT (importacion_linea_id, numero_unidad) DO UPDATE
  SET activa = true,
      estado_fuente = CASE
        WHEN maquinaria_importacion_unidades.detalle_manual
          THEN maquinaria_importacion_unidades.estado_fuente
        ELSE EXCLUDED.estado_fuente
      END,
      eta = CASE WHEN maquinaria_importacion_unidades.detalle_manual
        THEN maquinaria_importacion_unidades.eta ELSE EXCLUDED.eta END,
      ata = CASE WHEN maquinaria_importacion_unidades.detalle_manual
        THEN maquinaria_importacion_unidades.ata ELSE EXCLUDED.ata END,
      invoice_supplier = CASE WHEN maquinaria_importacion_unidades.detalle_manual
        THEN maquinaria_importacion_unidades.invoice_supplier ELSE EXCLUDED.invoice_supplier END,
      costo_final_sin_iva = CASE WHEN maquinaria_importacion_unidades.detalle_manual
        THEN maquinaria_importacion_unidades.costo_final_sin_iva ELSE EXCLUDED.costo_final_sin_iva END,
      costo_final = CASE WHEN maquinaria_importacion_unidades.detalle_manual
        THEN maquinaria_importacion_unidades.costo_final ELSE EXCLUDED.costo_final END,
      chasis = CASE
        WHEN maquinaria_importacion_unidades.detalle_manual
          OR maquinaria_importacion_unidades.vinculo_manual
          OR EXCLUDED.numero_unidad <> 1
          THEN maquinaria_importacion_unidades.chasis
        ELSE coalesce(EXCLUDED.chasis, maquinaria_importacion_unidades.chasis)
      END,
      actualizado_en = now();

  UPDATE public.maquinaria_importacion_unidades u
  SET activa = false, actualizado_en = now()
  WHERE u.importacion_linea_id = NEW.id
    AND u.numero_unidad > v_cantidad
    AND u.unidad_id IS NULL
    AND public.normalizar_chasis_notificacion(u.chasis) IS NULL
    AND u.invoice_supplier IS NULL
    AND u.ata IS NULL;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE VIEW public.maquinaria_vinculos_sugeridos
WITH (security_invoker = true)
AS
WITH pedidos AS (
  SELECT
    u.id AS unidad_id,
    l.id AS linea_id,
    o.id AS operacion_id,
    l.abastecimiento,
    l.marca::text AS marca,
    l.producto,
    l.modelo,
    u.chasis,
    public.normalizar_chasis_notificacion(u.chasis) AS chasis_normalizado
  FROM public.maquinaria_unidades_operacion u
  JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
  JOIN public.maquinaria_operaciones o ON o.id = l.operacion_id
  WHERE o.estado <> 'CANCELADA'
    AND u.estado <> 'CANCELADA'
    AND public.normalizar_chasis_notificacion(u.chasis) IS NOT NULL
), stock_candidatos AS (
  SELECT
    p.unidad_id, p.linea_id, p.operacion_id, 'STOCK'::text AS tipo,
    s.id AS recurso_id, p.chasis, s.modelo, s.marca, s.sucursal::text AS ubicacion,
    count(*) OVER (PARTITION BY p.unidad_id) AS candidatos
  FROM pedidos p
  JOIN public.parque_stock_maquinas s
    ON public.normalizar_chasis_notificacion(s.chasis) = p.chasis_normalizado
  WHERE p.abastecimiento = 'STOCK'
    AND coalesce(s.saldo_actual, 0) > 0
    AND (s.unidad_operacion_id IS NULL OR s.unidad_operacion_id = p.unidad_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.parque_stock_maquinas asignada
      WHERE asignada.unidad_operacion_id = p.unidad_id
    )
), importacion_candidatos AS (
  SELECT
    p.unidad_id, p.linea_id, p.operacion_id, 'IMPORTAR'::text AS tipo,
    iu.id AS recurso_id, p.chasis, coalesce(i.modelo, i.producto) AS modelo,
    coalesce(l.marca, i.marca_importacion)::text AS marca,
    coalesce(i.oc, i.po, i.proveedor) AS ubicacion,
    count(*) OVER (PARTITION BY p.unidad_id) AS candidatos
  FROM pedidos p
  JOIN public.maquinaria_importacion_unidades iu
    ON public.normalizar_chasis_notificacion(iu.chasis) = p.chasis_normalizado
  JOIN public.maquinaria_importacion_lineas i ON i.id = iu.importacion_linea_id
  LEFT JOIN public.maquinaria_operacion_lineas l ON l.id = iu.linea_id
  WHERE p.abastecimiento = 'IMPORTAR'
    AND iu.activa
    AND (iu.unidad_id IS NULL OR iu.unidad_id = p.unidad_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.maquinaria_importacion_unidades confirmada
      WHERE confirmada.unidad_id = p.unidad_id
        AND confirmada.vinculo_manual
    )
)
SELECT
  unidad_id, linea_id, operacion_id, tipo, recurso_id, chasis, modelo,
  marca, ubicacion, 'CHASIS_EXACTO_UNICO'::text AS motivo
FROM stock_candidatos
WHERE candidatos = 1
UNION ALL
SELECT
  unidad_id, linea_id, operacion_id, tipo, recurso_id, chasis, modelo,
  marca, ubicacion, 'CHASIS_EXACTO_UNICO'::text AS motivo
FROM importacion_candidatos
WHERE candidatos = 1;

GRANT SELECT ON public.maquinaria_vinculos_sugeridos TO authenticated;

COMMENT ON VIEW public.maquinaria_vinculos_sugeridos IS
  'Coincidencias exactas y no ambiguas por chasis. Son propuestas de solo lectura hasta que el usuario confirma con la RPC de asignacion.';

NOTIFY pgrst, 'reload schema';
