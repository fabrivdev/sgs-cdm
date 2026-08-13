-- El motor calibrado procesa el catalogo completo antes de paginar. Se amplía
-- el margen para cargas concurrentes sin alterar ninguna formula ni dato.

ALTER FUNCTION public.repuestos_sugerencia_viva(
  text, date, text, text, text, boolean, integer, integer
) SET statement_timeout = '90s';

ALTER FUNCTION public.repuestos_sugerencia_viva_base_v1(
  text, date, text, text, text, boolean, integer, integer
) SET statement_timeout = '90s';

NOTIFY pgrst, 'reload schema';
