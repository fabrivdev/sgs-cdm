CREATE OR REPLACE FUNCTION public.fleet_can_view() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.fleet_is_manager() OR (auth.uid() IS NOT NULL AND public.has_section_access(auth.uid(),'servicios.flota') AND public.has_role(auth.uid(),'gerencia'::public.app_role))
$$;
REVOKE ALL ON FUNCTION public.fleet_can_view() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fleet_can_view() TO authenticated, service_role;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['fleet_vehicles','fleet_odometer_readings','fleet_vehicle_responsibility_events','fleet_change_events','fleet_initial_loads','fleet_maintenance_history','fleet_fuel_entries','fleet_maintenance_invoices'] LOOP
  EXECUTE format('ALTER POLICY fleet_manager_boundary ON public.%I USING(public.fleet_can_view()) WITH CHECK(public.fleet_is_manager())',t);
  EXECUTE format('ALTER POLICY fleet_manager_select ON public.%I USING(public.fleet_can_view())',t);
 END LOOP;
END $$;
ALTER POLICY invoice_audit_read ON public.fleet_invoice_audit USING(public.fleet_can_view());
ALTER POLICY manager_read ON public.fleet_invoice_files USING(public.fleet_can_view());
ALTER POLICY manager_read ON public.fleet_plate_aliases USING(public.fleet_can_view());
ALTER POLICY fleet_invoice_read_guard ON storage.objects USING(bucket_id<>'fleet-invoices' OR public.fleet_can_view());
ALTER POLICY fleet_invoice_read ON storage.objects USING(bucket_id='fleet-invoices' AND public.fleet_can_view() AND (
 EXISTS(SELECT 1 FROM public.fleet_maintenance_invoices i WHERE i.storage_path=objects.name)
 OR EXISTS(SELECT 1 FROM public.fleet_invoice_files f WHERE f.storage_path=objects.name AND f.status='complete')
 OR EXISTS(SELECT 1 FROM public.fleet_invoice_audit a WHERE a.before_data->>'storage_path'=objects.name)
));