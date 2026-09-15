BEGIN;
-- Ventas de Repuestos usa el histórico detallado completo, nunca el agrupado.
-- Incluye los contratos de 20260915150000; puede aplicarse sin ejecutar ese archivo.
-- No cambia las fuentes de Servicios/Máquinas ni el stock físico.
DO $$ BEGIN
  IF to_regprocedure('public.cliente_nombre_canonico(text)') IS NULL THEN
    RAISE EXCEPTION 'Aplicá primero 20260915120000_resolve_service_stock_owners_and_campos_identity.sql';
  END IF;
END $$;

-- Vista completa: no aplica el filtro de vínculos CONFIRMADA de Sugerencias.
-- Un artículo sin catálogo conserva su código histórico, descripción e importe.
CREATE OR REPLACE VIEW public.v_ventas_repuestos_historico_completo
WITH (security_invoker = true) AS
SELECT f.id::text AS linea_id, f.fecha_factura::date AS fecha,
  coalesce(nullif(btrim(f.factura),''),nullif(btrim(f.codigo_interno_factura),'')) AS factura,
  f.entidad_nombre AS cliente,
  CASE upper(btrim(coalesce(f.raw_data->>'sucursal_original','')))
    WHEN 'CENTRAL' THEN 'Santa Rita' WHEN 'SANTA RITA' THEN 'Santa Rita'
    WHEN 'SR' THEN 'Santa Rita' WHEN 'KATUETE' THEN 'Katuete'
    WHEN 'KT' THEN 'Katuete' WHEN 'CAMPO 9' THEN 'Campo 9'
    WHEN 'CAMPO9' THEN 'Campo 9' WHEN 'C9' THEN 'Campo 9'
    WHEN 'MISIONES' THEN 'Misiones' WHEN 'MS' THEN 'Misiones'
    WHEN 'LOMA PLATA' THEN 'Loma Plata'
    WHEN 'SANTA ROSA DEL AGUARAY' THEN 'Santa Rosa' WHEN 'SANTA ROSA' THEN 'Santa Rosa'
    ELSE coalesce(nullif(btrim(f.raw_data->>'sucursal_original'),''),'Sucursal no informada')
  END AS sucursal,
  coalesce(p.codigo_interno,nullif(btrim(f.cod_mercaderia),'')) AS codigo,
  coalesce(nullif(btrim(f.codigo_fabricante),''),p.codigo_fabricante) AS codigo_fabricante,
  coalesce(nullif(btrim(f.mercaderia),''),p.descripcion,'Descripción no informada') AS descripcion,
  f.cod_mercaderia AS codigo_legacy,
  f.cantidad * coalesce(conv.factor_cantidad,1) AS cantidad,
  coalesce(f.total_venta,0) AS importe,
  upper(coalesce(f.raw_data->>'movimiento','S'))='E' OR f.total_venta<0 AS es_nota_credito,
  f.fecha_factura
FROM public.facturacion_lineas_importadas f
LEFT JOIN public.repuestos_ventas_vinculacion v
  ON v.linea_id=f.id AND v.estado_vinculo='CONFIRMADA'
LEFT JOIN public.productos p ON p.codigo_interno=v.producto_codigo
LEFT JOIN LATERAL (
  SELECT r.factor_cantidad FROM public.repuestos_conversiones_unidad_historica r
  WHERE r.activa AND r.codigo_legacy_norm=public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia)
    AND (r.fecha_desde IS NULL OR f.fecha_factura::date>=r.fecha_desde)
    AND (r.fecha_hasta_exclusiva IS NULL OR f.fecha_factura::date<r.fecha_hasta_exclusiva)
    AND (r.precio_unitario_min IS NULL OR abs(f.total_venta/nullif(f.cantidad,0))>=r.precio_unitario_min)
    AND (r.precio_unitario_max IS NULL OR abs(f.total_venta/nullif(f.cantidad,0))<=r.precio_unitario_max)
  ORDER BY r.id LIMIT 1
) conv ON true
WHERE f.origen_sistema='legacy_historico_detallado'
  AND f.fecha_factura < timestamptz '2026-07-01 00:00:00+00'
  AND upper(btrim(coalesce(f.moneda,'USD')))='USD';
