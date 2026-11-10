-- Local implementation only. Apply explicitly after reviewing and backing up the target.
BEGIN;
CREATE OR REPLACE FUNCTION public.fleet_is_manager() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND public.has_section_access(auth.uid(),'servicios.flota')
 AND (public.has_role(auth.uid(),'jefatura'::public.app_role) OR public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'superadmin'::public.app_role))
$$;
CREATE OR REPLACE FUNCTION public.fleet_can_submit() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.fleet_is_manager() OR (auth.uid() IS NOT NULL AND public.has_section_access(auth.uid(),'servicios.flota') AND public.has_role(auth.uid(),'operativo'::public.app_role))
$$;
CREATE OR REPLACE FUNCTION public.fleet_assert_write_access() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.fleet_is_manager() THEN RAISE EXCEPTION 'Sin acceso de Jefatura a Flota.' USING ERRCODE='42501'; END IF;
 RETURN auth.uid();
END $$;

ALTER TABLE public.fleet_vehicles
 ADD COLUMN IF NOT EXISTS chassis text, ADD COLUMN IF NOT EXISTS department text,
 ADD COLUMN IF NOT EXISTS branch text, ADD COLUMN IF NOT EXISTS color text,
 ADD COLUMN IF NOT EXISTS vehicle_type text, ADD COLUMN IF NOT EXISTS fuel_provider text,
 ADD COLUMN IF NOT EXISTS notes text, ADD COLUMN IF NOT EXISTS source_data jsonb,
 ADD COLUMN IF NOT EXISTS operational_status text NOT NULL DEFAULT 'Sin informar' CHECK(operational_status IN ('Operativa','En taller','Inoperativa','Sin informar')),
 ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'Activa' CHECK(lifecycle_status IN ('Activa','Vendida','Baja'));

CREATE TABLE public.fleet_change_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vehicle_id uuid NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE RESTRICT,
 before_data jsonb NOT NULL, after_data jsonb NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(), actor uuid NOT NULL DEFAULT auth.uid(), actor_name text NOT NULL DEFAULT public.fleet_actor_name(auth.uid())
);
CREATE TABLE public.fleet_initial_loads(kind text PRIMARY KEY CHECK(kind IN ('vehicles','history')), source_name text NOT NULL,
 checksum text NOT NULL, row_count integer NOT NULL, loaded_at timestamptz NOT NULL DEFAULT now(), actor uuid NOT NULL DEFAULT auth.uid());
CREATE TABLE public.fleet_maintenance_history(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vehicle_id uuid REFERENCES public.fleet_vehicles(id) ON DELETE RESTRICT,
 plate text NOT NULL DEFAULT '', occurred_on date, odometer_km bigint CHECK(odometer_km>=0), supplier text,
 invoice_number text, works jsonb NOT NULL DEFAULT '[]', source_key text NOT NULL UNIQUE, raw_data jsonb NOT NULL
);
CREATE TABLE public.fleet_fuel_entries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vehicle_id uuid REFERENCES public.fleet_vehicles(id) ON DELETE RESTRICT,
 plate text NOT NULL, occurred_at timestamp NOT NULL, liters numeric NOT NULL CHECK(liters::text NOT IN ('NaN','Infinity','-Infinity')), net_amount numeric NOT NULL CHECK(net_amount::text NOT IN ('NaN','Infinity','-Infinity')),
 currency text CHECK(currency ~ '^[A-Z]{3}$'), odometer_km bigint, previous_odometer_km bigint, previous_liters numeric,
 product text NOT NULL, station text NOT NULL, source_key text NOT NULL UNIQUE, raw_data jsonb NOT NULL,
 imported_at timestamptz NOT NULL DEFAULT now(), imported_by uuid NOT NULL DEFAULT auth.uid()
);
CREATE TABLE public.fleet_maintenance_invoices(
 id uuid PRIMARY KEY, vehicle_id uuid REFERENCES public.fleet_vehicles(id) ON DELETE RESTRICT, plate text NOT NULL,
 supplier text NOT NULL CHECK(length(trim(supplier)) BETWEEN 1 AND 200), invoice_number text NOT NULL CHECK(length(trim(invoice_number)) BETWEEN 1 AND 100),
 invoice_date date NOT NULL, categories text[] NOT NULL CHECK(cardinality(categories) BETWEEN 1 AND 6 AND categories <@ ARRAY['Filtros','Aceites y fluidos','Correas','Cubiertas','Batería','Otros trabajos y repuestos']::text[]),
 description text NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 4000), amount numeric CHECK(amount::text NOT IN ('NaN','Infinity','-Infinity')), currency text CHECK(currency ~ '^[A-Z]{3}$'),
 filename text NOT NULL, mime_type text NOT NULL CHECK(mime_type IN ('application/pdf','image/jpeg','image/png')),
 size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 20971520), storage_path text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','uploaded')),
 created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL DEFAULT auth.uid(),
 CHECK ((amount IS NULL AND currency IS NULL) OR (amount IS NOT NULL AND currency IS NOT NULL))
);
CREATE UNIQUE INDEX fleet_invoice_business_key ON public.fleet_maintenance_invoices(lower(trim(supplier)),trim(invoice_number));
CREATE INDEX fleet_fuel_vehicle_date ON public.fleet_fuel_entries(vehicle_id,occurred_at);
CREATE INDEX fleet_history_vehicle_date ON public.fleet_maintenance_history(vehicle_id,occurred_on);
CREATE INDEX fleet_invoice_vehicle_date ON public.fleet_maintenance_invoices(vehicle_id,invoice_date);
CREATE INDEX fleet_changes_vehicle_date ON public.fleet_change_events(vehicle_id,occurred_at);

