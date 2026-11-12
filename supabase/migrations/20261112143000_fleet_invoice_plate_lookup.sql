BEGIN;
CREATE OR REPLACE FUNCTION public.fleet_search_invoice_plates(p_plate text)
RETURNS TABLE(plate text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  query_plate text := public.fleet_normalize_plate(coalesce(p_plate, ''));
BEGIN
  IF public.fleet_can_submit() IS NOT TRUE THEN
    RAISE EXCEPTION 'Sin acceso a Flota';
  END IF;
  IF length(query_plate) NOT BETWEEN 2 AND 12 THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT v.plate
    FROM public.fleet_vehicles v
    WHERE v.plate_normalized LIKE query_plate || '%'
    ORDER BY v.plate_normalized
    LIMIT 12;
END;
$$;
REVOKE ALL ON FUNCTION public.fleet_search_invoice_plates(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fleet_search_invoice_plates(text) TO authenticated;
COMMIT;