REVOKE ALL ON public.v_ventas_repuestos_historico_completo FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.ventas_repuestos_movimientos_v1(
  p_desde date, p_hasta date, p_sucursal text, p_buscar text
) RETURNS TABLE(id text,fecha date,factura text,cliente text,sucursal text,
  metodologia text,codigo text,codigo_fabricante text,descripcion text,
  cantidad numeric,importe numeric,es_nota_credito boolean,documento text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH fuentes AS (
    SELECT h.linea_id,h.fecha,h.factura,h.cliente,h.sucursal,'historico'::text AS metodologia,
      h.codigo,h.codigo_fabricante,h.descripcion,h.cantidad,h.importe,h.es_nota_credito,h.codigo_legacy
    FROM public.v_ventas_repuestos_historico_completo h
    WHERE h.fecha_factura >= p_desde::timestamptz
      AND h.fecha_factura < (least(p_hasta,date '2026-06-30')+1)::timestamptz
    UNION ALL
    SELECT m.linea_id,m.fecha,m.factura,m.cliente,m.sucursal,m.metodologia,
      m.codigo,m.codigo_fabricante,m.descripcion,m.cantidad,m.total_venta,
      m.es_nota_credito OR m.total_venta<0,m.codigo
    FROM public.ventas_area_movimientos_base(greatest(p_desde,date '2026-07-01'),p_hasta,NULL,NULL) m
    WHERE m.area_calculada='repuestos' AND m.fecha>=date '2026-07-01'
  ), canonico AS (
    SELECT *,coalesce(public.cliente_nombre_canonico(cliente),'Cliente no informado') AS cliente_final
    FROM fuentes
  )
  SELECT metodologia||':'||linea_id,fecha,factura,cliente_final,sucursal,
    metodologia,codigo,codigo_fabricante,descripcion,
    CASE WHEN es_nota_credito THEN -abs(cantidad) ELSE cantidad END,importe,es_nota_credito,
    jsonb_build_array(metodologia,fecha,sucursal,coalesce(factura,'linea:'||linea_id),es_nota_credito)::text
  FROM canonico
  WHERE (nullif(btrim(p_sucursal),'') IS NULL OR upper(btrim(p_sucursal))='TODAS'
    OR upper(sucursal)=upper(btrim(p_sucursal)))
    AND (nullif(btrim(p_buscar),'') IS NULL OR concat_ws(' ',cliente_final,cliente,factura,
      codigo,codigo_fabricante,codigo_legacy,descripcion) ILIKE '%'||btrim(p_buscar)||'%');
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
        jsonb_build_array(codigo,codigo_fabricante,
          CASE WHEN codigo IS NULL AND codigo_fabricante IS NULL THEN descripcion END)::text END AS id,
      CASE WHEN p_vista='clientes' THEN cliente END AS cliente,
      CASE WHEN p_vista='repuestos' THEN codigo END AS codigo,
      CASE WHEN p_vista='repuestos' THEN codigo_fabricante END AS codigo_fabricante,
      CASE WHEN p_vista='repuestos' THEN string_agg(DISTINCT metodologia,',') END AS metodologia,
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
    GROUP BY 1,2,3,4
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


-- Estado explícito: cero NC no implica que el archivo haya sido revisado completo.
ALTER TABLE public.repuestos_facturacion_historica_cargas
  ADD COLUMN IF NOT EXISTS notas_credito_verificadas_en timestamptz,
  ADD COLUMN IF NOT EXISTS notas_credito_archivo integer;

CREATE OR REPLACE FUNCTION public.ventas_repuestos_estado_historico_v1()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(),'repuestos.ventas') THEN
    RAISE EXCEPTION 'No tenes acceso a Ventas de Repuestos' USING errcode='42501'; END IF;
  RETURN coalesce((SELECT jsonb_build_object('cargado',true,
    'notas_credito_verificadas',notas_credito_verificadas_en IS NOT NULL,
    'notas_credito_archivo',notas_credito_archivo)
    FROM public.repuestos_facturacion_historica_cargas WHERE activo AND estado='COMPLETADO'
    ORDER BY completado_en DESC LIMIT 1),jsonb_build_object('cargado',false,'notas_credito_verificadas',false));
END $$;

