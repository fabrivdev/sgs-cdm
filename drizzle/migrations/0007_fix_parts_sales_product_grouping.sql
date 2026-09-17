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
  producto_marcas AS (
    SELECT coalesce(nullif(codigo,''),nullif(codigo_fabricante,''),descripcion) producto_id,marca,sum(importe) facturado_marca
    FROM actual WHERE p_vista='repuestos'
    GROUP BY coalesce(nullif(codigo,''),nullif(codigo_fabricante,''),descripcion),marca
  ), producto_marca AS (
    SELECT DISTINCT ON (producto_id) producto_id,marca
    FROM producto_marcas
    ORDER BY producto_id,facturado_marca DESC NULLS LAST,CASE marca WHEN 'CLAAS' THEN 1 WHEN 'HORSCH' THEN 2 ELSE 3 END
  ), agrupados AS (
    SELECT CASE WHEN p_vista='clientes' THEN cliente WHEN p_vista='vendedores' THEN coalesce(vendedor,'Sin vendedor') ELSE coalesce(nullif(codigo,''),nullif(codigo_fabricante,''),descripcion) END id,
      CASE WHEN p_vista='clientes' THEN min(cliente) END cliente,CASE WHEN p_vista='vendedores' THEN min(coalesce(vendedor,'Sin vendedor')) END vendedor,
      CASE WHEN p_vista='repuestos' THEN min(coalesce(nullif(codigo,''),nullif(codigo_fabricante,''))) END codigo,
      CASE WHEN p_vista='repuestos' THEN string_agg(DISTINCT metodologia,',') END metodologia,min(descripcion) descripcion,max(fecha) ultima,
      sum(importe) facturado,coalesce(sum(importe) FILTER(WHERE NOT es_nota_credito),0) ventas,
      coalesce(sum(importe) FILTER(WHERE es_nota_credito),0) notas_credito,count(DISTINCT cliente) clientes,
      count(DISTINCT documento) documentos,count(*) lineas,
      CASE WHEN count(*) FILTER(WHERE cantidad IS NULL)>0 THEN NULL ELSE sum(cantidad) END unidades_netas,
      CASE WHEN count(*) FILTER(WHERE cantidad IS NULL)>0 THEN NULL ELSE coalesce(sum(cantidad) FILTER(WHERE NOT es_nota_credito),0) END unidades_vendidas,
      CASE WHEN count(*) FILTER(WHERE cantidad IS NULL)>0 THEN NULL ELSE coalesce(sum(abs(cantidad)) FILTER(WHERE es_nota_credito),0) END unidades_devueltas
    FROM actual WHERE p_vista IN('clientes','repuestos','vendedores') GROUP BY 1
  ), agrupados_marca AS (
    SELECT g.*,CASE WHEN p_vista='repuestos' THEN coalesce(pm.marca,'OTROS') END marca
    FROM agrupados g LEFT JOIN producto_marca pm ON p_vista='repuestos' AND pm.producto_id=g.id
  ), clasificados AS (
    SELECT g.*,
      CASE WHEN p_vista='repuestos' AND g.facturado>0 AND sum(g.facturado) FILTER(WHERE g.facturado>0) OVER()>0 THEN
        CASE WHEN coalesce(sum(g.facturado) FILTER(WHERE g.facturado>0) OVER(ORDER BY g.facturado DESC,g.id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0)
                    / sum(g.facturado) FILTER(WHERE g.facturado>0) OVER() < 0.80 THEN 'A'
             WHEN coalesce(sum(g.facturado) FILTER(WHERE g.facturado>0) OVER(ORDER BY g.facturado DESC,g.id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0)
                    / sum(g.facturado) FILTER(WHERE g.facturado>0) OVER() < 0.95 THEN 'B'
             ELSE 'C' END
      END abc
    FROM agrupados_marca g
  ), filas AS (
    SELECT a.id,a.facturado,jsonb_build_object('id',a.id,'fecha',a.fecha,'factura',a.factura,'cliente',a.cliente,'sucursal',a.sucursal,'codigo',a.codigo,'codigo_fabricante',a.codigo_fabricante,'descripcion',a.descripcion,'metodologia',a.metodologia,'cantidad',a.cantidad,'facturado',a.importe,'es_nota_credito',a.es_nota_credito,'marca',a.marca,'vendedor',a.vendedor) datos,a.fecha,a.documento,a.vendedor
    FROM (SELECT *,importe facturado FROM actual)a WHERE p_vista='detalle'
    UNION ALL SELECT g.id,g.facturado,to_jsonb(g)||jsonb_build_object('anterior',a.anterior),g.ultima,NULL::text,g.vendedor FROM clasificados g LEFT JOIN anteriores a ON p_vista='clientes' AND a.cliente=g.cliente
  ), pagina AS (
    SELECT * FROM filas ORDER BY CASE WHEN p_vista='detalle' THEN fecha END DESC NULLS LAST,documento DESC NULLS LAST,
      CASE WHEN p_vista='vendedores' THEN (coalesce(vendedor,'Sin vendedor')='Sin vendedor')::integer END,
      CASE WHEN p_vista<>'detalle' THEN facturado END DESC,id LIMIT v_size OFFSET (v_page-1)*v_size
  ) SELECT jsonb_build_object('total',(SELECT count(*) FROM filas),'pagina',v_page,'paginas',greatest(1,ceil((SELECT count(*) FROM filas)::numeric/v_size)),'por_pagina',v_size,'total_periodo',coalesce((SELECT sum(importe) FROM actual),0),
    'filas',coalesce((SELECT jsonb_agg(datos ORDER BY CASE WHEN p_vista='detalle' THEN fecha END DESC NULLS LAST,documento DESC NULLS LAST,CASE WHEN p_vista='vendedores' THEN (coalesce(vendedor,'Sin vendedor')='Sin vendedor')::integer END,CASE WHEN p_vista<>'detalle' THEN facturado END DESC,id) FROM pagina),'[]'::jsonb)) INTO v_result;
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.ventas_repuestos_listado_v2(date,date,text,text,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ventas_repuestos_listado_v2(date,date,text,text,text,integer,integer) TO authenticated;
NOTIFY pgrst,'reload schema';