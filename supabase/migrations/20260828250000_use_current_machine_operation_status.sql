-- El estado historico de una linea puede quedar desactualizado. Esta vista
-- expone explicitamente el estado actual de la operacion como fuente canonica
-- para listado, filtro y KPI de facturacion.

CREATE OR REPLACE VIEW public.maquinaria_pedidos_lineas_estado_actual
WITH (security_invoker = true)
AS
SELECT
  detalle.*,
  operacion.estado AS estado_operacion
FROM public.maquinaria_pedidos_lineas_operativas detalle
JOIN public.maquinaria_operaciones operacion
  ON operacion.id = detalle.operacion_id;

GRANT SELECT ON public.maquinaria_pedidos_lineas_estado_actual TO authenticated;

COMMENT ON VIEW public.maquinaria_pedidos_lineas_estado_actual IS
  'Lineas de pedidos con el estado vigente de maquinaria_operaciones; estado_fuente se conserva solo como referencia historica.';

NOTIFY pgrst, 'reload schema';
