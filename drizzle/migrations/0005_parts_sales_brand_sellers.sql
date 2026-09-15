CREATE OR REPLACE FUNCTION public.ventas_repuestos_movimientos_v2(
  p_desde date, p_hasta date, p_sucursal text, p_buscar text
) RETURNS TABLE(id text,fecha date,factura text,cliente text,sucursal text,
  metodologia text,codigo text,codigo_fabricante text,descripcion text,
  cantidad numeric,importe numeric,es_nota_credito boolean,documento text,
  marca text,vendedor text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT m.id,m.fecha,m.factura,m.cliente,m.sucursal,m.metodologia,m.codigo,
    m.codigo_fabricante,m.descripcion,m.cantidad,m.importe,m.es_nota_credito,m.documento,
    CASE
      WHEN upper(coalesce(f.marca_normalizada::text,f.raw_data->>'marca',f.subgrupo_original,'')) LIKE '%CLAAS%' THEN 'CLAAS'
      WHEN upper(coalesce(f.marca_normalizada::text,f.raw_data->>'marca',f.subgrupo_original,'')) LIKE '%HORSCH%'
        OR upper(coalesce(f.subgrupo_original,'')) LIKE '%PLANTADOR%'
        OR upper(coalesce(f.subgrupo_original,'')) LIKE '%PULVERIZ%' THEN 'HORSCH'
      ELSE 'OTROS'
    END,
    nullif(btrim(coalesce(f.vendedor,f.raw_data->>'Vendedor',f.raw_data->>'VENDEDOR',f.raw_data->>'vendedor')),'')
  FROM public.ventas_repuestos_movimientos_v1(p_desde,p_hasta,p_sucursal,p_buscar) m
  LEFT JOIN public.facturacion_lineas_importadas f
    ON f.id::text=substring(m.id from position(':' in m.id)+1)
$$;
REVOKE ALL ON FUNCTION public.ventas_repuestos_movimientos_v2(date,date,text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.ventas_repuestos_panorama_v2(
  p_desde date,p_hasta date,p_sucursal text DEFAULT NULL,
  p_buscar text DEFAULT NULL,p_agrupacion text DEFAULT 'mes'
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp SET statement_timeout='30s' AS $$
DECLARE v_unit text; v_interval interval; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(),'repuestos.ventas') THEN
    RAISE EXCEPTION 'No tenes acceso a Ventas de Repuestos' USING errcode='42501'; END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_desde>p_hasta THEN
    RAISE EXCEPTION 'Seleccioná un rango de fechas válido.' USING errcode='22023'; END IF;
  v_unit:=CASE p_agrupacion WHEN 'dia' THEN 'day' WHEN 'semana' THEN 'week' WHEN 'mes' THEN 'month' WHEN 'anio' THEN 'year' END;
  IF v_unit IS NULL THEN RAISE EXCEPTION 'Agrupación inválida' USING errcode='22023'; END IF;
  v_interval:=('1 '||v_unit)::interval;
  WITH base AS MATERIALIZED (
    SELECT * FROM public.ventas_repuestos_movimientos_v2(
      least((p_desde-interval '1 year')::date,(p_desde-v_interval)::date),p_hasta,p_sucursal,p_buscar)
  ), actual AS MATERIALIZED (
    SELECT *,date_trunc(v_unit,fecha::timestamp)::date AS periodo FROM base WHERE fecha BETWEEN p_desde AND p_hasta
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
    SELECT d::date periodo,greatest(d::date,p_desde) desde,least((d+v_interval-interval '1 day')::date,p_hasta) hasta
    FROM generate_series(date_trunc(v_unit,p_desde::timestamp),date_trunc(v_unit,p_hasta::timestamp),v_interval)d
  ), ventanas AS (
    SELECT periodo,'lm' tipo,(desde-v_interval)::date desde,CASE WHEN hasta=(periodo+v_interval-interval '1 day')::date THEN (periodo-interval '1 day')::date ELSE (hasta-v_interval)::date END hasta FROM periodos
    UNION ALL SELECT periodo,'ly',(desde-interval '1 year')::date,CASE WHEN v_unit IN('month','year') AND hasta=(periodo+v_interval-interval '1 day')::date THEN (periodo-interval '1 year'+v_interval-interval '1 day')::date ELSE (hasta-interval '1 year')::date END FROM periodos
    UNION ALL SELECT NULL,'lm_total',(p_desde-v_interval)::date,CASE WHEN p_hasta=(date_trunc(v_unit,p_hasta::timestamp)+v_interval-interval '1 day')::date THEN (date_trunc(v_unit,p_hasta::timestamp)-interval '1 day')::date ELSE (p_hasta-v_interval)::date END
    UNION ALL SELECT NULL,'ly_total',(p_desde-interval '1 year')::date,CASE WHEN v_unit IN('month','year') AND p_hasta=(date_trunc(v_unit,p_hasta::timestamp)+v_interval-interval '1 day')::date THEN (date_trunc(v_unit,p_hasta::timestamp)-interval '1 year'+v_interval-interval '1 day')::date ELSE (p_hasta-interval '1 year')::date END
  ), comparaciones AS (
    SELECT v.periodo,v.tipo,coalesce(sum(b.importe),0) facturado,count(b.id) lineas,v.desde,v.hasta
    FROM ventanas v LEFT JOIN base b ON b.fecha BETWEEN v.desde AND v.hasta GROUP BY v.periodo,v.tipo,v.desde,v.hasta
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
      LEFT JOIN comparaciones lm ON lm.tipo='lm' AND lm.periodo=p.periodo LEFT JOIN comparaciones ly ON ly.tipo='ly' AND ly.periodo=p.periodo),'[]'::jsonb),
    'por_sucursal',coalesce((SELECT jsonb_agg(to_jsonb(a)-'grupo'-'periodo'-'marca' ORDER BY facturado DESC,sucursal) FROM agregados a WHERE grupo='sucursal'),'[]'::jsonb),
    'por_marca',coalesce((SELECT jsonb_agg(to_jsonb(a)-'grupo'-'periodo'-'sucursal' ORDER BY CASE marca WHEN 'CLAAS' THEN 1 WHEN 'HORSCH' THEN 2 ELSE 3 END) FROM agregados a WHERE grupo='marca'),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.ventas_repuestos_listado_v2(
  p_desde date,p_hasta date,p_sucursal text DEFAULT NULL,p_buscar text DEFAULT NULL,
  p_vista text DEFAULT 'detalle',p_pagina integer DEFAULT 1,p_por_pagina integer DEFAULT 50
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp SET statement_timeout='30s' AS $$
DECLARE v_result jsonb; v_page integer:=greatest(coalesce(p_pagina,1),1); v_size integer:=least(greatest(coalesce(p_por_pagina,50),10),100);
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(),'repuestos.ventas') THEN RAISE EXCEPTION 'No tenes acceso a Ventas de Repuestos' USING errcode='42501'; END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_desde>p_hasta THEN RAISE EXCEPTION 'Seleccioná un rango de fechas válido.' USING errcode='22023'; END IF;
  IF p_vista NOT IN('detalle','clientes','repuestos','vendedores') THEN RAISE EXCEPTION 'Vista inválida' USING errcode='22023'; END IF;
  WITH base AS MATERIALIZED (
    SELECT * FROM public.ventas_repuestos_movimientos_v2(CASE WHEN p_vista='clientes' THEN (p_desde-interval '1 year')::date ELSE p_desde END,p_hasta,p_sucursal,p_buscar)
  ), actual AS MATERIALIZED (SELECT * FROM base WHERE fecha BETWEEN p_desde AND p_hasta),
  anteriores AS (SELECT cliente,sum(importe) anterior FROM base WHERE p_vista='clientes' AND fecha BETWEEN (p_desde-interval '1 year')::date AND (p_hasta-interval '1 year')::date GROUP BY cliente),
  agrupados AS (
    SELECT CASE WHEN p_vista='clientes' THEN cliente WHEN p_vista='vendedores' THEN coalesce(vendedor,'Sin vendedor') ELSE jsonb_build_array(codigo,codigo_fabricante,CASE WHEN codigo IS NULL AND codigo_fabricante IS NULL THEN descripcion END)::text END id,
      CASE WHEN p_vista='clientes' THEN cliente END cliente,CASE WHEN p_vista='vendedores' THEN coalesce(vendedor,'Sin vendedor') END vendedor,
      CASE WHEN p_vista='repuestos' THEN codigo END codigo,CASE WHEN p_vista='repuestos' THEN codigo_fabricante END codigo_fabricante,
      CASE WHEN p_vista='repuestos' THEN string_agg(DISTINCT metodologia,',') END metodologia,min(descripcion) descripcion,max(fecha) ultima,
      sum(importe) facturado,coalesce(sum(importe) FILTER(WHERE NOT es_nota_credito),0) ventas,
      coalesce(sum(importe) FILTER(WHERE es_nota_credito),0) notas_credito,count(DISTINCT cliente) clientes,
      count(DISTINCT documento) documentos,count(*) lineas,
      CASE WHEN count(*) FILTER(WHERE cantidad IS NULL)>0 THEN NULL ELSE sum(cantidad) END unidades_netas,
      CASE WHEN count(*) FILTER(WHERE cantidad IS NULL)>0 THEN NULL ELSE coalesce(sum(cantidad) FILTER(WHERE NOT es_nota_credito),0) END unidades_vendidas,
      CASE WHEN count(*) FILTER(WHERE cantidad IS NULL)>0 THEN NULL ELSE coalesce(sum(abs(cantidad)) FILTER(WHERE es_nota_credito),0) END unidades_devueltas
    FROM actual WHERE p_vista IN('clientes','repuestos','vendedores') GROUP BY 1,2,3,4,5
  ), filas AS (
    SELECT a.id,a.facturado,jsonb_build_object('id',a.id,'fecha',a.fecha,'factura',a.factura,'cliente',a.cliente,'sucursal',a.sucursal,'codigo',a.codigo,'codigo_fabricante',a.codigo_fabricante,'descripcion',a.descripcion,'metodologia',a.metodologia,'cantidad',a.cantidad,'facturado',a.importe,'es_nota_credito',a.es_nota_credito,'marca',a.marca,'vendedor',a.vendedor) datos,a.fecha,a.documento,a.vendedor
    FROM (SELECT *,importe facturado FROM actual)a WHERE p_vista='detalle'
    UNION ALL SELECT g.id,g.facturado,to_jsonb(g)||jsonb_build_object('anterior',a.anterior),g.ultima,NULL::text,g.vendedor FROM agrupados g LEFT JOIN anteriores a ON p_vista='clientes' AND a.cliente=g.cliente
  ), pagina AS (
    SELECT * FROM filas ORDER BY CASE WHEN p_vista='detalle' THEN fecha END DESC NULLS LAST,documento DESC NULLS LAST,
      CASE WHEN p_vista='vendedores' THEN (coalesce(vendedor,'Sin vendedor')='Sin vendedor')::integer END,
      CASE WHEN p_vista<>'detalle' THEN facturado END DESC,id LIMIT v_size OFFSET (v_page-1)*v_size
  ) SELECT jsonb_build_object('total',(SELECT count(*) FROM filas),'pagina',v_page,'paginas',greatest(1,ceil((SELECT count(*) FROM filas)::numeric/v_size)),'por_pagina',v_size,'total_periodo',coalesce((SELECT sum(importe) FROM actual),0),
    'filas',coalesce((SELECT jsonb_agg(datos ORDER BY CASE WHEN p_vista='detalle' THEN fecha END DESC NULLS LAST,documento DESC NULLS LAST,CASE WHEN p_vista='vendedores' THEN (coalesce(vendedor,'Sin vendedor')='Sin vendedor')::integer END,CASE WHEN p_vista<>'detalle' THEN facturado END DESC,id) FROM pagina),'[]'::jsonb)) INTO v_result;
  RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.repuestos_importar_facturacion_historica_lote_v2(p_carga_id uuid,p_filas jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_recibidas integer:=jsonb_array_length(coalesce(p_filas,'[]'::jsonb)); v_afectadas integer:=0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'Solo un administrador puede cargar la facturacion historica' USING errcode='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.repuestos_facturacion_historica_cargas WHERE id=p_carga_id AND estado='PROCESANDO') THEN RAISE EXCEPTION 'La carga no existe o ya fue cerrada'; END IF;
  INSERT INTO public.facturacion_lineas_importadas(origen_sistema,codigo_interno_factura,factura,entidad_nombre,fecha_factura,subgrupo_original,grupo_normalizado,marca_normalizada,tipo_facturacion,tipo_tiempo,observacion,cod_mercaderia,mercaderia,cantidad,valor_unitario,total_venta,moneda,vendedor,raw_data)
  SELECT 'legacy_historico_detallado',nullif(btrim(x.documento),''),nullif(btrim(x.documento),''),coalesce(nullif(btrim(x.entidad),''),'CLIENTE HISTORICO'),x.fecha::timestamptz,nullif(btrim(x.grupo),''),'Repuestos',CASE WHEN upper(coalesce(x.grupo,'')) LIKE '%CLAAS%' THEN 'CLAAS'::public.marca WHEN upper(coalesce(x.grupo,'')) LIKE '%HORSCH%' OR upper(coalesce(x.grupo,'')) LIKE '%PLANTADOR%' OR upper(coalesce(x.grupo,'')) LIKE '%PULVERIZ%' THEN 'HORSCH'::public.marca ELSE 'OTROS'::public.marca END,'Repuesto'::public.tipo_facturacion,'Cliente','HISTORICO_LEGACY:'||btrim(x.linea_clave),btrim(x.codigo_legacy),coalesce(nullif(btrim(x.descripcion),''),'Producto historico '||x.codigo_legacy),x.cantidad,coalesce(x.valor_unitario,0),x.total_venta,'USD',nullif(btrim(x.vendedor),''),jsonb_build_object('carga_id',p_carga_id,'linea_clave',btrim(x.linea_clave),'grupo_original',x.grupo,'sucursal_original',x.sucursal,'movimiento',upper(coalesce(x.movimiento,'S')),'vendedor',nullif(btrim(x.vendedor),''))
  FROM jsonb_to_recordset(coalesce(p_filas,'[]'::jsonb))x(linea_clave text,fecha date,documento text,codigo_legacy text,descripcion text,entidad text,grupo text,sucursal text,vendedor text,movimiento text,cantidad numeric,valor_unitario numeric,total_venta numeric)
  WHERE nullif(btrim(x.linea_clave),'') IS NOT NULL AND x.fecha IS NOT NULL AND x.fecha<date '2026-07-01' AND nullif(btrim(x.codigo_legacy),'') IS NOT NULL AND upper(coalesce(btrim(x.movimiento),'S')) IN('S','E') AND ((upper(coalesce(btrim(x.movimiento),'S'))='E' AND x.total_venta<0 AND x.cantidad<=0) OR (upper(coalesce(btrim(x.movimiento),'S'))='S' AND x.total_venta>=0 AND x.cantidad>=0))
  ON CONFLICT(origen_sistema,linea_hash) DO UPDATE SET vendedor=coalesce(EXCLUDED.vendedor,facturacion_lineas_importadas.vendedor),raw_data=facturacion_lineas_importadas.raw_data||jsonb_strip_nulls(jsonb_build_object('vendedor',EXCLUDED.vendedor));
  GET DIAGNOSTICS v_afectadas=ROW_COUNT;
  UPDATE public.repuestos_facturacion_historica_cargas SET filas_recibidas=least(CASE WHEN filas_archivo>0 THEN filas_archivo ELSE filas_recibidas+v_recibidas END,filas_recibidas+v_recibidas) WHERE id=p_carga_id;
  RETURN jsonb_build_object('recibidas',v_recibidas,'procesadas',v_afectadas);
END $$;

REVOKE ALL ON FUNCTION public.ventas_repuestos_panorama_v2(date,date,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.ventas_repuestos_listado_v2(date,date,text,text,text,integer,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.repuestos_importar_facturacion_historica_lote_v2(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ventas_repuestos_panorama_v2(date,date,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ventas_repuestos_listado_v2(date,date,text,text,text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_importar_facturacion_historica_lote_v2(uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';