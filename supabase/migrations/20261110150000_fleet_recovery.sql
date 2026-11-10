BEGIN;
-- Historical identity survives a registration change. An old plate cannot be
-- silently assigned to a different vehicle.
CREATE TABLE public.fleet_plate_aliases(
 plate_normalized text PRIMARY KEY, vehicle_id uuid NOT NULL REFERENCES public.fleet_vehicles(id),
 created_at timestamptz NOT NULL DEFAULT now(), created_by uuid DEFAULT auth.uid()
);
INSERT INTO public.fleet_plate_aliases(plate_normalized,vehicle_id) SELECT plate_normalized,id FROM public.fleet_vehicles;
ALTER TABLE public.fleet_plate_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY manager_read ON public.fleet_plate_aliases FOR SELECT TO authenticated USING(public.fleet_is_manager());
REVOKE ALL ON public.fleet_plate_aliases FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.fleet_plate_aliases TO authenticated;
CREATE OR REPLACE FUNCTION public.fleet_match_plate(p_plate text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT vehicle_id FROM public.fleet_plate_aliases WHERE plate_normalized=public.fleet_normalize_plate(p_plate)
$$;
CREATE OR REPLACE FUNCTION public.fleet_refresh_links() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE owner_id uuid;
BEGIN
 INSERT INTO public.fleet_plate_aliases(plate_normalized,vehicle_id) VALUES(NEW.plate_normalized,NEW.id) ON CONFLICT DO NOTHING;
 SELECT vehicle_id INTO owner_id FROM public.fleet_plate_aliases WHERE plate_normalized=NEW.plate_normalized;
 IF owner_id<>NEW.id THEN RAISE EXCEPTION 'La chapa pertenece al historial de otro vehículo'; END IF;
 UPDATE public.fleet_fuel_entries SET vehicle_id=NEW.id WHERE vehicle_id IS NULL AND public.fleet_match_plate(plate)=NEW.id;
 UPDATE public.fleet_maintenance_history SET vehicle_id=NEW.id WHERE vehicle_id IS NULL AND public.fleet_match_plate(plate)=NEW.id;
 UPDATE public.fleet_maintenance_invoices SET vehicle_id=NEW.id WHERE vehicle_id IS NULL AND public.fleet_match_plate(plate)=NEW.id;
 RETURN NEW;
END $$;

ALTER TABLE public.fleet_maintenance_invoices DROP CONSTRAINT fleet_maintenance_invoices_status_check;
ALTER TABLE public.fleet_maintenance_invoices ADD CONSTRAINT fleet_maintenance_invoices_status_check CHECK(status IN ('pending','uploaded','void'));
ALTER TABLE public.fleet_maintenance_invoices ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE public.fleet_maintenance_invoices ADD COLUMN supplier_tax_id text CHECK(supplier_tax_id IS NULL OR supplier_tax_id ~ '^[0-9][0-9 .-]{2,19}$');
ALTER TABLE public.fleet_maintenance_invoices ADD COLUMN performed_on date, ADD COLUMN odometer_km bigint CHECK(odometer_km>=0);
ALTER TABLE public.fleet_invoice_audit ADD COLUMN reason text;
ALTER TABLE public.fleet_invoice_audit ADD COLUMN actor_name text;
ALTER TABLE public.fleet_invoice_audit ALTER COLUMN actor_name SET DEFAULT public.fleet_actor_name(auth.uid());
CREATE TABLE public.fleet_invoice_files(
 id uuid PRIMARY KEY, invoice_id uuid NOT NULL REFERENCES public.fleet_maintenance_invoices(id),
 storage_path text NOT NULL UNIQUE, filename text NOT NULL,
 mime_type text NOT NULL CHECK(mime_type IN ('application/pdf','image/jpeg','image/png')),
 size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 20971520),
 reason text NOT NULL CHECK(length(trim(reason))>0),
 expected_version integer NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','complete')),
 created_by uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fleet_invoice_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY manager_read ON public.fleet_invoice_files FOR SELECT TO authenticated USING(public.fleet_is_manager());
REVOKE ALL ON public.fleet_invoice_files FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.fleet_invoice_files TO authenticated;

CREATE FUNCTION public.fleet_correct_invoice(p_id uuid,p_version integer,p_data jsonb,p_reason text,p_void boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE oldrow public.fleet_maintenance_invoices; newrow public.fleet_maintenance_invoices;
BEGIN
 PERFORM public.fleet_assert_write_access();
 IF coalesce(length(trim(p_reason)),0)=0 THEN RAISE EXCEPTION 'Ingresá el motivo'; END IF;
 SELECT * INTO oldrow FROM public.fleet_maintenance_invoices WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR oldrow.status='void' THEN RAISE EXCEPTION 'Factura no disponible'; END IF;
 IF oldrow.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'La factura cambió. Cerrá y volvé a abrir el detalle'; END IF;
 IF p_void THEN
  UPDATE public.fleet_maintenance_invoices SET status='void',version=version+1 WHERE id=p_id;
 ELSE
  IF length(public.fleet_normalize_plate(p_data->>'plate')) NOT BETWEEN 3 AND 12 THEN RAISE EXCEPTION 'Chapa inválida'; END IF;
  UPDATE public.fleet_maintenance_invoices SET supplier_tax_id=nullif(trim(p_data->>'supplier_tax_id'),''),plate=trim(p_data->>'plate'),supplier=trim(p_data->>'supplier'),
   invoice_number=trim(p_data->>'invoice_number'),invoice_date=(p_data->>'invoice_date')::date,
   performed_on=nullif(p_data->>'performed_on','')::date,odometer_km=nullif(p_data->>'odometer_km','')::bigint,
   description=trim(p_data->>'description'),categories=ARRAY(SELECT DISTINCT jsonb_array_elements_text(p_data->'categories')),version=version+1 WHERE id=p_id;
 END IF;
 SELECT * INTO newrow FROM public.fleet_maintenance_invoices WHERE id=p_id;
 INSERT INTO public.fleet_invoice_audit(invoice_id,before_data,after_data,reason) VALUES(p_id,to_jsonb(oldrow),to_jsonb(newrow),trim(p_reason));
END $$;

CREATE FUNCTION public.fleet_reserve_invoice_file(p_id uuid,p_invoice uuid,p_version integer,p_data jsonb,p_reason text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE inv public.fleet_maintenance_invoices; existing public.fleet_invoice_files; path text;
BEGIN
 PERFORM public.fleet_assert_write_access();
 SELECT * INTO inv FROM public.fleet_maintenance_invoices WHERE id=p_invoice FOR UPDATE;
 IF NOT FOUND OR inv.status='void' THEN RAISE EXCEPTION 'Factura no disponible'; END IF;
 SELECT * INTO existing FROM public.fleet_invoice_files WHERE id=p_id;
 IF FOUND THEN
  IF existing.invoice_id<>p_invoice OR existing.created_by<>auth.uid() OR existing.filename<>p_data->>'filename' OR existing.size_bytes<>(p_data->>'size_bytes')::bigint OR existing.mime_type<>p_data->>'mime_type' THEN RAISE EXCEPTION 'El intento corresponde a otro archivo'; END IF;
  RETURN existing.storage_path;
 END IF;
 IF inv.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'La factura cambió. Volvé a abrir el detalle'; END IF;
 path:=auth.uid()::text||'/versions/'||p_id::text;
 INSERT INTO public.fleet_invoice_files(id,invoice_id,storage_path,filename,mime_type,size_bytes,reason,expected_version)
 VALUES(p_id,p_invoice,path,p_data->>'filename',p_data->>'mime_type',(p_data->>'size_bytes')::bigint,trim(p_reason),p_version);
 RETURN path;
END $$;

CREATE FUNCTION public.fleet_finalize_invoice_file(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE f public.fleet_invoice_files; inv public.fleet_maintenance_invoices;
BEGIN
 PERFORM public.fleet_assert_write_access();
 SELECT * INTO f FROM public.fleet_invoice_files WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR f.created_by<>auth.uid() THEN RAISE EXCEPTION 'Intento no disponible'; END IF;
 IF f.status='complete' THEN RETURN; END IF;
 SELECT * INTO inv FROM public.fleet_maintenance_invoices WHERE id=f.invoice_id FOR UPDATE;
 IF inv.status='void' OR inv.version<>f.expected_version THEN RAISE EXCEPTION 'La factura cambió. Volvé a abrir el detalle'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='fleet-invoices' AND name=f.storage_path AND (metadata->>'size')::bigint=f.size_bytes AND metadata->>'mimetype'=f.mime_type) THEN RAISE EXCEPTION 'El archivo no está completo. Reintentá'; END IF;
 UPDATE public.fleet_maintenance_invoices SET storage_path=f.storage_path,filename=f.filename,mime_type=f.mime_type,size_bytes=f.size_bytes,status='uploaded',version=version+1 WHERE id=inv.id;
 INSERT INTO public.fleet_invoice_audit(invoice_id,before_data,after_data,reason) SELECT inv.id,to_jsonb(inv),to_jsonb(i),f.reason FROM public.fleet_maintenance_invoices i WHERE id=inv.id;
 UPDATE public.fleet_invoice_files SET status='complete' WHERE id=p_id;
END $$;

CREATE OR REPLACE FUNCTION public.fleet_can_upload_path(p_path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT (public.fleet_can_submit() AND EXISTS(SELECT 1 FROM public.fleet_maintenance_invoices WHERE storage_path=p_path AND created_by=auth.uid() AND status='pending'))
 OR (public.fleet_is_manager() AND EXISTS(SELECT 1 FROM public.fleet_invoice_files f JOIN public.fleet_maintenance_invoices i ON i.id=f.invoice_id WHERE f.storage_path=p_path AND f.created_by=auth.uid() AND f.status='pending' AND i.status<>'void' AND i.version=f.expected_version))
$$;
-- Keep original and replacement files readable only by management, including audit.
DROP POLICY fleet_invoice_read ON storage.objects;
CREATE POLICY fleet_invoice_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='fleet-invoices' AND public.fleet_is_manager() AND (
 EXISTS(SELECT 1 FROM public.fleet_maintenance_invoices i WHERE i.storage_path=name)
 OR EXISTS(SELECT 1 FROM public.fleet_invoice_files f WHERE f.storage_path=name AND f.status='complete')
 OR EXISTS(SELECT 1 FROM public.fleet_invoice_audit a WHERE a.before_data->>'storage_path'=name)));
-- Completing an original upload must never revive a voided or replaced invoice.
CREATE OR REPLACE FUNCTION public.fleet_finalize_invoice(p_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.fleet_can_submit() THEN RAISE EXCEPTION 'Sin permiso' USING ERRCODE='42501'; END IF;
 UPDATE public.fleet_maintenance_invoices i SET status='uploaded'
 WHERE i.id=p_id AND i.created_by=auth.uid() AND i.status IN ('pending','uploaded') AND i.storage_path=auth.uid()::text||'/'||p_id::text
 AND EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='fleet-invoices' AND o.name=i.storage_path AND (o.metadata->>'size')::bigint=i.size_bytes AND o.metadata->>'mimetype'=i.mime_type);
 IF NOT FOUND THEN RAISE EXCEPTION 'Carga no disponible o incompleta. Contactá a Jefatura'; END IF;
 RETURN p_id;
END $$;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('fleet_correct_invoice','fleet_reserve_invoice_file','fleet_finalize_invoice_file') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
 END LOOP;
END $$;
DROP INDEX public.fleet_invoice_business_key;
CREATE UNIQUE INDEX fleet_invoice_business_key ON public.fleet_maintenance_invoices(
 coalesce('ruc:'||regexp_replace(supplier_tax_id,'[^0-9]','','g'),'name:'||lower(trim(supplier))),
 regexp_replace(upper(invoice_number),'[^A-Z0-9]','','g')) WHERE status<>'void';
CREATE OR REPLACE FUNCTION public.fleet_reserve_invoice(p_id uuid,p_data jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE existing public.fleet_maintenance_invoices; path text;
BEGIN
 IF NOT public.fleet_can_submit() THEN RAISE EXCEPTION 'Sin permiso para cargar facturas' USING ERRCODE='42501'; END IF;
 IF length(public.fleet_normalize_plate(p_data->>'plate')) NOT BETWEEN 3 AND 12 THEN RAISE EXCEPTION 'Chapa inválida'; END IF;
 SELECT * INTO existing FROM public.fleet_maintenance_invoices WHERE id=p_id FOR UPDATE;
 IF FOUND THEN
  IF existing.created_by<>auth.uid() THEN RAISE EXCEPTION 'Solicitud no disponible'; END IF;
  IF existing.status='void' THEN RAISE EXCEPTION 'La carga fue anulada por Jefatura. Iniciá una nueva carga'; END IF;
  IF existing.version>1 THEN RAISE EXCEPTION 'Jefatura modificó esta carga. Contactá a Jefatura para completarla'; END IF;
  RETURN existing.storage_path;
 END IF;
 -- Resume an interrupted submission after a reload without granting invoice read access.
 SELECT * INTO existing FROM public.fleet_maintenance_invoices
 WHERE status<>'void' AND (CASE WHEN supplier_tax_id IS NULL THEN lower(trim(supplier))=lower(trim(p_data->>'supplier')) ELSE regexp_replace(supplier_tax_id,'[^0-9]','','g')=regexp_replace(p_data->>'supplier_tax_id','[^0-9]','','g') END)
 AND regexp_replace(upper(invoice_number),'[^A-Z0-9]','','g')=regexp_replace(upper(p_data->>'invoice_number'),'[^A-Z0-9]','','g');
 IF FOUND THEN
  IF existing.created_by=auth.uid() AND existing.status='pending'
   AND existing.plate=trim(p_data->>'plate') AND existing.invoice_date=(p_data->>'invoice_date')::date
   AND existing.description=trim(p_data->>'description')
   AND existing.categories @> ARRAY(SELECT jsonb_array_elements_text(p_data->'categories'))
   AND existing.categories <@ ARRAY(SELECT jsonb_array_elements_text(p_data->'categories'))
   AND existing.size_bytes=(p_data->>'size_bytes')::bigint AND existing.mime_type=p_data->>'mime_type'
   AND existing.filename=p_data->>'filename' THEN RETURN existing.storage_path; END IF;
  RAISE EXCEPTION 'La factura ya fue registrada. Contactá a Jefatura.';
 END IF;
 path:=auth.uid()::text||'/'||p_id::text;
 IF coalesce(p_data->>'supplier_tax_id','') !~ '^[0-9][0-9 .-]{2,19}$' THEN RAISE EXCEPTION 'Ingresá el RUC del proveedor'; END IF;
 INSERT INTO public.fleet_maintenance_invoices(id,supplier_tax_id,plate,supplier,invoice_number,invoice_date,categories,description,filename,mime_type,size_bytes,storage_path)
 VALUES(p_id,trim(p_data->>'supplier_tax_id'),trim(p_data->>'plate'),trim(p_data->>'supplier'),trim(p_data->>'invoice_number'),(p_data->>'invoice_date')::date,
 ARRAY(SELECT DISTINCT jsonb_array_elements_text(p_data->'categories')),trim(p_data->>'description'),p_data->>'filename',p_data->>'mime_type',(p_data->>'size_bytes')::bigint,path);
 RETURN path;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'La factura ya fue registrada. Contactá a Jefatura.';
END $$;

-- Record why the registration changed; a typo is not a historical plate.
ALTER TABLE public.fleet_change_events ADD COLUMN reason text;
CREATE OR REPLACE FUNCTION public.fleet_audit_vehicle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN INSERT INTO public.fleet_change_events(vehicle_id,before_data,after_data,reason) VALUES(NEW.id,to_jsonb(OLD),to_jsonb(NEW),nullif(current_setting('fleet.plate_reason',true),'')); END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION public.fleet_edit_vehicle(uuid,jsonb) RENAME TO fleet_edit_vehicle_internal;
REVOKE ALL ON FUNCTION public.fleet_edit_vehicle_internal(uuid,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.fleet_edit_vehicle(p_id uuid,p_data jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE oldplate text; changed boolean; BEGIN
 PERFORM public.fleet_assert_write_access();
 SELECT plate_normalized INTO oldplate FROM public.fleet_vehicles WHERE id=p_id FOR UPDATE;
 changed:=oldplate IS DISTINCT FROM public.fleet_normalize_plate(p_data->>'plate');
 IF changed AND (coalesce(p_data->>'plate_change_type','') NOT IN ('change','correction') OR coalesce(length(trim(p_data->>'plate_change_reason')),0)=0) THEN RAISE EXCEPTION 'Indicá el tipo y motivo del cambio de chapa'; END IF;
 PERFORM set_config('fleet.plate_reason',CASE WHEN changed THEN p_data->>'plate_change_reason' ELSE '' END,true);
 PERFORM public.fleet_edit_vehicle_internal(p_id,p_data);
 PERFORM set_config('fleet.plate_reason','',true);
 IF changed THEN
  IF p_data->>'plate_change_type'='correction' THEN DELETE FROM public.fleet_plate_aliases WHERE plate_normalized=oldplate AND vehicle_id=p_id; END IF;

 END IF;
 RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.fleet_edit_vehicle(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_edit_vehicle(uuid,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.fleet_link_expense() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.vehicle_id IS NOT NULL AND public.fleet_normalize_plate(OLD.plate)=public.fleet_normalize_plate(NEW.plate) THEN NEW.vehicle_id:=OLD.vehicle_id;
 ELSE NEW.vehicle_id:=public.fleet_match_plate(NEW.plate); END IF;
 RETURN NEW;
END $$;
COMMIT;
