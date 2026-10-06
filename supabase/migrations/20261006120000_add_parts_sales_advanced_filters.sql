BEGIN;

-- Marca y vendedor deben limitar la misma población antes de calcular KPI,
-- períodos, comparaciones, resúmenes, listados paginados y exportaciones.
-- Las RPC vigentes permanecen intactas para conservar compatibilidad.
CREATE OR REPLACE FUNCTION public.ventas_repuestos_movimientos_filtrados_v1(
  p_desde date,p_hasta date,p_sucursal text,p_buscar text,p_marca text,p_vendedor text
) RETURNS TABLE(id text,fecha date,factura text,cliente text,sucursal text,
  metodologia text,codigo text,codigo_fabricante text,descripcion text,
  cantidad numeric,importe numeric,es_nota_credito boolean,documento text,
  marca text,vendedor text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT m.*
  FROM public.ventas_repuestos_movimientos_v2(p_desde,p_hasta,p_sucursal,p_buscar) m
  WHERE (nullif(btrim(p_marca),'') IS NULL OR m.marca=upper(btrim(p_marca)))
    AND (nullif(btrim(p_vendedor),'') IS NULL
      OR coalesce(m.vendedor,'Sin vendedor')=btrim(p_vendedor));
$$;

CREATE OR REPLACE FUNCTION public.ventas_repuestos_panorama_filtros_v1(
  p_desde date,p_hasta date,p_sucursal text DEFAULT NULL,p_buscar text DEFAULT NULL,
  p_marca text DEFAULT NULL,p_vendedor text DEFAULT NULL,p_agrupacion text DEFAULT 'mes'
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp SET statement_timeout='30s' AS $$
DECLARE v_unit text; v_interval interval; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(),'repuestos.ventas') THEN
    RAISE EXCEPTION 'No tenes acceso a Ventas de Repuestos' USING errcode='42501'; END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_desde>p_hasta THEN
    RAISE EXCEPTION 'Seleccioná un rango de fechas válido.' USING errcode='22023'; END IF;
  IF nullif(btrim(p_marca),'') IS NOT NULL AND upper(btrim(p_marca)) NOT IN('CLAAS','HORSCH','OTROS') THEN
    RAISE EXCEPTION 'Marca inválida' USING errcode='22023'; END IF;
  v_unit:=CASE p_agrupacion WHEN 'dia' THEN 'day' WHEN 'semana' THEN 'week' WHEN 'mes' THEN 'month' WHEN 'anio' THEN 'year' END;
  IF v_unit IS NULL THEN RAISE EXCEPTION 'Agrupación inválida' USING errcode='22023'; END IF;
  v_interval:=('1 '||v_unit)::interval;
  WITH base AS MATERIALIZED (
    SELECT * FROM public.ventas_repuestos_movimientos_filtrados_v1(
      least((p_desde-interval '1 year')::date,(p_desde-v_interval)::date),p_hasta,
      p_sucursal,p_buscar,p_marca,p_vendedor)
  ), actual AS MATERIALIZED (
    SELECT *,date_trunc(v_unit,fecha::timestamp)::date AS periodo
    FROM base WHERE fecha BETWEEN p_desde AND p_hasta
  ), agregados AS (
    SELECT CASE WHEN grouping(periodo)=0 THEN 'periodo' WHEN grouping(sucursal)=0 THEN 'sucursal'
      WHEN grouping(marca)=0 THEN 'marca' ELSE 'total' END AS grupo,periodo,sucursal,marca,
      coalesce(sum(importe),0) facturado,coalesce(sum(importe) FILTER(WHERE NOT es_nota_credito),0) ventas,
      coalesce(sum(importe) FILTER(WHERE es_nota_credito),0) notas_credito,
      count(DISTINCT cliente) clientes,count(DISTINCT documento) documentos,
      count(DISTINCT documento) FILTER(WHERE es_nota_credito) documentos_nc,count(*) lineas,
      CASE WHEN count(*) FILTER(WHERE cantidad IS NULL)>0 THEN NULL ELSE coalesce(sum(cantidad),0) END unidades_netas
    FROM actual GROUP BY GROUPING SETS((),(periodo),(sucursal),(marca))
  ), periodos AS (
    SELECT d::date periodo,greatest(d::date,p_desde) desde,
      least((d+v_interval-interval '1 day')::date,p_hasta) hasta
    FROM generate_series(date_trunc(v_unit,p_desde::timestamp),date_trunc(v_unit,p_hasta::timestamp),v_interval)d
  ), ventanas AS (
    SELECT periodo,'lm' tipo,(desde-v_interval)::date desde,
      CASE WHEN hasta=(periodo+v_interval-interval '1 day')::date THEN (periodo-interval '1 day')::date ELSE (hasta-v_interval)::date END hasta FROM periodos
    UNION ALL SELECT periodo,'ly',(desde-interval '1 year')::date,
      CASE WHEN v_unit IN('month','year') AND hasta=(periodo+v_interval-interval '1 day')::date THEN (periodo-interval '1 year'+v_interval-interval '1 day')::date ELSE (hasta-interval '1 year')::date END FROM periodos
    UNION ALL SELECT NULL,'lm_total',(p_desde-v_interval)::date,
      CASE WHEN p_hasta=(date_trunc(v_unit,p_hasta::timestamp)+v_interval-interval '1 day')::date THEN (date_trunc(v_unit,p_hasta::timestamp)-interval '1 day')::date ELSE (p_hasta-v_interval)::date END
    UNION ALL SELECT NULL,'ly_total',(p_desde-interval '1 year')::date,
      CASE WHEN v_unit IN('month','year') AND p_hasta=(date_trunc(v_unit,p_hasta::timestamp)+v_interval-interval '1 day')::date THEN (date_trunc(v_unit,p_hasta::timestamp)-interval '1 year'+v_interval-interval '1 day')::date ELSE (p_hasta-interval '1 year')::date END
  ), comparaciones AS (
    SELECT v.periodo,v.tipo,coalesce(sum(b.importe),0) facturado,count(b.id) lineas,v.desde,v.hasta
    FROM ventanas v LEFT JOIN base b ON b.fecha BETWEEN v.desde AND v.hasta
    GROUP BY v.periodo,v.tipo,v.desde,v.hasta
  ) SELECT jsonb_build_object(
    'resumen',(SELECT to_jsonb(a)-'grupo'-'periodo'-'sucursal'-'marca' FROM agregados a WHERE grupo='total'),
    'comparacion',(SELECT to_jsonb(c) FROM comparaciones c WHERE tipo='lm_total'),
    'comparacion_ly',(SELECT to_jsonb(c) FROM comparaciones c WHERE tipo='ly_total'),
    'periodos',coalesce((SELECT jsonb_agg(jsonb_build_object('periodo',p.periodo,'desde',p.desde,'hasta',p.hasta,
      'facturado',coalesce(a.facturado,0),'ventas',coalesce(a.ventas,0),'notas_credito',coalesce(a.notas_credito,0),
      'clientes',coalesce(a.clientes,0),'documentos',coalesce(a.documentos,0),'documentos_nc',coalesce(a.documentos_nc,0),
      'lineas',coalesce(a.lineas,0),'unidades_netas',CASE WHEN a.grupo IS NULL THEN 0 ELSE a.unidades_netas END,
      'anterior',lm.facturado,'anterior_lineas',lm.lineas,'anio_anterior',ly.facturado,'anio_anterior_lineas',ly.lineas) ORDER BY p.periodo)
      FROM periodos p LEFT JOIN agregados a ON a.grupo='periodo' AND a.periodo=p.periodo
      LEFT JOIN comparaciones lm ON lm.tipo='lm' AND lm.periodo=p.periodo
      LEFT JOIN comparaciones ly ON ly.tipo='ly' AND ly.periodo=p.periodo),'[]'::jsonb),
    'por_sucursal',coalesce((SELECT jsonb_agg(to_jsonb(a)-'grupo'-'periodo'-'marca' ORDER BY facturado DESC,sucursal) FROM agregados a WHERE grupo='sucursal'),'[]'::jsonb),
    'por_marca',coalesce((SELECT jsonb_agg(to_jsonb(a)-'grupo'-'periodo'-'sucursal' ORDER BY CASE marca WHEN 'CLAAS' THEN 1 WHEN 'HORSCH' THEN 2 ELSE 3 END) FROM agregados a WHERE grupo='marca'),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.ventas_repuestos_listado_filtros_v1(
  p_desde date,p_hasta date,p_sucursal text DEFAULT NULL,p_buscar text DEFAULT NULL,
  p_marca text DEFAULT NULL,p_vendedor text DEFAULT NULL,p_vista text DEFAULT 'detalle',
  p_pagina integer DEFAULT 1,p_por_pagina integer DEFAULT 50,p_orden text DEFAULT NULL,
  p_direccion text DEFAULT 'desc',p_exportar boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp SET statement_timeout='30s' AS $$
DECLARE v_result jsonb; v_page integer:=greatest(coalesce(p_pagina,1),1);
  v_size integer:=least(greatest(coalesce(p_por_pagina,50),10),100);
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(),'repuestos.ventas') THEN
    RAISE EXCEPTION 'No tenes acceso a Ventas de Repuestos' USING errcode='42501'; END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_desde>p_hasta THEN
    RAISE EXCEPTION 'Seleccioná un rango de fechas válido.' USING errcode='22023'; END IF;
  IF nullif(btrim(p_marca),'') IS NOT NULL AND upper(btrim(p_marca)) NOT IN('CLAAS','HORSCH','OTROS') THEN
    RAISE EXCEPTION 'Marca inválida' USING errcode='22023'; END IF;
  IF p_vista NOT IN('detalle','clientes','repuestos','vendedores') THEN
    RAISE EXCEPTION 'Vista inválida' USING errcode='22023'; END IF;
  IF p_direccion NOT IN('asc','desc') OR p_direccion IS NULL THEN
    RAISE EXCEPTION 'Dirección inválida' USING errcode='22023'; END IF;
  p_orden:=coalesce(p_orden,CASE WHEN p_vista='detalle' THEN 'fecha' ELSE 'facturado' END);
  IF p_orden NOT IN('fecha','factura','cliente','sucursal','marca','codigo','codigo_fabricante','descripcion',
    'cantidad','facturado','ventas','notas_credito','clientes','documentos','unidades_netas','vendedor',
    'ticket','anterior','variacion','ultima','participacion','abc') THEN
    RAISE EXCEPTION 'Columna inválida' USING errcode='22023'; END IF;
  WITH base AS MATERIALIZED (
    SELECT * FROM public.ventas_repuestos_movimientos_filtrados_v1(
      CASE WHEN p_vista='clientes' THEN (p_desde-interval '1 year')::date ELSE p_desde END,
      p_hasta,p_sucursal,p_buscar,p_marca,p_vendedor)
  ), actual AS MATERIALIZED (SELECT * FROM base WHERE fecha BETWEEN p_desde AND p_hasta),
  anteriores AS (
    SELECT cliente,sum(importe) anterior FROM base
    WHERE p_vista='clientes' AND fecha BETWEEN (p_desde-interval '1 year')::date AND (p_hasta-interval '1 year')::date
    GROUP BY cliente
  ), producto_marcas AS (
    SELECT coalesce(nullif(codigo,''),nullif(codigo_fabricante,''),descripcion) producto_id,marca,sum(importe) facturado_marca
    FROM actual WHERE p_vista='repuestos'
    GROUP BY coalesce(nullif(codigo,''),nullif(codigo_fabricante,''),descripcion),marca
  ), producto_marca AS (
    SELECT DISTINCT ON (producto_id) producto_id,marca FROM producto_marcas
    ORDER BY producto_id,facturado_marca DESC NULLS LAST,CASE marca WHEN 'CLAAS' THEN 1 WHEN 'HORSCH' THEN 2 ELSE 3 END
  ), agrupados AS (
    SELECT CASE WHEN p_vista='clientes' THEN cliente WHEN p_vista='vendedores' THEN coalesce(vendedor,'Sin vendedor') ELSE coalesce(nullif(codigo,''),nullif(codigo_fabricante,''),descripcion) END id,
      CASE WHEN p_vista='clientes' THEN min(cliente) END cliente,
      CASE WHEN p_vista='vendedores' THEN min(coalesce(vendedor,'Sin vendedor')) END vendedor,
      CASE WHEN p_vista='repuestos' THEN min(coalesce(nullif(codigo,''),nullif(codigo_fabricante,''))) END codigo,
      CASE WHEN p_vista='repuestos' THEN string_agg(DISTINCT metodologia,',') END metodologia,
      min(descripcion) descripcion,max(fecha) ultima,sum(importe) facturado,
      coalesce(sum(importe) FILTER(WHERE NOT es_nota_credito),0) ventas,
      coalesce(sum(importe) FILTER(WHERE es_nota_credito),0) notas_credito,
      count(DISTINCT cliente) clientes,count(DISTINCT documento) documentos,count(*) lineas,
      CASE WHEN count(*) FILTER(WHERE cantidad IS NULL)>0 THEN NULL ELSE sum(cantidad) END unidades_netas,
      CASE WHEN count(*) FILTER(WHERE cantidad IS NULL)>0 THEN NULL ELSE coalesce(sum(cantidad) FILTER(WHERE NOT es_nota_credito),0) END unidades_vendidas,
      CASE WHEN count(*) FILTER(WHERE cantidad IS NULL)>0 THEN NULL ELSE coalesce(sum(abs(cantidad)) FILTER(WHERE es_nota_credito),0) END unidades_devueltas
    FROM actual WHERE p_vista IN('clientes','repuestos','vendedores') GROUP BY 1
  ), agrupados_marca AS (
    SELECT g.*,CASE WHEN p_vista='repuestos' THEN coalesce(pm.marca,'OTROS') END marca
    FROM agrupados g LEFT JOIN producto_marca pm ON p_vista='repuestos' AND pm.producto_id=g.id
  ), clasificados AS (
    SELECT g.*,CASE WHEN p_vista='repuestos' AND g.facturado>0 AND sum(g.facturado) FILTER(WHERE g.facturado>0) OVER()>0 THEN
      CASE WHEN coalesce(sum(g.facturado) FILTER(WHERE g.facturado>0) OVER(ORDER BY g.facturado DESC,g.id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0)
                  /sum(g.facturado) FILTER(WHERE g.facturado>0) OVER()<0.80 THEN 'A'
           WHEN coalesce(sum(g.facturado) FILTER(WHERE g.facturado>0) OVER(ORDER BY g.facturado DESC,g.id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0)
                  /sum(g.facturado) FILTER(WHERE g.facturado>0) OVER()<0.95 THEN 'B' ELSE 'C' END END abc
    FROM agrupados_marca g
  ), filas AS (
    SELECT a.id,a.facturado,jsonb_build_object('id',a.id,'fecha',a.fecha,'factura',a.factura,'cliente',a.cliente,
      'sucursal',a.sucursal,'codigo',a.codigo,'codigo_fabricante',a.codigo_fabricante,'descripcion',a.descripcion,
      'metodologia',a.metodologia,'cantidad',a.cantidad,'facturado',a.importe,'es_nota_credito',a.es_nota_credito,
      'marca',a.marca,'vendedor',a.vendedor) datos,a.fecha,a.documento,a.vendedor
    FROM (SELECT *,importe facturado FROM actual)a WHERE p_vista='detalle'
    UNION ALL
    SELECT g.id,g.facturado,to_jsonb(g)||jsonb_build_object('anterior',a.anterior),g.ultima,NULL::text,g.vendedor
    FROM clasificados g LEFT JOIN anteriores a ON p_vista='clientes' AND a.cliente=g.cliente
  ), claves AS (
    SELECT f.*,CASE WHEN p_orden IN('cantidad','facturado','ventas','notas_credito','clientes','documentos','unidades_netas','anterior')
        THEN (datos->>p_orden)::numeric
      WHEN p_orden='ticket' THEN facturado/nullif((datos->>'documentos')::numeric,0)
      WHEN p_orden='variacion' THEN (facturado-(datos->>'anterior')::numeric)/nullif(abs((datos->>'anterior')::numeric),0)
      WHEN p_orden='participacion' THEN facturado/nullif((SELECT sum(importe) FROM actual),0) END numero,
      CASE WHEN p_orden IN('fecha','ultima') THEN (datos->>p_orden)::date END dia,
      CASE WHEN p_orden NOT IN('cantidad','facturado','ventas','notas_credito','clientes','documentos','unidades_netas','anterior','ticket','variacion','participacion','fecha','ultima')
        THEN public.ventas_orden_natural(datos->>p_orden) END texto
    FROM filas f
  ), ordenadas AS (
    SELECT *,row_number() OVER(ORDER BY
      CASE WHEN p_direccion='asc' THEN numero END ASC NULLS LAST,
      CASE WHEN p_direccion='desc' THEN numero END DESC NULLS LAST,
      CASE WHEN p_direccion='asc' THEN dia END ASC NULLS LAST,
      CASE WHEN p_direccion='desc' THEN dia END DESC NULLS LAST,
      CASE WHEN p_direccion='asc' THEN texto END COLLATE "C" ASC NULLS LAST,
      CASE WHEN p_direccion='desc' THEN texto END COLLATE "C" DESC NULLS LAST,id) posicion
    FROM claves
  ), pagina AS (
    SELECT * FROM ordenadas ORDER BY posicion
    LIMIT CASE WHEN p_exportar THEN NULL ELSE v_size END
    OFFSET CASE WHEN p_exportar THEN 0 ELSE (v_page-1)*v_size END
  ) SELECT jsonb_build_object('total',(SELECT count(*) FROM filas),
    'pagina',CASE WHEN p_exportar THEN 1 ELSE v_page END,
    'paginas',CASE WHEN p_exportar THEN 1 ELSE greatest(1,ceil((SELECT count(*) FROM filas)::numeric/v_size)) END,
    'por_pagina',v_size,'total_periodo',coalesce((SELECT sum(importe) FROM actual),0),
    'filas',coalesce((SELECT jsonb_agg(datos ORDER BY posicion) FROM pagina),'[]'::jsonb)) INTO v_result;
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.ventas_repuestos_movimientos_filtrados_v1(date,date,text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ventas_repuestos_panorama_filtros_v1(date,date,text,text,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.ventas_repuestos_listado_filtros_v1(date,date,text,text,text,text,text,integer,integer,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ventas_repuestos_panorama_filtros_v1(date,date,text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ventas_repuestos_listado_filtros_v1(date,date,text,text,text,text,text,integer,integer,text,text,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
