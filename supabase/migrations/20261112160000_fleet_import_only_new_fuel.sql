BEGIN;

-- Existing keys are immutable during imports, including manual corrections.
CREATE OR REPLACE FUNCTION public.fleet_import_fuel_entries_original(p_rows jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r jsonb; n integer:=0; inserted integer; BEGIN
 PERFORM public.fleet_assert_write_access();
 IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>10000 THEN RAISE EXCEPTION 'Lote inválido'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('fleet-fuel-import'));
 FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
  IF EXISTS (SELECT 1 FROM public.fleet_fuel_entries WHERE source_key = r->>'source_key') THEN
   CONTINUE;
  END IF;
  INSERT INTO public.fleet_fuel_entries(plate,occurred_at,liters,net_amount,currency,odometer_km,previous_odometer_km,previous_liters,product,station,source_key,raw_data)
  VALUES(coalesce(r->>'plate',''),(r->>'occurred_at')::timestamp,(r->>'liters')::numeric,(r->>'net_amount')::numeric,nullif(r->>'currency',''),
  (r->>'odometer_km')::bigint,(r->>'previous_odometer_km')::bigint,(r->>'previous_liters')::numeric,r->>'product',r->>'station',r->>'source_key',r->'raw_data')
  ON CONFLICT (source_key) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  n := n + inserted;
 END LOOP; RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.fleet_import_fuel_entries_original(jsonb) FROM PUBLIC, anon, authenticated;

COMMIT;
