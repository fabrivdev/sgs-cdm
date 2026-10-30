-- Sólo retirar esta función si conserva la definición aplicada el 21/10/2026.
BEGIN;
DO $guard$ BEGIN IF md5(pg_get_functiondef('public.campi_clientes_cohortes_v1(date,date,date,date,text)'::regprocedure)) <> '3f4ffd1b6bc720d7633741652e0aa1ae' THEN RAISE EXCEPTION 'La definición aplicada cambió; detener reversión'; END IF; END $guard$;
DROP FUNCTION public.campi_clientes_cohortes_v1(date,date,date,date,text);
COMMIT;
