BEGIN;

-- The SQL editor has no auth.uid() for the application audit trigger.
-- This backfill changes only display formatting, inside this transaction.
ALTER TABLE public.fleet_vehicles DISABLE TRIGGER vehicle_audit;
UPDATE public.fleet_vehicles
SET plate = plate_normalized
WHERE plate IS DISTINCT FROM plate_normalized;

ALTER TABLE public.fleet_vehicles ENABLE TRIGGER vehicle_audit;

CREATE OR REPLACE FUNCTION public.fleet_format_vehicle_plate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.plate := public.fleet_normalize_plate(NEW.plate);
  RETURN NEW;
END;
$$;

CREATE TRIGGER fleet_format_vehicle_plate
BEFORE INSERT OR UPDATE OF plate ON public.fleet_vehicles
FOR EACH ROW EXECUTE FUNCTION public.fleet_format_vehicle_plate();

ALTER TABLE public.fleet_vehicles
  ADD CONSTRAINT fleet_vehicle_plate_canonical CHECK (plate = plate_normalized);

COMMIT;