-- Corrección acotada del cargador inicial: mismos campos/hash, admite S y E.
-- No se abre la carga cerrada ni se cambia el importador agrupado de Servicios.
DO $$
DECLARE v_def text; v_antes text := 'AND upper(coalesce(trim(x.movimiento), ''S'')) = ''S''';
BEGIN
  v_def:=pg_get_functiondef('public.repuestos_importar_facturacion_historica_lote(uuid,jsonb)'::regprocedure);
  IF position(v_antes in v_def)>0 THEN
    v_def:=replace(v_def,v_antes,
      'AND upper(coalesce(trim(x.movimiento), ''S'')) IN (''S'',''E'')
       AND x.fecha < date ''2026-07-01''
       AND ((upper(coalesce(trim(x.movimiento),''S''))=''E'' AND x.total_venta<0 AND x.cantidad<=0)
         OR (upper(coalesce(trim(x.movimiento),''S''))=''S'' AND x.total_venta>=0 AND x.cantidad>=0))');
    EXECUTE v_def;
  ELSIF position('IN (''S'',''E'')' in v_def)=0 THEN
    RAISE EXCEPTION 'El cargador histórico cambió: revisar antes de reemplazar su filtro';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.repuestos_completar_notas_credito_historicas(
  p_carga_id uuid,p_filas jsonb,p_anclas jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp SET statement_timeout='25s' AS $$
DECLARE v_insertadas integer; v_cantidad integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede completar el histórico' USING errcode='42501'; END IF;
  PERFORM 1 FROM public.repuestos_facturacion_historica_cargas
    WHERE id=p_carga_id AND activo AND estado='COMPLETADO' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Se requiere la carga histórica completa y activa'; END IF;
  IF jsonb_typeof(p_filas) IS DISTINCT FROM 'array' OR jsonb_array_length(p_filas) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Lote inválido (1 a 1000 líneas)'; END IF;
  -- Contrastar ventas positivas ya cargadas asegura que se complementa el mismo Excel.
  IF jsonb_typeof(p_anclas) IS DISTINCT FROM 'array' OR jsonb_array_length(p_anclas) NOT BETWEEN 2 AND 50 THEN
    RAISE EXCEPTION 'Faltan referencias del archivo histórico original'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_anclas) a(linea_clave text,total_venta numeric)
    WHERE NOT EXISTS (SELECT 1 FROM public.facturacion_lineas_importadas f
      WHERE f.origen_sistema='legacy_historico_detallado'
        AND f.raw_data->>'linea_clave'=a.linea_clave AND f.total_venta=a.total_venta
        AND upper(coalesce(f.raw_data->>'movimiento','S'))='S')) THEN
    RAISE EXCEPTION 'El archivo no coincide con las ventas del histórico cargado'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_filas) x(
    linea_clave text,fecha date,codigo_legacy text,movimiento text,cantidad numeric,total_venta numeric)
    WHERE nullif(btrim(x.linea_clave),'') IS NULL OR x.fecha IS NULL OR x.fecha>=date '2026-07-01'
      OR nullif(btrim(x.codigo_legacy),'') IS NULL OR upper(x.movimiento) IS DISTINCT FROM 'E'
      OR x.cantidad IS NULL OR x.cantidad>0 OR x.total_venta IS NULL OR x.total_venta>=0) THEN
    RAISE EXCEPTION 'El complemento solo admite devoluciones E históricas con cantidades e importes negativos'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_filas) x(linea_clave text,total_venta numeric,cantidad numeric)
    JOIN public.facturacion_lineas_importadas f ON f.origen_sistema='legacy_historico_detallado'
      AND f.raw_data->>'linea_clave'=x.linea_clave
    WHERE f.total_venta IS DISTINCT FROM x.total_venta OR f.cantidad IS DISTINCT FROM x.cantidad) THEN
    RAISE EXCEPTION 'Una línea histórica existente difiere del archivo; no se sobrescribe'; END IF;
  INSERT INTO public.facturacion_lineas_importadas(
    origen_sistema,codigo_interno_factura,factura,entidad_nombre,fecha_factura,
    subgrupo_original,grupo_normalizado,marca_normalizada,tipo_facturacion,tipo_tiempo,
    observacion,cod_mercaderia,mercaderia,cantidad,valor_unitario,total_venta,moneda,raw_data)
  SELECT 'legacy_historico_detallado',nullif(btrim(x.documento),''),nullif(btrim(x.documento),''),
    coalesce(nullif(btrim(x.entidad),''),'CLIENTE HISTORICO'),x.fecha::timestamptz,
    nullif(btrim(x.grupo),''),'Repuestos',
    CASE WHEN upper(coalesce(x.grupo,'')) LIKE '%CLAAS%' THEN 'CLAAS'::public.marca
      WHEN upper(coalesce(x.grupo,'')) LIKE '%PLANTADOR%' OR upper(coalesce(x.grupo,'')) LIKE '%PULVERIZ%'
        THEN 'HORSCH'::public.marca ELSE 'OTROS'::public.marca END,
    'Repuesto'::public.tipo_facturacion,'Cliente','HISTORICO_LEGACY:'||btrim(x.linea_clave),
    btrim(x.codigo_legacy),coalesce(nullif(btrim(x.descripcion),''),'Producto historico '||x.codigo_legacy),
    x.cantidad,coalesce(x.valor_unitario,0),x.total_venta,'USD',
    jsonb_build_object('carga_id',p_carga_id,'linea_clave',btrim(x.linea_clave),
      'grupo_original',x.grupo,'sucursal_original',x.sucursal,'movimiento','E')
  FROM jsonb_to_recordset(p_filas) x(linea_clave text,fecha date,documento text,codigo_legacy text,
    descripcion text,entidad text,grupo text,sucursal text,movimiento text,cantidad numeric,
    valor_unitario numeric,total_venta numeric)
  WHERE NOT EXISTS (SELECT 1 FROM public.facturacion_lineas_importadas f
    WHERE f.origen_sistema='legacy_historico_detallado' AND f.raw_data->>'linea_clave'=btrim(x.linea_clave))
  ON CONFLICT (origen_sistema,linea_hash) DO NOTHING;
  GET DIAGNOSTICS v_insertadas=ROW_COUNT;
  v_cantidad:=jsonb_array_length(p_filas);
  UPDATE public.repuestos_facturacion_historica_cargas
    SET notas_credito_verificadas_en=NULL,publicacion_estado='PROCESANDO',publicado_en=NULL
    WHERE id=p_carga_id AND v_insertadas>0;
  RETURN jsonb_build_object('insertadas',v_insertadas,'existentes',v_cantidad-v_insertadas);
