BEGIN;

-- Reconcile TOTVS credit references without changing stored financial documents.
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
          CASE WHEN d.es_nota_credito THEN coalesce(ref.documento, ref_fe.documento) ELSE d.documento_tarifa END,
          d.total,CASE WHEN d.es_nota_credito THEN coalesce(ref.total, ref_fe.total) ELSE d.total END,d.es_nota_credito
        ) END AS horas
    FROM documentos_mo d
    JOIN public.ordenes_servicio_importadas o ON upper(btrim(o.os_numero))=d.os_clave
    LEFT JOIN referencias ref
      ON d.es_nota_credito AND ref.os_clave=d.os_clave
      AND ref.documento=upper(btrim(d.factura_original))
    -- TOTVS may prefix NFORI with the electronic series (FE1 - 13 digits).
    -- Prefer an exact document and allow the fallback only within the same OS.
    LEFT JOIN referencias ref_fe
      ON d.es_nota_credito AND ref.documento IS NULL AND ref_fe.os_clave=d.os_clave
      AND ref_fe.documento=substring(upper(btrim(d.factura_original))
        FROM '^FE[0-9]+[[:space:]]*-[[:space:]]*([0-9]{13})$')
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
