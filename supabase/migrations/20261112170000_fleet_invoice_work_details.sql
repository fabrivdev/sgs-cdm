BEGIN;

CREATE OR REPLACE FUNCTION public.fleet_reserve_invoice_original(p_id uuid,p_data jsonb) RETURNS text
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
   AND (NOT (p_data ? 'odometer_km') OR existing.odometer_km IS NOT DISTINCT FROM nullif(p_data->>'odometer_km','')::bigint)
   AND (NOT (p_data ? 'performed_on') OR existing.performed_on IS NOT DISTINCT FROM nullif(p_data->>'performed_on','')::date)
   AND existing.description=trim(p_data->>'description')
   AND existing.categories @> ARRAY(SELECT jsonb_array_elements_text(p_data->'categories'))
   AND existing.categories <@ ARRAY(SELECT jsonb_array_elements_text(p_data->'categories'))
   AND existing.size_bytes=(p_data->>'size_bytes')::bigint AND existing.mime_type=p_data->>'mime_type'
   AND existing.filename=p_data->>'filename' THEN RETURN existing.storage_path; END IF;
  RAISE EXCEPTION 'La factura ya fue registrada. Contactá a Jefatura.';
 END IF;
 path:=auth.uid()::text||'/'||p_id::text;
 IF coalesce(p_data->>'supplier_tax_id','') !~ '^[0-9][0-9 .-]{2,19}$' THEN RAISE EXCEPTION 'Ingresá el RUC del proveedor'; END IF;
 INSERT INTO public.fleet_maintenance_invoices(id,supplier_tax_id,plate,supplier,invoice_number,invoice_date,categories,description,filename,mime_type,size_bytes,storage_path,odometer_km,performed_on)
 VALUES(p_id,trim(p_data->>'supplier_tax_id'),trim(p_data->>'plate'),trim(p_data->>'supplier'),trim(p_data->>'invoice_number'),(p_data->>'invoice_date')::date,
 ARRAY(SELECT DISTINCT jsonb_array_elements_text(p_data->'categories')),trim(p_data->>'description'),p_data->>'filename',p_data->>'mime_type',(p_data->>'size_bytes')::bigint,path,nullif(p_data->>'odometer_km','')::bigint,nullif(p_data->>'performed_on','')::date);
 RETURN path;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'La factura ya fue registrada. Contactá a Jefatura.';
END $$;

CREATE OR REPLACE FUNCTION public.fleet_update_reserved_invoice(p_id uuid,p_data jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE oldrow public.fleet_maintenance_invoices;
BEGIN
 IF NOT public.fleet_can_submit() THEN RAISE EXCEPTION 'Sin permiso' USING ERRCODE='42501'; END IF;
 SELECT * INTO oldrow FROM public.fleet_maintenance_invoices WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR oldrow.created_by<>auth.uid() THEN RAISE EXCEPTION 'Intento no disponible; verificá con Jefatura si ya se completó'; END IF;
 IF oldrow.status='uploaded' AND oldrow.version=oldrow.reservation_version
  AND oldrow.plate=trim(p_data->>'plate') AND oldrow.supplier=trim(p_data->>'supplier') AND oldrow.supplier_tax_id=trim(p_data->>'supplier_tax_id')
  AND oldrow.invoice_number=trim(p_data->>'invoice_number') AND oldrow.invoice_date=(p_data->>'invoice_date')::date
  AND (NOT (p_data ? 'odometer_km') OR oldrow.odometer_km IS NOT DISTINCT FROM nullif(p_data->>'odometer_km','')::bigint)
  AND (NOT (p_data ? 'performed_on') OR oldrow.performed_on IS NOT DISTINCT FROM nullif(p_data->>'performed_on','')::date)
  AND oldrow.description=trim(p_data->>'description') AND to_jsonb(oldrow.categories) @> (p_data->'categories') AND to_jsonb(oldrow.categories) <@ (p_data->'categories')
  AND oldrow.filename=p_data->>'filename' AND oldrow.size_bytes=(p_data->>'size_bytes')::bigint AND oldrow.mime_type=p_data->>'mime_type' THEN RETURN oldrow.storage_path; END IF;
 IF oldrow.status<>'pending' THEN RAISE EXCEPTION 'La factura ya fue completada o anulada'; END IF;
 IF oldrow.version<>oldrow.reservation_version THEN RAISE EXCEPTION 'Jefatura modificó esta carga. Contactá a Jefatura'; END IF;
 IF length(public.fleet_normalize_plate(p_data->>'plate')) NOT BETWEEN 3 AND 12 THEN RAISE EXCEPTION 'Chapa inválida'; END IF;
 IF coalesce(p_data->>'supplier_tax_id','') !~ '^[0-9][0-9 .-]{2,19}$' THEN RAISE EXCEPTION 'Ingresá el RUC del proveedor'; END IF;
 IF oldrow.filename IS DISTINCT FROM p_data->>'filename' OR oldrow.mime_type IS DISTINCT FROM p_data->>'mime_type' OR oldrow.size_bytes IS DISTINCT FROM (p_data->>'size_bytes')::bigint THEN RAISE EXCEPTION 'Seleccioná el mismo archivo o descartá este intento'; END IF;
 UPDATE public.fleet_maintenance_invoices SET
 plate=trim(p_data->>'plate'),supplier_tax_id=trim(p_data->>'supplier_tax_id'),supplier=trim(p_data->>'supplier'),
 invoice_number=trim(p_data->>'invoice_number'),invoice_date=(p_data->>'invoice_date')::date,
 description=trim(p_data->>'description'),categories=ARRAY(SELECT DISTINCT jsonb_array_elements_text(p_data->'categories')),
 odometer_km=CASE WHEN p_data ? 'odometer_km' THEN nullif(p_data->>'odometer_km','')::bigint ELSE oldrow.odometer_km END,
 performed_on=CASE WHEN p_data ? 'performed_on' THEN nullif(p_data->>'performed_on','')::date ELSE oldrow.performed_on END,
 version=version+1,reservation_version=version+1 WHERE id=p_id;
 INSERT INTO public.fleet_invoice_audit(invoice_id,before_data,after_data,reason)
 SELECT p_id,to_jsonb(oldrow),to_jsonb(i),'Corrección del intento de carga' FROM public.fleet_maintenance_invoices i WHERE id=p_id;
 RETURN oldrow.storage_path;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'La factura ya fue registrada';
END $$;

REVOKE ALL ON FUNCTION public.fleet_reserve_invoice_original(uuid,jsonb) FROM PUBLIC,anon,authenticated;

COMMIT;
