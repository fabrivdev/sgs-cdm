BEGIN;

-- This changes equivalent billed hours only. Financial amounts continue to
-- come from Sales unchanged. The importer must be rerun to supply the source
-- work hours and total for wrongly GS-issued MA01 blocks.
CREATE OR REPLACE FUNCTION public.service_order_labor_hours_v1(
  p_rates jsonb,p_invoice text,p_total numeric,p_reference_total numeric,p_credit boolean
) RETURNS numeric LANGUAGE plpgsql IMMUTABLE
SET search_path=public,pg_temp
AS $$
DECLARE r jsonb; v_rate numeric; v_amount numeric; v_billed_quantity numeric; v_source_total numeric;
  v_source_hours numeric; v_sum numeric:=0; v_hours numeric:=0;
  v_gs_hours numeric:=0; v_rates numeric[]:=ARRAY[]::numeric[];
  v_count integer:=0; v_positive integer:=0; v_gs_billed integer:=0; v_currency text;
  v_repeated_full_allocation boolean:=true;
BEGIN
  IF jsonb_typeof(p_rates) IS DISTINCT FROM 'array' OR nullif(btrim(p_invoice),'') IS NULL
    OR p_total IS NULL OR p_reference_total IS NULL OR p_reference_total<0
    OR p_total::text IN ('NaN','Infinity','-Infinity')
    OR p_reference_total::text IN ('NaN','Infinity','-Infinity') THEN RETURN NULL; END IF;

  FOR r IN SELECT value FROM jsonb_array_elements(p_rates)
    WHERE upper(btrim(value->>'invoice'))=upper(btrim(p_invoice)) LOOP
    IF coalesce(r->>'timeType','') NOT IN ('Cliente','Garantia','Interno')
      OR coalesce(r->>'currency','') NOT IN ('USD','GS')
      OR jsonb_typeof(r->'rate') IS DISTINCT FROM 'number'
      OR jsonb_typeof(r->'billedAmount') IS DISTINCT FROM 'number' THEN RETURN NULL; END IF;
    IF v_currency IS NOT NULL AND v_currency<>r->>'currency' THEN RETURN NULL; END IF;
    v_currency:=r->>'currency';
    v_rate:=(r->>'rate')::numeric; v_amount:=(r->>'billedAmount')::numeric;
    IF v_rate<=0 OR v_amount<0 THEN RETURN NULL; END IF;
    v_count:=v_count+1; v_sum:=v_sum+v_amount; v_hours:=v_hours+v_amount/v_rate;
    IF NOT v_rate=ANY(v_rates) THEN v_rates:=array_append(v_rates,v_rate); END IF;

    IF v_amount>0 THEN
      v_positive:=v_positive+1;
      IF abs(v_amount-p_reference_total)>0.02 THEN v_repeated_full_allocation:=false; END IF;
    END IF;
    IF v_currency='GS' THEN
      IF jsonb_typeof(r->'billedQuantity') IS DISTINCT FROM 'number' THEN RETURN NULL; END IF;
      v_billed_quantity:=(r->>'billedQuantity')::numeric;
      IF v_billed_quantity<0 OR (v_amount>0 AND v_billed_quantity=0) THEN RETURN NULL; END IF;
    END IF;
    IF v_currency='GS' AND v_billed_quantity>0 THEN
      -- TOTFAC and the actual invoice can be cents after the wrong currency
      -- choice, even zero after rounding. CNTFAC identifies invoiced blocks.
      -- The OS block still contains its own tariff, work hours and
      -- line value. Require all three to agree; never use a guessed FX rate.
      IF jsonb_typeof(r->'sourceWorkHours') IS DISTINCT FROM 'number'
        OR jsonb_typeof(r->'sourceTotal') IS DISTINCT FROM 'number' THEN RETURN NULL; END IF;
      v_source_hours:=(r->>'sourceWorkHours')::numeric;
      v_source_total:=(r->>'sourceTotal')::numeric;
      IF v_source_hours<=0 OR v_source_total<=0
        OR abs(v_rate*v_source_hours-v_source_total)>0.02 THEN RETURN NULL; END IF;
      v_gs_hours:=v_gs_hours+v_source_total/v_rate;
      v_gs_billed:=v_gs_billed+1;
    END IF;
  END LOOP;
  IF v_count=0 THEN RETURN NULL; END IF;

  IF v_currency='GS' THEN
    IF v_gs_billed=0 THEN RETURN CASE WHEN p_total=0 THEN 0 ELSE NULL END; END IF;
    IF p_credit THEN
      -- A credit has no separate OS work block. Only a single original rate
      -- can be prorated against its linked invoice without inventing a split.
      IF cardinality(v_rates)<>1 OR p_reference_total=0 THEN RETURN NULL; END IF;
      RETURN v_gs_hours*p_total/p_reference_total;
    END IF;
    RETURN v_gs_hours;
  END IF;

  -- An export can repeat the same entire invoice amount on several clock
  -- blocks (with the same tariff). Reconcile it once, not once per block.
  IF abs(v_sum-p_reference_total)>0.02
    AND NOT (cardinality(v_rates)=1 AND v_positive>=2 AND v_repeated_full_allocation)
    THEN RETURN NULL; END IF;
  IF cardinality(v_rates)=1 THEN RETURN p_total/v_rates[1]; END IF;
  IF p_credit THEN RETURN NULL; END IF;
  IF v_sum=0 AND p_total=0 THEN RETURN 0; END IF;
  RETURN v_hours*p_total/nullif(v_sum,0);
END;
$$;
REVOKE ALL ON FUNCTION public.service_order_labor_hours_v1(jsonb,text,numeric,numeric,boolean) FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
