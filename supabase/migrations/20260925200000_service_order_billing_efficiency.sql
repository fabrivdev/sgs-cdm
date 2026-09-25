BEGIN;

-- Read-only companion to the operational section. Reuses the exact Sales
-- population, links, currencies, credit signs and commercial classification.
-- Requires both sections; does not grant access, mutate invoices or fix imports.
CREATE OR REPLACE FUNCTION public.service_orders_billing_v1(p_os_numeros text[], p_hasta date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '120s'
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
  -- Explicit current-system links find their real earliest invoice, independent
  -- of opening/closing dates. Legacy links are invoice + branch + year, as Sales.
  SELECT min(d.fecha) INTO v_desde FROM (
    SELECT f.fecha_factura::date AS fecha FROM public.facturacion_lineas_importadas f
    WHERE upper(btrim(f.raw_data->>'linked_service_order'))=ANY(v_keys)
      AND f.fecha_factura::date<=p_hasta
    UNION ALL
    SELECT date_trunc('year',o.fecha_emision_factura AT TIME ZONE 'America/Asuncion')::date
    FROM public.ordenes_servicio_importadas o
    WHERE upper(btrim(o.os_numero))=ANY(v_keys)
      AND o.fecha_emision_factura IS NOT NULL
      AND o.fecha_emision_factura::date<=date '2026-06-30'
  ) d;

  WITH solicitadas AS (
    SELECT DISTINCT upper(btrim(n)) AS os FROM unnest(p_os_numeros) n
  ), identidades AS MATERIALIZED (
    SELECT s.os,count(o.os_numero) AS coincidencias
    FROM solicitadas s LEFT JOIN public.ordenes_servicio_importadas o ON upper(btrim(o.os_numero))=s.os
    GROUP BY s.os
  ), periodos AS (
    SELECT greatest(q::date,v_desde) AS desde,
      least((q+interval '3 months'-interval '1 day')::date,p_hasta) AS hasta
    FROM generate_series(date_trunc('quarter',v_desde::timestamp),p_hasta::timestamp,interval '3 months') q
  ), movimientos AS MATERIALIZED (
    SELECT m.* FROM periodos p
    CROSS JOIN LATERAL public.ventas_servicios_movimientos_enriquecidos(p.desde,p.hasta,NULL) m
    JOIN identidades i ON i.os=upper(btrim(m.os_numero)) AND i.coincidencias=1
    WHERE m.vinculo_os IN ('actual','factura_sucursal_anio')
  ), lineas AS (
    SELECT m.*,upper(btrim(m.os_numero)) AS os_clave,
      -- The imported invoice unit price uses the same USD/IVA basis as its total.
      -- Never derive a rate from total/quantity, or reuse OS quantity as billed hours.
      CASE WHEN m.metodologia='actual' AND abs(f.valor_unitario)>0
        AND f.valor_unitario::text NOT IN ('NaN','Infinity','-Infinity')
        THEN abs(f.valor_unitario) END AS tarifa
    FROM movimientos m LEFT JOIN public.facturacion_lineas_importadas f
      ON m.metodologia='actual' AND f.id::text=m.linea_id
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
