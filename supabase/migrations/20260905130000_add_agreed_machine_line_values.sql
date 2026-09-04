-- Valor comercial previo a la factura, independiente por linea de pedido.
-- El valor facturado permanece en maquinaria_unidades_operacion y siempre
-- tiene prioridad para mostrar el valor vigente de una operacion.

ALTER TABLE public.maquinaria_operacion_lineas
  ADD COLUMN IF NOT EXISTS valor_acordado_unitario numeric(16,2),
  ADD COLUMN IF NOT EXISTS moneda_acordada text NOT NULL DEFAULT 'USD';

ALTER TABLE public.maquinaria_operacion_lineas
  DROP CONSTRAINT IF EXISTS maquinaria_operacion_lineas_valor_acordado_check,
  ADD CONSTRAINT maquinaria_operacion_lineas_valor_acordado_check
    CHECK (valor_acordado_unitario IS NULL OR valor_acordado_unitario >= 0),
  DROP CONSTRAINT IF EXISTS maquinaria_operacion_lineas_moneda_acordada_check,
  ADD CONSTRAINT maquinaria_operacion_lineas_moneda_acordada_check
    CHECK (moneda_acordada IN ('USD', 'EUR', 'PYG'));

COMMENT ON COLUMN public.maquinaria_operacion_lineas.valor_acordado_unitario IS
  'Valor comercial acordado por unidad antes de facturar. No se sobrescribe al importar la factura.';
COMMENT ON COLUMN public.maquinaria_operacion_lineas.moneda_acordada IS
  'Moneda del valor comercial acordado antes de facturar.';

CREATE OR REPLACE VIEW public.maquinaria_operaciones_resumen
WITH (security_invoker = true)
AS
SELECT
  o.id, o.np_numero, o.np_fecha, o.cliente_id,
  coalesce(c.nombre, o.cliente_nombre, 'Cliente por validar') AS cliente_nombre,
  o.comercial, o.estado, o.observaciones, o.creado_en, o.actualizado_en,
  coalesce(l.lineas, 0)::integer AS lineas,
  coalesce(l.unidades, 0)::integer AS unidades,
  coalesce(d.documentos, 0)::integer AS documentos,
  coalesce(l.requiere_importacion, false) AS requiere_importacion,
  coalesce(l.incluye_marca_admitida, false) AS incluye_marca_admitida,
  l.marcas,
  l.valor_acordado,
  l.valor_facturado,
  l.valor_vigente AS valor_venta,
  l.moneda_valor,
  coalesce(l.unidades_facturadas, 0)::integer AS unidades_facturadas
FROM public.maquinaria_operaciones o
LEFT JOIN public.clientes c ON c.id = o.cliente_id
LEFT JOIN LATERAL (
  SELECT
    count(*)::integer AS lineas,
    coalesce(sum(ml.cantidad), 0)::integer AS unidades,
    bool_or(ml.abastecimiento = 'IMPORTAR') AS requiere_importacion,
    bool_or(ml.elegible_parque) AS incluye_marca_admitida,
    string_agg(DISTINCT ml.marca::text, ', ' ORDER BY ml.marca::text) AS marcas,
    sum(ml.valor_acordado_unitario * ml.cantidad)
      FILTER (WHERE ml.valor_acordado_unitario IS NOT NULL) AS valor_acordado,
    sum(uv.valor_facturado) FILTER (WHERE uv.valor_facturado IS NOT NULL) AS valor_facturado,
    sum(
      coalesce(uv.valor_facturado, 0)
      + coalesce(ml.valor_acordado_unitario, 0) * greatest(ml.cantidad - uv.unidades_facturadas, 0)
    ) FILTER (
      WHERE uv.valor_facturado IS NOT NULL OR ml.valor_acordado_unitario IS NOT NULL
    ) AS valor_vigente,
    CASE
      WHEN count(DISTINCT coalesce(uv.moneda_facturada, ml.moneda_acordada))
        FILTER (WHERE uv.valor_facturado IS NOT NULL OR ml.valor_acordado_unitario IS NOT NULL) = 1
      THEN max(coalesce(uv.moneda_facturada, ml.moneda_acordada))
        FILTER (WHERE uv.valor_facturado IS NOT NULL OR ml.valor_acordado_unitario IS NOT NULL)
      ELSE NULL
    END AS moneda_valor,
    coalesce(sum(uv.unidades_facturadas), 0)::integer AS unidades_facturadas
  FROM public.maquinaria_operacion_lineas ml
  LEFT JOIN LATERAL (
    SELECT
      sum(mu.valor_facturado) FILTER (WHERE mu.valor_facturado IS NOT NULL) AS valor_facturado,
      count(*) FILTER (WHERE mu.valor_facturado IS NOT NULL)::integer AS unidades_facturadas,
      CASE WHEN count(DISTINCT mu.moneda) FILTER (WHERE mu.valor_facturado IS NOT NULL) = 1
        THEN max(mu.moneda) FILTER (WHERE mu.valor_facturado IS NOT NULL)
        ELSE NULL
      END AS moneda_facturada
    FROM public.maquinaria_unidades_operacion mu
    WHERE mu.linea_id = ml.id
  ) uv ON true
  WHERE ml.operacion_id = o.id
) l ON true
LEFT JOIN LATERAL (
  SELECT count(*)::integer AS documentos
  FROM public.maquinaria_documentos md
  WHERE md.operacion_id = o.id
) d ON true;

GRANT SELECT ON public.maquinaria_operaciones_resumen TO authenticated;

NOTIFY pgrst, 'reload schema';
