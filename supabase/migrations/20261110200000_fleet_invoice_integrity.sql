BEGIN;
-- Existing records are retained; the constraint protects all future writes.
ALTER TABLE public.fleet_maintenance_invoices ADD CONSTRAINT fleet_invoice_nonnegative_amount CHECK (amount >= 0) NOT VALID;
ALTER TABLE public.fleet_maintenance_invoices ADD COLUMN reservation_version integer NOT NULL DEFAULT 1;
DROP FUNCTION public.fleet_set_invoice_amount(uuid,numeric,text);
CREATE FUNCTION public.fleet_set_invoice_amount(p_id uuid,p_amount numeric,p_currency text,p_version integer,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE oldrow public.fleet_maintenance_invoices;
BEGIN
 PERFORM public.fleet_assert_write_access();
 IF p_amount IS NULL OR p_amount < 0 OR p_amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'El importe debe ser mayor o igual a cero'; END IF;
 IF p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Moneda inválida'; END IF;
 IF coalesce(length(trim(p_reason)),0)=0 THEN RAISE EXCEPTION 'Ingresá el motivo'; END IF;
 SELECT * INTO oldrow FROM public.fleet_maintenance_invoices WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR oldrow.status<>'uploaded' THEN RAISE EXCEPTION 'Factura no disponible'; END IF;
 IF oldrow.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'La factura cambió. Cerrá y volvé a abrir el detalle'; END IF;
 UPDATE public.fleet_maintenance_invoices SET amount=p_amount,currency=p_currency,version=version+1 WHERE id=p_id;
 INSERT INTO public.fleet_invoice_audit(invoice_id,before_data,after_data,reason)
 SELECT p_id,to_jsonb(oldrow),to_jsonb(i),trim(p_reason) FROM public.fleet_maintenance_invoices i WHERE id=p_id;
END $$;
CREATE FUNCTION public.fleet_update_reserved_invoice(p_id uuid,p_data jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE oldrow public.fleet_maintenance_invoices;
BEGIN
 IF NOT public.fleet_can_submit() THEN RAISE EXCEPTION 'Sin permiso' USING ERRCODE='42501'; END IF;
 SELECT * INTO oldrow FROM public.fleet_maintenance_invoices WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR oldrow.created_by<>auth.uid() THEN RAISE EXCEPTION 'Intento no disponible; verificá con Jefatura si ya se completó'; END IF;
 IF oldrow.status='uploaded' AND oldrow.version=oldrow.reservation_version
  AND oldrow.plate=trim(p_data->>'plate') AND oldrow.supplier=trim(p_data->>'supplier') AND oldrow.supplier_tax_id=trim(p_data->>'supplier_tax_id')
  AND oldrow.invoice_number=trim(p_data->>'invoice_number') AND oldrow.invoice_date=(p_data->>'invoice_date')::date
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
 version=version+1,reservation_version=version+1 WHERE id=p_id;
 INSERT INTO public.fleet_invoice_audit(invoice_id,before_data,after_data,reason)
 SELECT p_id,to_jsonb(oldrow),to_jsonb(i),'Corrección del intento de carga' FROM public.fleet_maintenance_invoices i WHERE id=p_id;
 RETURN oldrow.storage_path;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'La factura ya fue registrada';
END $$;
CREATE FUNCTION public.fleet_discard_reserved_invoice(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE oldrow public.fleet_maintenance_invoices;
BEGIN
 IF NOT public.fleet_can_submit() THEN RAISE EXCEPTION 'Sin permiso' USING ERRCODE='42501'; END IF;
 SELECT * INTO oldrow FROM public.fleet_maintenance_invoices WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR oldrow.created_by<>auth.uid() THEN RAISE EXCEPTION 'Intento no disponible'; END IF;
 IF oldrow.status='void' THEN RETURN; END IF;
 IF oldrow.status<>'pending' OR oldrow.version<>oldrow.reservation_version THEN RAISE EXCEPTION 'La factura cambió; contactá a Jefatura'; END IF;
 UPDATE public.fleet_maintenance_invoices SET status='void',version=version+1 WHERE id=p_id;
 INSERT INTO public.fleet_invoice_audit(invoice_id,before_data,after_data,reason)
 SELECT p_id,to_jsonb(oldrow),to_jsonb(i),'Intento descartado por su autor' FROM public.fleet_maintenance_invoices i WHERE id=p_id;
END $$;
-- Never allow the initial endpoint to silently discard edited retry metadata.
ALTER FUNCTION public.fleet_reserve_invoice(uuid,jsonb) RENAME TO fleet_reserve_invoice_original;
REVOKE ALL ON FUNCTION public.fleet_reserve_invoice_original(uuid,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.fleet_reserve_invoice(p_id uuid,p_data jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.fleet_maintenance_invoices WHERE id=p_id AND status='pending') THEN
 RETURN public.fleet_update_reserved_invoice(p_id,p_data);
 END IF;
 RETURN public.fleet_reserve_invoice_original(p_id,p_data);
END $$;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('fleet_set_invoice_amount','fleet_update_reserved_invoice','fleet_discard_reserved_invoice','fleet_reserve_invoice') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
 END LOOP;
END $$;
ALTER FUNCTION public.fleet_import_fuel_entries(jsonb) RENAME TO fleet_import_fuel_entries_original;
REVOKE ALL ON FUNCTION public.fleet_import_fuel_entries_original(jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.fleet_import_fuel_entries(p_rows jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.fleet_assert_write_access();
 IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' THEN RAISE EXCEPTION 'Archivo inválido'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) r WHERE coalesce(r->>'currency','') !~ '^[A-Z]{3}$') THEN RAISE EXCEPTION 'Elegí la moneda para todas las cargas'; END IF;
 RETURN public.fleet_import_fuel_entries_original(p_rows);
END $$;
REVOKE ALL ON FUNCTION public.fleet_import_fuel_entries(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_import_fuel_entries(jsonb) TO authenticated;
-- Compatibility with the parallel Drizzle 0011 migration. All old names route
-- through the audited implementations; discarding must NEVER delete a row.
CREATE OR REPLACE FUNCTION public.fleet_update_pending_invoice(p_id uuid,p_data jsonb) RETURNS text
LANGUAGE sql SECURITY INVOKER SET search_path=public,pg_temp AS $$ SELECT public.fleet_update_reserved_invoice(p_id,p_data) $$;
CREATE OR REPLACE FUNCTION public.fleet_discard_pending_invoice(p_id uuid) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path=public,pg_temp AS $$ SELECT public.fleet_discard_reserved_invoice(p_id) $$;
CREATE OR REPLACE FUNCTION public.fleet_set_invoice_amount_v2(p_id uuid,p_version integer,p_amount numeric,p_currency text,p_reason text) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM public.fleet_set_invoice_amount(p_id,p_amount,p_currency,p_version,p_reason); RETURN p_version+1;
END $$;
REVOKE ALL ON FUNCTION public.fleet_update_pending_invoice(uuid,jsonb),public.fleet_discard_pending_invoice(uuid),public.fleet_set_invoice_amount_v2(uuid,integer,numeric,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_update_pending_invoice(uuid,jsonb),public.fleet_discard_pending_invoice(uuid),public.fleet_set_invoice_amount_v2(uuid,integer,numeric,text,text) TO authenticated;
COMMIT;
