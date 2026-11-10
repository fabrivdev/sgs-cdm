BEGIN;
-- Expose only the supplier identity needed by invoice submitters, not the whole master.
CREATE INDEX IF NOT EXISTS totvs_proveedores_fleet_ruc_idx ON public.totvs_proveedores
 ((regexp_replace(ruc,'[^0-9]','','g')) text_pattern_ops);
CREATE FUNCTION public.fleet_search_suppliers(p_ruc text)
RETURNS TABLE(ruc text,razon_social text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q text := regexp_replace(coalesce(p_ruc,''),'[^0-9]','','g');
BEGIN
 IF NOT public.fleet_can_submit() THEN RAISE EXCEPTION 'Sin acceso a Flota'; END IF;
 IF length(q)<3 OR length(q)>20 THEN RETURN; END IF;
 RETURN QUERY SELECT DISTINCT btrim(p.ruc),btrim(p.razon_social)
 FROM public.totvs_proveedores p
 WHERE regexp_replace(p.ruc,'[^0-9]','','g') LIKE q||'%' AND btrim(p.razon_social)<>''
 ORDER BY 1,2 LIMIT 15;
END $$;
REVOKE ALL ON FUNCTION public.fleet_search_suppliers(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fleet_search_suppliers(text) TO authenticated;

CREATE FUNCTION public.fleet_invoice_supplier_from_master() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE canonical record;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.supplier IS NOT DISTINCT FROM OLD.supplier AND NEW.supplier_tax_id IS NOT DISTINCT FROM OLD.supplier_tax_id THEN RETURN NEW; END IF;
 END IF;
 SELECT btrim(p.ruc) AS ruc,btrim(p.razon_social) AS name INTO canonical
 FROM public.totvs_proveedores p
 WHERE regexp_replace(p.ruc,'[^0-9]','','g')=regexp_replace(NEW.supplier_tax_id,'[^0-9]','','g')
 AND btrim(p.razon_social)=btrim(NEW.supplier)
 ORDER BY p.codigo,p.tienda LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Seleccioná un RUC del maestro de proveedores'; END IF;
 NEW.supplier_tax_id:=canonical.ruc; NEW.supplier:=canonical.name;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fleet_invoice_supplier_from_master() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER fleet_invoice_supplier_master BEFORE INSERT OR UPDATE OF supplier,supplier_tax_id
 ON public.fleet_maintenance_invoices FOR EACH ROW EXECUTE FUNCTION public.fleet_invoice_supplier_from_master();
COMMIT;
