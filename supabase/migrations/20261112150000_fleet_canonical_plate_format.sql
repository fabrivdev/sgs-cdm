BEGIN;

-- Keep the existing identity key, aliases and expense links intact.
UPDATE public.fleet_vehicles
SET plate = plate_normalized
WHERE plate IS DISTINCT FROM plate_normalized;

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
