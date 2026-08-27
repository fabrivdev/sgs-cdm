-- La vista completa es costosa y el cliente la consultaba en paginas de 1000,
-- repitiendo toda la agregacion por cada pagina. Esta RPC ejecuta el calculo
-- una sola vez y devuelve el arreglo completo con un timeout adecuado para una
-- descarga administrativa.

CREATE INDEX IF NOT EXISTS repuestos_ventas_vinculacion_pendientes_export_idx
  ON public.repuestos_ventas_vinculacion (estado_vinculo, linea_id)
  WHERE estado_vinculo <> 'CONFIRMADA';

CREATE OR REPLACE FUNCTION public.repuestos_exportar_stock_ventas_completo()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
SET statement_timeout = '180s'
AS $function$
  SELECT coalesce(
    jsonb_agg(to_jsonb(fila) ORDER BY fila.codigo),
    '[]'::jsonb
  )
  FROM public.v_repuestos_stock_ventas_exportacion fila;
$function$;

REVOKE ALL ON FUNCTION public.repuestos_exportar_stock_ventas_completo()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repuestos_exportar_stock_ventas_completo()
  TO authenticated;

COMMENT ON FUNCTION public.repuestos_exportar_stock_ventas_completo() IS
  'Calcula una sola vez y devuelve la base completa de stock y ventas para generar el Excel.';

NOTIFY pgrst, 'reload schema';
