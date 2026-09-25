BEGIN;

-- Read-only correction; reimport OS with the updated importer to retain every
-- MA01 tariff/allocation. Existing totals alone cannot reconstruct mixed rates.
CREATE INDEX IF NOT EXISTS idx_billing_service_order_date
  ON public.facturacion_lineas_importadas (upper(btrim(raw_data->>'linked_service_order')),fecha_factura);
CREATE INDEX IF NOT EXISTS idx_os_number_normalized
  ON public.ordenes_servicio_importadas (upper(btrim(os_numero)));


-- OS PRECIO is an hourly tariff; invoice VALOR_UNITARIO may be a whole job.
-- Verify the source billed allocations (TOTFAC, same reported monetary basis)
-- against actual Sales labor. No rate defaults, global averages or FX guesses.
CREATE OR REPLACE FUNCTION public.service_order_labor_hours_v1(
  p_rates jsonb,p_invoice text,p_total numeric,p_reference_total numeric,p_credit boolean
) RETURNS numeric LANGUAGE plpgsql IMMUTABLE
SET search_path=public,pg_temp
AS $$
DECLARE r jsonb; v_rate numeric; v_amount numeric; v_sum numeric:=0;
  v_hours numeric:=0; v_rates numeric[]:=ARRAY[]::numeric[]; v_count integer:=0;
BEGIN
  IF jsonb_typeof(p_rates) IS DISTINCT FROM 'array' OR nullif(btrim(p_invoice),'') IS NULL
    OR p_total IS NULL OR p_reference_total IS NULL OR p_reference_total<0
    OR p_total::text IN ('NaN','Infinity','-Infinity')
    OR p_reference_total::text IN ('NaN','Infinity','-Infinity') THEN RETURN NULL; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(p_rates) WHERE upper(btrim(value->>'invoice'))=upper(btrim(p_invoice)) LOOP
    IF coalesce(r->>'timeType','') NOT IN ('Cliente','Garantia','Interno')
      OR coalesce(r->>'currency','')<>'USD'
      OR jsonb_typeof(r->'rate') IS DISTINCT FROM 'number'
      OR jsonb_typeof(r->'billedAmount') IS DISTINCT FROM 'number' THEN RETURN NULL; END IF;
    v_rate:=(r->>'rate')::numeric; v_amount:=(r->>'billedAmount')::numeric;
    IF v_rate<=0 OR v_amount<0 THEN RETURN NULL; END IF;
    v_count:=v_count+1; v_sum:=v_sum+v_amount; v_hours:=v_hours+v_amount/v_rate;
    IF NOT v_rate=ANY(v_rates) THEN v_rates:=array_append(v_rates,v_rate); END IF;
  END LOOP;
  IF v_count=0 OR abs(v_sum-p_reference_total)>0.02 THEN RETURN NULL; END IF;
  -- Credits inherit only an unambiguous original tariff. A global credit for
  -- mixed tariffs has no verifiable allocation, so do not invent one.
  IF cardinality(v_rates)=1 THEN RETURN p_total/v_rates[1]; END IF;
  IF p_credit THEN RETURN NULL; END IF;
  IF v_sum=0 AND p_total=0 THEN RETURN 0; END IF;
  -- Allocation is explicit by source line/type/rate and reconciled to Sales;
  -- adjust only the <=2-cent rounding residue, never an unknown discount split.
  RETURN v_hours*p_total/nullif(v_sum,0);
