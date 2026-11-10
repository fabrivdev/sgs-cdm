BEGIN;
-- Exact lookup is independent of the limited prefix suggestions.
CREATE FUNCTION public.fleet_supplier_identity(p_ruc text)
RETURNS TABLE(ruc text,razon_social text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.fleet_can_submit() THEN RAISE EXCEPTION 'Sin acceso a Flota'; END IF;
 RETURN QUERY SELECT DISTINCT btrim(p.ruc),btrim(p.razon_social)
 FROM public.totvs_proveedores p
 WHERE regexp_replace(p.ruc,'[^0-9]','','g')=regexp_replace(p_ruc,'[^0-9]','','g')
 AND length(regexp_replace(p_ruc,'[^0-9]','','g')) BETWEEN 3 AND 20
 ORDER BY 1,2 LIMIT 15;
END $$;
REVOKE ALL ON FUNCTION public.fleet_supplier_identity(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fleet_supplier_identity(text) TO authenticated;
CREATE OR REPLACE FUNCTION public.fleet_invoice_supplier_from_master() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE canonical record;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.supplier IS NOT DISTINCT FROM OLD.supplier AND NEW.supplier_tax_id IS NOT DISTINCT FROM OLD.supplier_tax_id THEN RETURN NEW; END IF;
 END IF;
 IF coalesce(NEW.supplier_tax_id,'') !~ '^[0-9][0-9 .-]{2,19}$' THEN RAISE EXCEPTION 'Ingresá el RUC del proveedor'; END IF;
 IF coalesce(length(btrim(NEW.supplier)),0) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Ingresá el nombre del proveedor'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.totvs_proveedores p WHERE regexp_replace(p.ruc,'[^0-9]','','g')=regexp_replace(NEW.supplier_tax_id,'[^0-9]','','g')) THEN
  NEW.supplier:=btrim(NEW.supplier); NEW.supplier_tax_id:=btrim(NEW.supplier_tax_id);
  RETURN NEW;
 END IF;
 SELECT btrim(p.ruc) AS ruc,btrim(p.razon_social) AS name INTO canonical
 FROM public.totvs_proveedores p
 WHERE regexp_replace(p.ruc,'[^0-9]','','g')=regexp_replace(NEW.supplier_tax_id,'[^0-9]','','g')
 AND btrim(p.razon_social)=btrim(NEW.supplier)
 ORDER BY p.codigo,p.tienda LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Seleccioná el proveedor del maestro para este RUC'; END IF;
 NEW.supplier_tax_id:=canonical.ruc; NEW.supplier:=canonical.name;
 RETURN NEW;
END $$;
COMMIT;
