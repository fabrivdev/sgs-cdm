-- Matches the exact JSON expression used by PostgREST in the machine history.
-- No records or RLS policies are changed.
CREATE INDEX IF NOT EXISTS idx_facturacion_lineas_linked_os_id
  ON public.facturacion_lineas_importadas ((raw_data->>'linked_service_order'), id);

NOTIFY pgrst, 'reload schema';