-- Restrictive policies also close existing broad authenticated policies.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['fleet_vehicles','fleet_odometer_readings','fleet_vehicle_responsibility_events','fleet_change_events','fleet_initial_loads','fleet_maintenance_history','fleet_fuel_entries','fleet_maintenance_invoices'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY fleet_manager_boundary ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(public.fleet_is_manager()) WITH CHECK(public.fleet_is_manager())',t);
  EXECUTE format('CREATE POLICY fleet_manager_select ON public.%I FOR SELECT TO authenticated USING(public.fleet_is_manager())',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
 END LOOP;
END $$;

-- Preserve the existing candidates contract; prevent SECURITY DEFINER bypass.
ALTER FUNCTION public.fleet_list_responsible_candidates() RENAME TO fleet_list_responsible_candidates_internal;
REVOKE ALL ON FUNCTION public.fleet_list_responsible_candidates_internal() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.fleet_list_responsible_candidates() RETURNS TABLE(id uuid,nombre text,sucursal public.sucursal,es_tecnico boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN PERFORM public.fleet_assert_write_access(); RETURN QUERY SELECT * FROM public.fleet_list_responsible_candidates_internal(); END $$;

CREATE FUNCTION public.fleet_match_plate(p_plate text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT id FROM public.fleet_vehicles WHERE plate_normalized=public.fleet_normalize_plate(p_plate)
$$;
REVOKE ALL ON FUNCTION public.fleet_match_plate(text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.fleet_link_expense() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN NEW.vehicle_id:=public.fleet_match_plate(NEW.plate); RETURN NEW; END $$;
CREATE TRIGGER fuel_link BEFORE INSERT OR UPDATE OF plate ON public.fleet_fuel_entries FOR EACH ROW EXECUTE FUNCTION public.fleet_link_expense();
CREATE TRIGGER history_link BEFORE INSERT OR UPDATE OF plate ON public.fleet_maintenance_history FOR EACH ROW EXECUTE FUNCTION public.fleet_link_expense();
CREATE TRIGGER invoice_link BEFORE INSERT OR UPDATE OF plate ON public.fleet_maintenance_invoices FOR EACH ROW EXECUTE FUNCTION public.fleet_link_expense();
CREATE FUNCTION public.fleet_refresh_links() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 UPDATE public.fleet_fuel_entries SET vehicle_id=public.fleet_match_plate(plate) WHERE vehicle_id=NEW.id OR public.fleet_normalize_plate(plate)=NEW.plate_normalized;
 UPDATE public.fleet_maintenance_history SET vehicle_id=public.fleet_match_plate(plate) WHERE vehicle_id=NEW.id OR public.fleet_normalize_plate(plate)=NEW.plate_normalized;
 UPDATE public.fleet_maintenance_invoices SET vehicle_id=public.fleet_match_plate(plate) WHERE vehicle_id=NEW.id OR public.fleet_normalize_plate(plate)=NEW.plate_normalized;
 RETURN NEW;
END $$;
CREATE TRIGGER vehicle_refresh_links AFTER INSERT OR UPDATE OF plate_normalized ON public.fleet_vehicles FOR EACH ROW EXECUTE FUNCTION public.fleet_refresh_links();
CREATE FUNCTION public.fleet_audit_vehicle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN INSERT INTO public.fleet_change_events(vehicle_id,before_data,after_data) VALUES(NEW.id,to_jsonb(OLD),to_jsonb(NEW)); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER vehicle_audit AFTER UPDATE ON public.fleet_vehicles FOR EACH ROW EXECUTE FUNCTION public.fleet_audit_vehicle();
CREATE FUNCTION public.fleet_edit_vehicle(p_id uuid,p_data jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.fleet_assert_write_access();
 UPDATE public.fleet_vehicles SET brand=trim(p_data->>'brand'),model=nullif(trim(p_data->>'model'),''),
 plate=trim(p_data->>'plate'),plate_normalized=public.fleet_normalize_plate(p_data->>'plate'),
 model_year=nullif(p_data->>'model_year','')::smallint,chassis=nullif(p_data->>'chassis',''),department=nullif(p_data->>'department',''),
 branch=nullif(p_data->>'branch',''),color=nullif(p_data->>'color',''),vehicle_type=nullif(p_data->>'vehicle_type',''),
 fuel_provider=nullif(p_data->>'fuel_provider',''),notes=nullif(p_data->>'notes',''),
 operational_status=p_data->>'operational_status',lifecycle_status=p_data->>'lifecycle_status',active=(p_data->>'lifecycle_status'='Activa') WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Vehículo no encontrado'; END IF;
 RETURN p_id;
END $$;

CREATE FUNCTION public.fleet_save_vehicle(p_id uuid,p_data jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE vid uuid:=p_id;
BEGIN
 PERFORM public.fleet_assert_write_access();
 IF vid IS NULL THEN vid:=public.fleet_create_vehicle(p_data->>'brand',p_data->>'plate',nullif(p_data->>'model',''),NULL,NULL); END IF;
 RETURN public.fleet_edit_vehicle(vid,p_data);
END $$;

CREATE FUNCTION public.fleet_reserve_invoice(p_id uuid,p_data jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE existing public.fleet_maintenance_invoices; path text;
BEGIN
 IF NOT public.fleet_can_submit() THEN RAISE EXCEPTION 'Sin permiso para cargar facturas' USING ERRCODE='42501'; END IF;
 IF length(public.fleet_normalize_plate(p_data->>'plate')) NOT BETWEEN 3 AND 12 THEN RAISE EXCEPTION 'Chapa inválida'; END IF;
 SELECT * INTO existing FROM public.fleet_maintenance_invoices WHERE id=p_id;
 IF FOUND THEN
  IF existing.created_by<>auth.uid() THEN RAISE EXCEPTION 'Solicitud no disponible'; END IF;
  RETURN existing.storage_path;
 END IF;
 -- Resume an interrupted submission after a reload without granting invoice read access.
 SELECT * INTO existing FROM public.fleet_maintenance_invoices
 WHERE lower(trim(supplier))=lower(trim(p_data->>'supplier')) AND trim(invoice_number)=trim(p_data->>'invoice_number');
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
 INSERT INTO public.fleet_maintenance_invoices(id,plate,supplier,invoice_number,invoice_date,categories,description,filename,mime_type,size_bytes,storage_path)
 VALUES(p_id,trim(p_data->>'plate'),trim(p_data->>'supplier'),trim(p_data->>'invoice_number'),(p_data->>'invoice_date')::date,
 ARRAY(SELECT DISTINCT jsonb_array_elements_text(p_data->'categories')),trim(p_data->>'description'),p_data->>'filename',p_data->>'mime_type',(p_data->>'size_bytes')::bigint,path);
 RETURN path;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'La factura ya fue registrada. Contactá a Jefatura.';
END $$;
CREATE FUNCTION public.fleet_finalize_invoice(p_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.fleet_can_submit() THEN RAISE EXCEPTION 'Sin permiso' USING ERRCODE='42501'; END IF;
 UPDATE public.fleet_maintenance_invoices i SET status='uploaded'
 WHERE i.id=p_id AND i.created_by=auth.uid() AND EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='fleet-invoices' AND o.name=i.storage_path AND (o.metadata->>'size')::bigint=i.size_bytes AND o.metadata->>'mimetype'=i.mime_type);
 IF NOT FOUND THEN RAISE EXCEPTION 'El archivo no está completo. Reintentá la carga.'; END IF;
 RETURN p_id;
END $$;
CREATE FUNCTION public.fleet_set_invoice_amount(p_id uuid,p_amount numeric,p_currency text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE oldrow jsonb; vid uuid; BEGIN
 PERFORM public.fleet_assert_write_access();
 SELECT to_jsonb(i),i.vehicle_id INTO oldrow,vid FROM public.fleet_maintenance_invoices i WHERE id=p_id AND status='uploaded' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
 UPDATE public.fleet_maintenance_invoices SET amount=p_amount,currency=p_currency WHERE id=p_id;
 INSERT INTO public.fleet_invoice_audit(invoice_id,before_data,after_data) VALUES(p_id,oldrow,jsonb_build_object('amount',p_amount,'currency',p_currency));
END $$;
CREATE TABLE public.fleet_invoice_audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),invoice_id uuid NOT NULL REFERENCES public.fleet_maintenance_invoices(id),before_data jsonb NOT NULL,after_data jsonb NOT NULL,actor uuid NOT NULL DEFAULT auth.uid(),occurred_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.fleet_invoice_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoice_audit_read ON public.fleet_invoice_audit FOR SELECT TO authenticated USING(public.fleet_is_manager());
REVOKE ALL ON public.fleet_invoice_audit FROM anon,authenticated;
GRANT SELECT ON public.fleet_invoice_audit TO authenticated;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('fleet-invoices','fleet-invoices',false,20971520,ARRAY['application/pdf','image/jpeg','image/png']);
CREATE POLICY fleet_invoice_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO public USING(bucket_id<>'fleet-invoices' OR public.fleet_is_manager());
CREATE POLICY fleet_invoice_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='fleet-invoices' AND public.fleet_is_manager() AND EXISTS(SELECT 1 FROM public.fleet_maintenance_invoices i WHERE i.storage_path=name AND i.status='uploaded'));
-- Use a definer helper so upload-only users need no SELECT on invoice metadata.
CREATE FUNCTION public.fleet_can_upload_path(p_path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.fleet_can_submit() AND EXISTS(SELECT 1 FROM public.fleet_maintenance_invoices WHERE storage_path=p_path AND created_by=auth.uid() AND status='pending')
$$;
CREATE POLICY fleet_invoice_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO public WITH CHECK(bucket_id<>'fleet-invoices' OR public.fleet_can_upload_path(name));
CREATE POLICY fleet_invoice_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='fleet-invoices' AND public.fleet_can_upload_path(name));
CREATE POLICY fleet_invoice_no_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO public USING(bucket_id<>'fleet-invoices') WITH CHECK(bucket_id<>'fleet-invoices');
CREATE POLICY fleet_invoice_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO public USING(bucket_id<>'fleet-invoices');

CREATE FUNCTION public.fleet_import_fuel_entries(p_rows jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r jsonb; n integer:=0; previous jsonb; BEGIN
 PERFORM public.fleet_assert_write_access();
 IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>10000 THEN RAISE EXCEPTION 'Lote inválido'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('fleet-fuel-import'));
 FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
  SELECT raw_data INTO previous FROM public.fleet_fuel_entries WHERE source_key=r->>'source_key';
  IF FOUND THEN IF previous IS DISTINCT FROM r->'raw_data' THEN RAISE EXCEPTION 'Conflicto en comprobante %',r->>'source_key'; END IF; CONTINUE; END IF;
  INSERT INTO public.fleet_fuel_entries(plate,occurred_at,liters,net_amount,currency,odometer_km,previous_odometer_km,previous_liters,product,station,source_key,raw_data)
  VALUES(coalesce(r->>'plate',''),(r->>'occurred_at')::timestamp,(r->>'liters')::numeric,(r->>'net_amount')::numeric,nullif(r->>'currency',''),
  (r->>'odometer_km')::bigint,(r->>'previous_odometer_km')::bigint,(r->>'previous_liters')::numeric,r->>'product',r->>'station',r->>'source_key',r->'raw_data'); n:=n+1;
 END LOOP; RETURN n;
END $$;

CREATE FUNCTION public.fleet_load_initial(p_kind text,p_source text,p_checksum text,p_rows jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r jsonb; vid uuid; n integer:=0; prior text; BEGIN
 PERFORM public.fleet_assert_write_access();
 IF p_kind IS NULL OR p_kind NOT IN ('vehicles','history') OR p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 10000 OR coalesce(length(trim(p_checksum)),0)=0 OR coalesce(length(trim(p_source)),0)=0 THEN RAISE EXCEPTION 'Carga inicial inválida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('fleet-initial-'||p_kind));
 SELECT checksum INTO prior FROM public.fleet_initial_loads WHERE kind=p_kind;
 IF FOUND THEN IF prior=p_checksum THEN RETURN 0; ELSE RAISE EXCEPTION 'La carga inicial ya se realizó'; END IF; END IF;
 FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
  IF p_kind='vehicles' THEN
   vid:=public.fleet_match_plate(r->>'plate');
   IF vid IS NULL THEN
    vid:=public.fleet_create_vehicle(r->>'brand',r->>'plate',r->>'model',NULL,NULL);
    PERFORM public.fleet_edit_vehicle(vid,r);
   ELSE
    -- Complete missing metadata on an existing plate; never replace its manual values.
    UPDATE public.fleet_vehicles SET
     model=coalesce(model,nullif(r->>'model','')),model_year=coalesce(model_year,nullif(r->>'model_year','')::smallint),
     chassis=coalesce(chassis,nullif(r->>'chassis','')),department=coalesce(department,nullif(r->>'department','')),
     branch=coalesce(branch,nullif(r->>'branch','')),color=coalesce(color,nullif(r->>'color','')),
     vehicle_type=coalesce(vehicle_type,nullif(r->>'vehicle_type','')),fuel_provider=coalesce(fuel_provider,nullif(r->>'fuel_provider','')),
     notes=coalesce(notes,nullif(r->>'notes','')),
     operational_status=CASE WHEN operational_status='Sin informar' THEN r->>'operational_status' ELSE operational_status END
    WHERE id=vid AND source_data IS NULL;
   END IF;
   -- Preserve existing records; bootstrap never overwrites prior manual work.
   UPDATE public.fleet_vehicles SET source_data=r WHERE id=vid AND source_data IS NULL;
   IF NOT EXISTS(SELECT 1 FROM public.fleet_vehicle_responsibility_events WHERE vehicle_id=vid) AND nullif(trim(r->>'responsible_name'),'') IS NOT NULL THEN
    INSERT INTO public.fleet_vehicle_responsibility_events(vehicle_id,responsible_name_snapshot,effective_date,recorded_by,recorded_by_name)
    VALUES(vid,r->>'responsible_name',NULL,auth.uid(),public.fleet_actor_name(auth.uid()));
   END IF;
  ELSE
   INSERT INTO public.fleet_maintenance_history(plate,occurred_on,odometer_km,supplier,invoice_number,works,source_key,raw_data)
   VALUES(coalesce(r->>'plate',''),(r->>'occurred_on')::date,(r->>'odometer_km')::bigint,r->>'supplier',r->>'invoice_number',r->'works',r->>'source_key',r->'raw_data');
  END IF; n:=n+1;
 END LOOP;
 INSERT INTO public.fleet_initial_loads(kind,source_name,checksum,row_count) VALUES(p_kind,p_source,p_checksum,n); RETURN n;
END $$;

-- No role/section grants are added. Only existing authorized accounts can use these functions.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure AS signature,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
 ('fleet_is_manager','fleet_can_submit','fleet_assert_write_access','fleet_list_responsible_candidates','fleet_edit_vehicle','fleet_save_vehicle','fleet_reserve_invoice','fleet_finalize_invoice','fleet_set_invoice_amount','fleet_can_upload_path','fleet_import_fuel_entries','fleet_load_initial','fleet_link_expense','fleet_refresh_links','fleet_audit_vehicle') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  IF f.proname NOT IN ('fleet_assert_write_access','fleet_link_expense','fleet_refresh_links','fleet_audit_vehicle') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature); END IF;
 END LOOP;
END $$;
COMMIT;
