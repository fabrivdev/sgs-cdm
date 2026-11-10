BEGIN;
ALTER TABLE public.fleet_vehicles ADD COLUMN IF NOT EXISTS maintenance_interval_km integer CHECK (maintenance_interval_km > 0);
COMMENT ON COLUMN public.fleet_vehicles.maintenance_interval_km IS 'Intervalo de mantenimiento en km configurado por Jefatura; NULL sin configuración.';
CREATE OR REPLACE FUNCTION public.fleet_save_vehicle(p_id uuid,p_data jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE vid uuid:=p_id; interval_text text; interval_km integer;
BEGIN
 PERFORM public.fleet_assert_write_access();
 IF p_data ? 'maintenance_interval_km' THEN
  interval_text := nullif(trim(p_data->>'maintenance_interval_km'),'');
  IF interval_text IS NOT NULL THEN
   IF interval_text !~ '^[0-9]+$' OR interval_text::numeric NOT BETWEEN 1 AND 2147483647 THEN
    RAISE EXCEPTION 'El intervalo debe ser un número entero mayor que cero';
   END IF;
   interval_km := interval_text::integer;
  END IF;
 END IF;
 IF vid IS NULL THEN vid:=public.fleet_create_vehicle(p_data->>'brand',p_data->>'plate',nullif(p_data->>'model',''),NULL,NULL); END IF;
 PERFORM public.fleet_edit_vehicle(vid,p_data);
 IF p_data ? 'maintenance_interval_km' THEN
  UPDATE public.fleet_vehicles SET maintenance_interval_km=interval_km
  WHERE id=vid AND maintenance_interval_km IS DISTINCT FROM interval_km;
 END IF;
 RETURN vid;
END $$;
REVOKE ALL ON FUNCTION public.fleet_save_vehicle(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fleet_save_vehicle(uuid,jsonb) TO authenticated;
COMMIT;
