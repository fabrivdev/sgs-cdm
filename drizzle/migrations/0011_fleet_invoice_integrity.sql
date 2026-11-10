ALTER TABLE public.fleet_maintenance_invoices ADD CONSTRAINT fleet_invoice_amount_non_negative CHECK (amount IS NULL OR amount >= 0);

CREATE OR REPLACE FUNCTION public.fleet_set_invoice_amount_v2(p_id uuid, p_version integer, p_amount numeric, p_currency text, p_reason text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE oldrow jsonb; cur integer; BEGIN
 PERFORM public.fleet_assert_write_access();
 IF p_amount IS NULL OR p_amount < 0 THEN RAISE EXCEPTION 'El importe debe ser mayor o igual a cero'; END IF;
 IF coalesce(p_currency,'') !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Moneda inválida'; END IF;
 IF length(trim(coalesce(p_reason,''))) < 3 THEN RAISE EXCEPTION 'Indicá el motivo del cambio'; END IF;
 SELECT to_jsonb(i), i.version INTO oldrow, cur FROM public.fleet_maintenance_invoices i WHERE id=p_id AND status='uploaded' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
 IF cur <> p_version THEN RAISE EXCEPTION 'Otra persona modificó esta factura. Recargá antes de guardar' USING ERRCODE='40001'; END IF;
 UPDATE public.fleet_maintenance_invoices SET amount=p_amount, currency=p_currency, version=version+1 WHERE id=p_id;
 INSERT INTO public.fleet_invoice_audit(invoice_id,before_data,after_data)
 VALUES(p_id, oldrow, jsonb_build_object('amount',p_amount,'currency',p_currency,'reason',trim(p_reason),'version',cur+1));
 RETURN cur+1;
END $$;
REVOKE ALL ON FUNCTION public.fleet_set_invoice_amount_v2(uuid,integer,numeric,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fleet_set_invoice_amount_v2(uuid,integer,numeric,text,text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fleet_set_invoice_amount(uuid,numeric,text) FROM authenticated;
COMMENT ON FUNCTION public.fleet_set_invoice_amount(uuid,numeric,text) IS 'DEPRECATED: replaced by fleet_set_invoice_amount_v2 (version + reason)';

-- Retry of an own pending reservation now persists edited metadata.
CREATE OR REPLACE FUNCTION public.fleet_update_pending_invoice(p_id uuid, p_data jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE existing public.fleet_maintenance_invoices; BEGIN
 IF NOT public.fleet_can_submit() THEN RAISE EXCEPTION 'Sin permiso para cargar facturas' USING ERRCODE='42501'; END IF;
 SELECT * INTO existing FROM public.fleet_maintenance_invoices WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR existing.created_by<>auth.uid() THEN RAISE EXCEPTION 'Solicitud no disponible'; END IF;
 IF existing.status<>'pending' OR existing.version>1 THEN RAISE EXCEPTION 'La carga ya no puede editarse. Iniciá una nueva carga'; END IF;
 IF length(public.fleet_normalize_plate(p_data->>'plate')) NOT BETWEEN 3 AND 12 THEN RAISE EXCEPTION 'Chapa inválida'; END IF;
 UPDATE public.fleet_maintenance_invoices SET
  plate=trim(p_data->>'plate'),
  supplier=trim(p_data->>'supplier'),
  supplier_tax_id=coalesce(nullif(trim(p_data->>'supplier_tax_id'),''),supplier_tax_id),
  invoice_number=trim(p_data->>'invoice_number'),
  invoice_date=(p_data->>'invoice_date')::date,
  categories=ARRAY(SELECT DISTINCT jsonb_array_elements_text(p_data->'categories')),
  description=trim(p_data->>'description'),
  filename=coalesce(p_data->>'filename',filename),
  mime_type=coalesce(p_data->>'mime_type',mime_type),
  size_bytes=coalesce((p_data->>'size_bytes')::bigint,size_bytes)
 WHERE id=p_id;
 RETURN existing.storage_path;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'La factura ya fue registrada. Contactá a Jefatura.';
END $$;
REVOKE ALL ON FUNCTION public.fleet_update_pending_invoice(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fleet_update_pending_invoice(uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.fleet_discard_pending_invoice(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.fleet_can_submit() THEN RAISE EXCEPTION 'Sin permiso' USING ERRCODE='42501'; END IF;
 DELETE FROM public.fleet_maintenance_invoices WHERE id=p_id AND created_by=auth.uid() AND status='pending' AND version=1;
END $$;
REVOKE ALL ON FUNCTION public.fleet_discard_pending_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fleet_discard_pending_invoice(uuid) TO authenticated;