END $$;

CREATE OR REPLACE FUNCTION public.repuestos_verificar_notas_credito_historicas(
  p_carga_id uuid,p_claves text[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp SET statement_timeout='25s' AS $$
DECLARE v_total integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede verificar el histórico' USING errcode='42501'; END IF;
  PERFORM 1 FROM public.repuestos_facturacion_historica_cargas
    WHERE id=p_carga_id AND activo AND estado='COMPLETADO' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La carga histórica no está activa'; END IF;
  IF p_claves IS NULL OR cardinality(p_claves)>20000 OR array_position(p_claves,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Claves de verificación inválidas'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_claves) k WHERE NOT EXISTS (
    SELECT 1 FROM public.facturacion_lineas_importadas f
    WHERE f.origen_sistema='legacy_historico_detallado' AND f.raw_data->>'linea_clave'=k
      AND upper(f.raw_data->>'movimiento')='E' AND f.total_venta<0)) THEN
    RAISE EXCEPTION 'Quedan notas de crédito del archivo sin cargar'; END IF;
  SELECT count(DISTINCT k) INTO v_total FROM unnest(p_claves) k;
  UPDATE public.repuestos_facturacion_historica_cargas
    SET notas_credito_verificadas_en=now(),notas_credito_archivo=v_total WHERE id=p_carga_id;
  RETURN jsonb_build_object('verificadas',v_total);
END $$;

-- Índice de texto puro: inmutable y compatible con PostgreSQL.
CREATE INDEX IF NOT EXISTS facturacion_legacy_linea_clave_idx
ON public.facturacion_lineas_importadas((raw_data->>'linea_clave'))
WHERE origen_sistema='legacy_historico_detallado';
CREATE INDEX IF NOT EXISTS facturacion_legacy_ventas_fecha_idx
ON public.facturacion_lineas_importadas(fecha_factura)
WHERE origen_sistema='legacy_historico_detallado';

REVOKE ALL ON FUNCTION public.ventas_repuestos_estado_historico_v1() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.repuestos_completar_notas_credito_historicas(uuid,jsonb,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.repuestos_verificar_notas_credito_historicas(uuid,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ventas_repuestos_estado_historico_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_completar_notas_credito_historicas(uuid,jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_verificar_notas_credito_historicas(uuid,text[]) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
