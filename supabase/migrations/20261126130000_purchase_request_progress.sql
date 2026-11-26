ALTER TABLE public.compras_solicitudes
  ADD COLUMN IF NOT EXISTS cantidad_en_pedido numeric,
  ADD COLUMN IF NOT EXISTS cantidad_pendiente numeric,
  ADD COLUMN IF NOT EXISTS medio_transporte text;

NOTIFY pgrst, 'reload schema';
