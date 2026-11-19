BEGIN;
DO $patch$
DECLARE
  definition text := pg_get_functiondef('public.ventas_servicios_movimientos_enriquecidos(date,date,text)'::regprocedure);
  original text := 'public.ventas_servicios_marca_desde_os(os.marca)';
  replacement text := $new$coalesce(public.ventas_servicios_marca_desde_os(os.marca),
            public.ventas_servicios_marca_desde_os(os.raw_data->>'MARCA'))$new$;
BEGIN
  IF strpos(definition,'ventas_servicios_marca_desde_os(os.raw_data')>0 THEN RETURN; END IF;
  IF strpos(definition,original)=0 THEN
    RAISE EXCEPTION 'Aplicar primero 20261119130000_recover_service_machine_brand_from_os.sql';
  END IF;
  EXECUTE replace(definition,original,replacement);
END;
$patch$;
NOTIFY pgrst,'reload schema';
COMMIT;
