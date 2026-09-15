BEGIN;
-- Ventas de Repuestos: conserva area_calculada = repuestos (las piezas de OS
-- siguen en Servicios). No modifica importaciones, stock ni facturación.
-- Requiere ventas_area_movimientos_base y cliente_nombre_canonico existentes.
DO $$ BEGIN
  IF to_regprocedure('public.cliente_nombre_canonico(text)') IS NULL THEN
    RAISE EXCEPTION 'Aplicá primero 20260915120000_resolve_service_stock_owners_and_campos_identity.sql';
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.ventas_repuestos_movimientos_v1(
  p_desde date, p_hasta date, p_sucursal text, p_buscar text
)
RETURNS TABLE(id text,fecha date,factura text,cliente text,sucursal text,
  metodologia text,codigo text,codigo_fabricante text,descripcion text,
  cantidad numeric,importe numeric,es_nota_credito boolean,documento text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT m.metodologia || ':' || m.linea_id,m.fecha,m.factura,
    coalesce(public.cliente_nombre_canonico(m.cliente),'Cliente no informado'),
    coalesce(nullif(btrim(m.sucursal),''),'Sucursal no informada'),
    m.metodologia,m.codigo,m.codigo_fabricante,m.descripcion,
    CASE WHEN m.metodologia = 'historico' THEN NULL
      WHEN m.es_nota_credito OR m.total_venta < 0 THEN -abs(m.cantidad)
      ELSE m.cantidad END,
    m.total_venta,m.es_nota_credito OR m.total_venta < 0,
    jsonb_build_array(m.metodologia,m.fecha,m.sucursal,
      coalesce(m.factura,'linea:' || m.linea_id),
      m.es_nota_credito OR m.total_venta < 0)::text
  FROM public.ventas_area_movimientos_base(p_desde,p_hasta,p_sucursal,p_buscar) m
  WHERE m.area_calculada = 'repuestos';
$$;
REVOKE ALL ON FUNCTION public.ventas_repuestos_movimientos_v1(date,date,text,text)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.ventas_repuestos_panorama_v1(
  p_desde date,p_hasta date,p_sucursal text DEFAULT NULL,
  p_buscar text DEFAULT NULL,p_agrupacion text DEFAULT 'mes'
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp SET statement_timeout = '30s' AS $$
DECLARE
  v_unit text; v_interval interval; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(),'repuestos.ventas')
    THEN RAISE EXCEPTION 'No tenes acceso a Ventas de Repuestos' USING errcode='42501'; END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_desde > p_hasta
    THEN RAISE EXCEPTION 'Seleccioná un rango de fechas válido.' USING errcode='22023'; END IF;
  v_unit := CASE p_agrupacion WHEN 'dia' THEN 'day' WHEN 'semana' THEN 'week'
    WHEN 'mes' THEN 'month' WHEN 'anio' THEN 'year' END;
  IF v_unit IS NULL THEN RAISE EXCEPTION 'Agrupación inválida' USING errcode='22023'; END IF;
  v_interval := ('1 ' || v_unit)::interval;
  WITH base AS MATERIALIZED (
    SELECT * FROM public.ventas_repuestos_movimientos_v1(
      least((p_desde-interval '1 year')::date,(p_desde-v_interval)::date),p_hasta,p_sucursal,p_buscar)
  ), actual AS MATERIALIZED (
    SELECT *,date_trunc(v_unit,fecha::timestamp)::date AS periodo
    FROM base WHERE fecha BETWEEN p_desde AND p_hasta
  ), agregados AS (
    SELECT CASE WHEN grouping(periodo)=0 THEN 'periodo'
      WHEN grouping(sucursal)=0 THEN 'sucursal'
      WHEN grouping(metodologia)=0 THEN 'origen' ELSE 'total' END AS grupo,
      periodo,sucursal,metodologia,
      coalesce(sum(importe),0) AS facturado,
      coalesce(sum(importe) FILTER (WHERE NOT es_nota_credito),0) AS ventas,
      coalesce(sum(importe) FILTER (WHERE es_nota_credito),0) AS notas_credito,
      count(DISTINCT cliente) AS clientes,count(DISTINCT documento) AS documentos,
      count(DISTINCT documento) FILTER (WHERE es_nota_credito) AS documentos_nc,
      count(*) AS lineas,
      CASE WHEN count(*) FILTER (WHERE cantidad IS NULL)>0 THEN NULL ELSE coalesce(sum(cantidad),0) END AS unidades_netas
    FROM actual GROUP BY GROUPING SETS ((),(periodo),(sucursal),(metodologia))
  ), periodos AS (
    SELECT d::date AS periodo,
      greatest(d::date,p_desde) AS desde,
      least((d+v_interval-interval '1 day')::date,p_hasta) AS hasta
    FROM generate_series(date_trunc(v_unit,p_desde::timestamp),date_trunc(v_unit,p_hasta::timestamp),v_interval) d
  ), ventanas AS (
    SELECT periodo,'lm' AS tipo,(desde-v_interval)::date AS desde,
      CASE WHEN hasta=(periodo+v_interval-interval '1 day')::date
        THEN (periodo-interval '1 day')::date ELSE (hasta-v_interval)::date END AS hasta FROM periodos
    UNION ALL SELECT periodo,'ly',(desde-interval '1 year')::date,
      CASE WHEN v_unit IN ('month','year') AND hasta=(periodo+v_interval-interval '1 day')::date
        THEN (periodo-interval '1 year'+v_interval-interval '1 day')::date
        ELSE (hasta-interval '1 year')::date END FROM periodos
    UNION ALL SELECT NULL,'lm_total',(p_desde-v_interval)::date,
      CASE WHEN p_hasta=(date_trunc(v_unit,p_hasta::timestamp)+v_interval-interval '1 day')::date
        THEN (date_trunc(v_unit,p_hasta::timestamp)-interval '1 day')::date ELSE (p_hasta-v_interval)::date END
    UNION ALL SELECT NULL,'ly_total',(p_desde-interval '1 year')::date,
      CASE WHEN v_unit IN ('month','year') AND p_hasta=(date_trunc(v_unit,p_hasta::timestamp)+v_interval-interval '1 day')::date
        THEN (date_trunc(v_unit,p_hasta::timestamp)-interval '1 year'+v_interval-interval '1 day')::date
        ELSE (p_hasta-interval '1 year')::date END
  ), comparaciones AS (
    SELECT v.periodo,v.tipo,coalesce(sum(b.importe),0) AS facturado,
      count(b.id) AS lineas,v.desde,v.hasta
    FROM ventanas v LEFT JOIN base b ON b.fecha BETWEEN v.desde AND v.hasta
    GROUP BY v.periodo,v.tipo,v.desde,v.hasta
  )
  SELECT jsonb_build_object(
    'desde',p_desde,'hasta',p_hasta,
    'resumen',(SELECT to_jsonb(a)-'grupo'-'periodo'-'sucursal'-'metodologia' FROM agregados a WHERE grupo='total'),
    'comparacion',(SELECT to_jsonb(c) FROM comparaciones c WHERE tipo='lm_total'),
    'comparacion_ly',(SELECT to_jsonb(c) FROM comparaciones c WHERE tipo='ly_total'),
    'periodos',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'periodo',p.periodo,'desde',p.desde,'hasta',p.hasta,
      'facturado',coalesce(a.facturado,0),'ventas',coalesce(a.ventas,0),'notas_credito',coalesce(a.notas_credito,0),
      'clientes',coalesce(a.clientes,0),'documentos',coalesce(a.documentos,0),
      'documentos_nc',coalesce(a.documentos_nc,0),'lineas',coalesce(a.lineas,0),
      'unidades_netas',CASE WHEN a.grupo IS NULL THEN 0 ELSE a.unidades_netas END,
      'anterior',lm.facturado,'anterior_lineas',lm.lineas,'anio_anterior',ly.facturado,'anio_anterior_lineas',ly.lineas
    ) ORDER BY p.periodo) FROM periodos p
      LEFT JOIN agregados a ON a.grupo='periodo' AND a.periodo=p.periodo
      LEFT JOIN comparaciones lm ON lm.tipo='lm' AND lm.periodo=p.periodo
      LEFT JOIN comparaciones ly ON ly.tipo='ly' AND ly.periodo=p.periodo),'[]'::jsonb),
    'por_sucursal',coalesce((SELECT jsonb_agg(to_jsonb(a)-'grupo'-'periodo'-'metodologia' ORDER BY facturado DESC,sucursal)
      FROM agregados a WHERE grupo='sucursal'),'[]'::jsonb),
    'por_origen',coalesce((SELECT jsonb_agg(to_jsonb(a)-'grupo'-'periodo'-'sucursal' ORDER BY metodologia)
      FROM agregados a WHERE grupo='origen'),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.ventas_repuestos_listado_v1(
  p_desde date,p_hasta date,p_sucursal text DEFAULT NULL,p_buscar text DEFAULT NULL,
  p_vista text DEFAULT 'detalle',p_pagina integer DEFAULT 1,p_por_pagina integer DEFAULT 50
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp SET statement_timeout = '30s' AS $$
DECLARE v_result jsonb; v_page integer:=greatest(coalesce(p_pagina,1),1);
  v_size integer:=least(greatest(coalesce(p_por_pagina,50),10),100);
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(),'repuestos.ventas')
    THEN RAISE EXCEPTION 'No tenes acceso a Ventas de Repuestos' USING errcode='42501'; END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_desde>p_hasta
    THEN RAISE EXCEPTION 'Seleccioná un rango de fechas válido.' USING errcode='22023'; END IF;
  IF p_vista NOT IN ('detalle','clientes','repuestos')
    THEN RAISE EXCEPTION 'Vista inválida' USING errcode='22023'; END IF;
  WITH base AS MATERIALIZED (
    SELECT * FROM public.ventas_repuestos_movimientos_v1(
      CASE WHEN p_vista='clientes' THEN (p_desde-interval '1 year')::date ELSE p_desde END,
      p_hasta,p_sucursal,p_buscar)
  ), actual AS MATERIALIZED (
    SELECT * FROM base WHERE fecha BETWEEN p_desde AND p_hasta
  ), anteriores AS (
    SELECT cliente,sum(importe) AS anterior FROM base
    WHERE p_vista='clientes' AND fecha BETWEEN (p_desde-interval '1 year')::date AND (p_hasta-interval '1 year')::date
    GROUP BY cliente
  ), agrupados AS (
    SELECT CASE WHEN p_vista='clientes' THEN cliente ELSE
        jsonb_build_array(codigo,codigo_fabricante,metodologia,
          CASE WHEN metodologia<>'historico' AND codigo IS NULL AND codigo_fabricante IS NULL THEN descripcion END)::text END AS id,
      CASE WHEN p_vista='clientes' THEN cliente END AS cliente,
      CASE WHEN p_vista='repuestos' THEN codigo END AS codigo,
      CASE WHEN p_vista='repuestos' THEN codigo_fabricante END AS codigo_fabricante,
      CASE WHEN p_vista='repuestos' THEN metodologia END AS metodologia,
      min(descripcion) AS descripcion,
      string_agg(DISTINCT sucursal,', ' ORDER BY sucursal) AS sucursal,max(fecha) AS ultima,
      sum(importe) AS facturado,
      coalesce(sum(importe) FILTER (WHERE NOT es_nota_credito),0) AS ventas,
      coalesce(sum(importe) FILTER (WHERE es_nota_credito),0) AS notas_credito,
      count(DISTINCT cliente) AS clientes,count(DISTINCT documento) AS documentos,
      count(*) AS lineas,
      CASE WHEN count(*) FILTER (WHERE cantidad IS NULL)>0 THEN NULL ELSE sum(cantidad) END AS unidades_netas,
      CASE WHEN count(*) FILTER (WHERE cantidad IS NULL)>0 THEN NULL
        ELSE coalesce(sum(cantidad) FILTER (WHERE NOT es_nota_credito),0) END AS unidades_vendidas,
      CASE WHEN count(*) FILTER (WHERE cantidad IS NULL)>0 THEN NULL
        ELSE coalesce(sum(abs(cantidad)) FILTER (WHERE es_nota_credito),0) END AS unidades_devueltas
    FROM actual WHERE p_vista IN ('clientes','repuestos')
    GROUP BY 1,2,3,4,5
  ), filas AS (
    SELECT a.id,a.facturado,
      jsonb_build_object('id',a.id,'fecha',a.fecha,'factura',a.factura,'cliente',a.cliente,
        'sucursal',a.sucursal,'codigo',a.codigo,'codigo_fabricante',a.codigo_fabricante,
        'descripcion',a.descripcion,'metodologia',a.metodologia,'cantidad',a.cantidad,
        'facturado',a.importe,'es_nota_credito',a.es_nota_credito) AS datos,a.fecha,a.documento
    FROM (SELECT *,importe AS facturado FROM actual) a WHERE p_vista='detalle'
    UNION ALL
    SELECT g.id,g.facturado,to_jsonb(g)||jsonb_build_object('anterior',a.anterior),g.ultima,NULL::text
    FROM agrupados g LEFT JOIN anteriores a ON p_vista='clientes' AND a.cliente=g.cliente
  ), pagina AS (
    SELECT * FROM filas
    ORDER BY CASE WHEN p_vista='detalle' THEN fecha END DESC NULLS LAST,
      documento DESC NULLS LAST,CASE WHEN p_vista<>'detalle' THEN facturado END DESC,id
    LIMIT v_size OFFSET (v_page-1)*v_size
  )
  SELECT jsonb_build_object('total',(SELECT count(*) FROM filas),'pagina',v_page,
    'paginas',greatest(1,ceil((SELECT count(*) FROM filas)::numeric/v_size)),
    'por_pagina',v_size,'total_periodo',coalesce((SELECT sum(importe) FROM actual),0),
    'filas',coalesce((SELECT jsonb_agg(datos ORDER BY
      CASE WHEN p_vista='detalle' THEN fecha END DESC NULLS LAST,documento DESC NULLS LAST,
      CASE WHEN p_vista<>'detalle' THEN facturado END DESC,id) FROM pagina),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.ventas_repuestos_panorama_v1(date,date,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.ventas_repuestos_listado_v1(date,date,text,text,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ventas_repuestos_panorama_v1(date,date,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ventas_repuestos_listado_v1(date,date,text,text,text,integer,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
