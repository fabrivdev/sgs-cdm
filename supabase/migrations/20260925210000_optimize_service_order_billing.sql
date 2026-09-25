BEGIN;

-- Seek only the requested OS, instead of rebuilding Sales and machine identity
-- for every quarter of every batch. No grants or imported records are changed.
CREATE INDEX IF NOT EXISTS idx_billing_service_order_date
  ON public.facturacion_lineas_importadas (upper(btrim(raw_data->>'linked_service_order')),fecha_factura);
CREATE INDEX IF NOT EXISTS idx_os_number_normalized
  ON public.ordenes_servicio_importadas (upper(btrim(os_numero)));

CREATE OR REPLACE FUNCTION public.service_orders_billing_v1(p_os_numeros text[], p_hasta date)
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
      CASE WHEN abs(f.valor_unitario)>0 AND f.valor_unitario::text NOT IN ('NaN','Infinity','-Infinity') THEN abs(f.valor_unitario) END AS tarifa
    FROM clasificados f WHERE f.concepto IN ('Servicio','Repuestos','Kilometraje','Terceros')
    UNION ALL
    SELECT i.os,m.fecha,m.factura,m.concepto,m.total_venta,m.es_nota_credito,NULL::numeric
    FROM periodos_historicos p
    CROSS JOIN LATERAL public.ventas_servicios_movimientos_enriquecidos(p.desde,p.hasta,NULL) m
    JOIN identidades i ON i.os=upper(btrim(m.os_numero)) AND i.coincidencias=1
    WHERE m.metodologia='historico' AND m.vinculo_os='factura_sucursal_anio'
  ), resumen AS (
    SELECT l.os_clave,count(*) AS lineas,
      array_agg(DISTINCT l.factura ORDER BY l.factura) FILTER (WHERE l.factura IS NOT NULL) AS documentos,
      max(l.fecha) FILTER (WHERE NOT l.es_nota_credito) AS fecha,
      coalesce(sum(l.total_venta) FILTER (WHERE l.concepto='Servicio'),0) AS mano_obra,
      coalesce(sum(l.total_venta) FILTER (WHERE l.concepto='Repuestos'),0) AS repuestos,
      coalesce(sum(l.total_venta) FILTER (WHERE l.concepto='Kilometraje'),0) AS kilometraje,
      coalesce(sum(l.total_venta) FILTER (WHERE l.concepto='Terceros'),0) AS terceros,
      sum(l.total_venta) AS total,
      count(*) FILTER (WHERE l.concepto='Servicio') AS lineas_mo,
      count(*) FILTER (WHERE l.concepto='Servicio' AND l.tarifa IS NULL) AS sin_tarifa,
      CASE WHEN count(*) FILTER (WHERE l.concepto='Servicio')>0
        AND count(*) FILTER (WHERE l.concepto='Servicio' AND l.tarifa IS NULL)=0
        THEN sum(l.total_venta/l.tarifa) FILTER (WHERE l.concepto='Servicio') END AS horas_facturadas
    FROM lineas l GROUP BY l.os_clave
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'os',i.os,'matched',coalesce(r.lineas,0)>0,'ambiguous',i.coincidencias<>1,
    'documents',coalesce(r.documentos,ARRAY[]::text[]),'date',r.fecha,
    'labor',r.mano_obra,'parts',r.repuestos,'travel',r.kilometraje,'thirdParty',r.terceros,
    'total',r.total,'laborLines',coalesce(r.lineas_mo,0),'missingRates',coalesce(r.sin_tarifa,0),
    'billedHours',r.horas_facturadas
  ) ORDER BY i.os),'[]'::jsonb) INTO v_result
  FROM identidades i LEFT JOIN resumen r ON r.os_clave=i.os;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.service_orders_billing_v1(text[],date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.service_orders_billing_v1(text[],date) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
