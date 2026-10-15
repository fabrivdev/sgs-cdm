BEGIN;

-- Keep the installed enriched function, including later owner and billing fixes.
-- Only extend its normalized search text; all aggregates and filtered RPCs consume it.
DO $migration$
DECLARE
  function_oid oid := to_regprocedure('public.ventas_servicios_movimientos_enriquecidos(date,date,text)');
  definition text;
  old_fragment text := 'e.nro_chasis,e.tipo_tiempo,e.descripcion';
  new_fragment text := 'e.nro_chasis,e.tipo_tiempo,e.codigo,e.codigo_fabricante,e.descripcion';
BEGIN
  IF function_oid IS NULL THEN
    RAISE EXCEPTION 'Falta ventas_servicios_movimientos_enriquecidos(date,date,text)';
  END IF;
  definition := pg_get_functiondef(function_oid);
  IF strpos(definition,new_fragment)>0 THEN RETURN; END IF;
  IF strpos(definition,old_fragment)=0 OR strpos(definition,'servicios.ventas')=0
    OR strpos(lower(definition),'security definer')=0 THEN
    RAISE EXCEPTION 'Definición inesperada de la búsqueda de Servicios';
  END IF;
  definition := replace(definition,old_fragment,new_fragment);
  EXECUTE definition;
END;
$migration$;

COMMIT;
