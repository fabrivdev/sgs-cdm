BEGIN;
-- Equivalencia de números sin reescribir el historial ni las facturas existentes.
CREATE OR REPLACE FUNCTION public.fleet_invoice_number_key(value text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE parts text[]; v text := trim(value);
BEGIN
 parts := regexp_match(v, '^([0-9]{1,3})[[:space:]]*-[[:space:]]*([0-9]{1,3})[[:space:]]*-[[:space:]]*([0-9]{1,7})$');
 IF parts IS NOT NULL THEN
  RETURN lpad(parts[1],3,'0') || lpad(parts[2],3,'0') || lpad(parts[3],7,'0');
 END IF;
 RETURN regexp_replace(upper(v),'[^A-Z0-9]','','g');
END $$;
-- Si existen duplicados equivalentes, se aborta todo: no fusionar ni borrar registros.
CREATE UNIQUE INDEX fleet_invoice_complete_number_key ON public.fleet_maintenance_invoices(
 coalesce('ruc:'||regexp_replace(supplier_tax_id,'[^0-9]','','g'),'name:'||lower(trim(supplier))),
 public.fleet_invoice_number_key(invoice_number)
) WHERE status <> 'void';
CREATE OR REPLACE FUNCTION public.fleet_require_complete_invoice_number()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.invoice_number IS NOT DISTINCT FROM OLD.invoice_number THEN RETURN NEW; END IF;
 END IF;
 IF NEW.invoice_number !~ '^[0-9]{3}-[0-9]{3}-[0-9]{7}$' THEN
  RAISE EXCEPTION 'Completá el número de factura con el formato 001-001-0000001.' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fleet_complete_invoice_number BEFORE INSERT OR UPDATE OF invoice_number
 ON public.fleet_maintenance_invoices FOR EACH ROW EXECUTE FUNCTION public.fleet_require_complete_invoice_number();
COMMIT;