END;
$$;
REVOKE ALL ON FUNCTION public.service_order_labor_hours_v1(jsonb,text,numeric,numeric,boolean) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.service_orders_billing_v2(p_os_numeros text[], p_hasta date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '25s'
SET plan_cache_mode = 'force_custom_plan'
AS $$
DECLARE v_desde date; v_result jsonb; v_keys text[];
BEGIN
  IF auth.uid() IS NULL
    OR NOT public.has_section_access(auth.uid(),'servicios.ordenes')
    OR NOT public.has_section_access(auth.uid(),'servicios.ventas') THEN
    RAISE EXCEPTION 'Sin acceso a facturacion de OS' USING ERRCODE='42501';
  END IF;
  IF p_hasta IS NULL OR p_os_numeros IS NULL OR cardinality(p_os_numeros)>250
    OR EXISTS(SELECT 1 FROM unnest(p_os_numeros) n WHERE nullif(btrim(n),'') IS NULL) THEN
    RAISE EXCEPTION 'Parametros de facturacion invalidos' USING ERRCODE='22023';
  END IF;
  SELECT array_agg(DISTINCT upper(btrim(n))) INTO v_keys FROM unnest(p_os_numeros) n;
  -- The legacy invoice + branch + year resolver is needed only for legacy OS.
  SELECT min(date_trunc('year',o.fecha_emision_factura AT TIME ZONE 'America/Asuncion')::date)
    INTO v_desde FROM public.ordenes_servicio_importadas o
    WHERE upper(btrim(o.os_numero))=ANY(v_keys)
      AND o.fecha_emision_factura IS NOT NULL
      AND o.fecha_emision_factura::date<=date '2026-06-30';

  WITH identidades AS MATERIALIZED (
    SELECT s.os,count(o.os_numero) AS coincidencias
    FROM unnest(v_keys) s(os) LEFT JOIN public.ordenes_servicio_importadas o ON upper(btrim(o.os_numero))=s.os
    GROUP BY s.os
  ), actuales AS MATERIALIZED (
    SELECT f.*,i.os AS os_clave FROM public.facturacion_lineas_importadas f
    JOIN identidades i ON i.os=upper(btrim(f.raw_data->>'linked_service_order')) AND i.coincidencias=1
    WHERE f.fecha_factura >= date '2026-07-01' AND f.fecha_factura < (p_hasta+1)
      AND upper(trim(coalesce(f.moneda,'USD')))='USD'
  ), clasificados AS (
    SELECT f.*,
      -- Same ordered current-system classification as ventas_area_movimientos_base
      -- (20260916180000). Regression test compares against that canonical function.
      CASE
        WHEN public.ventas_es_otro_comercial(concat_ws(' ',f.mercaderia,f.observacion),concat_ws(' ',f.grupo_normalizado,f.subgrupo_original)) THEN 'Otros'
        WHEN left(upper(trim(coalesce(f.cod_mercaderia,''))),5)='VEIC_'
          OR (lower(coalesce(f.mercaderia,'')||' '||coalesce(f.observacion,'')) LIKE '%tipo:%'
            AND lower(coalesce(f.mercaderia,'')||' '||coalesce(f.observacion,'')) LIKE '%modelo:%'
            AND (lower(coalesce(f.mercaderia,'')||' '||coalesce(f.observacion,'')) LIKE '%casis:%'
              OR lower(coalesce(f.mercaderia,'')||' '||coalesce(f.observacion,'')) LIKE '%chasis:%')) THEN 'Maquinarias'
        WHEN lower(trim(coalesce(f.grupo_normalizado,f.subgrupo_original,''))) LIKE '%maquin%' THEN 'Maquinarias'
        WHEN lower(trim(coalesce(f.grupo_normalizado,f.subgrupo_original,''))) LIKE '%repuesto%' THEN 'Repuestos'
        WHEN lower(trim(coalesce(f.grupo_normalizado,f.subgrupo_original,''))) LIKE '%kilometr%' THEN 'Kilometraje'
        WHEN lower(trim(coalesce(f.grupo_normalizado,f.subgrupo_original,'')||' '||coalesce(f.mercaderia,'')||' '||coalesce(f.observacion,''))) LIKE '%tercero%' THEN 'Terceros'
        WHEN lower(trim(coalesce(f.grupo_normalizado,f.subgrupo_original,''))) LIKE '%servic%'
          OR lower(trim(coalesce(f.grupo_normalizado,f.subgrupo_original,''))) LIKE '%mano de obra%' THEN 'Servicio'
        ELSE 'Otros'
      END AS concepto
    FROM actuales f
  ), periodos_historicos AS (
    SELECT greatest(q::date,v_desde) AS desde,
      least((q+interval '3 months'-interval '1 day')::date,p_hasta,date '2026-06-30') AS hasta
    FROM generate_series(date_trunc('quarter',v_desde::timestamp),least(p_hasta,date '2026-06-30')::timestamp,interval '3 months') q
  ), lineas AS (
    SELECT f.os_clave,f.fecha_factura::date AS fecha,
      coalesce(nullif(trim(f.factura),''),nullif(trim(f.codigo_interno_factura),'')) AS factura,
      f.concepto,coalesce(f.total_venta,0)::numeric AS total_venta,
      (coalesce(f.raw_data->>'canonical_document_kind','')='NotaCredito'
        OR upper(coalesce(public.valor_json_insensible(f.raw_data,array['ESPECIE']),'')) LIKE '%NCC%'
        OR coalesce(f.total_venta,0)<0) AS es_nota_credito,
      coalesce(nullif(btrim(f.raw_data->>'DOCUMENTO'),''),nullif(btrim(f.codigo_interno_factura),''),nullif(btrim(f.factura),'')) AS documento_tarifa,
      coalesce(nullif(btrim(f.raw_data->>'original_invoice_number'),''),nullif(btrim(public.valor_json_insensible(f.raw_data,array['NFORI'])),'')) AS factura_original
    FROM clasificados f WHERE f.concepto IN ('Servicio','Repuestos','Kilometraje','Terceros')
    UNION ALL
    SELECT i.os,m.fecha,m.factura,m.concepto,m.total_venta,m.es_nota_credito,NULL::text,NULL::text
    FROM periodos_historicos p
    CROSS JOIN LATERAL public.ventas_servicios_movimientos_enriquecidos(p.desde,p.hasta,NULL) m
    JOIN identidades i ON i.os=upper(btrim(m.os_numero)) AND i.coincidencias=1
    WHERE m.metodologia='historico' AND m.vinculo_os='factura_sucursal_anio'
  ), documentos_mo AS MATERIALIZED (
    SELECT os_clave,documento_tarifa,es_nota_credito,factura_original,
      sum(total_venta) AS total,count(*) AS lineas
    FROM lineas WHERE concepto='Servicio'
    GROUP BY os_clave,documento_tarifa,es_nota_credito,factura_original
  ), referencias AS (
    SELECT os_clave,upper(btrim(documento_tarifa)) AS documento,sum(total) AS total
    FROM documentos_mo WHERE NOT es_nota_credito GROUP BY os_clave,upper(btrim(documento_tarifa))
  ), horas_documento AS (
    SELECT d.os_clave,d.lineas,
      CASE WHEN o.raw_data->>'canonical_labor_rates_version'='1' THEN
        public.service_order_labor_hours_v1(
          o.raw_data->'canonical_labor_rates',
          CASE WHEN d.es_nota_credito THEN d.factura_original ELSE d.documento_tarifa END,
          d.total,CASE WHEN d.es_nota_credito THEN ref.total ELSE d.total END,d.es_nota_credito
        ) END AS horas
    FROM documentos_mo d
    JOIN public.ordenes_servicio_importadas o ON upper(btrim(o.os_numero))=d.os_clave
    LEFT JOIN referencias ref ON ref.os_clave=d.os_clave AND ref.documento=upper(btrim(d.factura_original))
  ), eficiencia AS (
    SELECT os_clave,coalesce(sum(lineas) FILTER (WHERE horas IS NULL),0) AS sin_tarifa,
      CASE WHEN count(*) FILTER (WHERE horas IS NULL)=0 THEN sum(horas) END AS horas_facturadas
    FROM horas_documento GROUP BY os_clave
  ), resumen AS (
    SELECT l.os_clave,count(*) AS lineas,
      array_agg(DISTINCT l.factura ORDER BY l.factura) FILTER (WHERE l.factura IS NOT NULL) AS documentos,
      max(l.fecha) FILTER (WHERE NOT l.es_nota_credito) AS fecha,
      coalesce(sum(l.total_venta) FILTER (WHERE l.concepto='Servicio'),0) AS mano_obra,
      coalesce(sum(l.total_venta) FILTER (WHERE l.concepto='Repuestos'),0) AS repuestos,
      coalesce(sum(l.total_venta) FILTER (WHERE l.concepto='Kilometraje'),0) AS kilometraje,
      coalesce(sum(l.total_venta) FILTER (WHERE l.concepto='Terceros'),0) AS terceros,
      sum(l.total_venta) AS total,
      count(*) FILTER (WHERE l.concepto='Servicio') AS lineas_mo
    FROM lineas l GROUP BY l.os_clave
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'os',i.os,'matched',coalesce(r.lineas,0)>0,'ambiguous',i.coincidencias<>1,
    'documents',coalesce(r.documentos,ARRAY[]::text[]),'date',r.fecha,
    'labor',r.mano_obra,'parts',r.repuestos,'travel',r.kilometraje,'thirdParty',r.terceros,
    'total',r.total,'laborLines',coalesce(r.lineas_mo,0),'missingRates',coalesce(e.sin_tarifa,0),
    'billedHours',e.horas_facturadas
  ) ORDER BY i.os),'[]'::jsonb) INTO v_result
  FROM identidades i LEFT JOIN resumen r ON r.os_clave=i.os LEFT JOIN eficiencia e ON e.os_clave=i.os;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.service_orders_billing_v2(text[],date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.service_orders_billing_v2(text[],date) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
