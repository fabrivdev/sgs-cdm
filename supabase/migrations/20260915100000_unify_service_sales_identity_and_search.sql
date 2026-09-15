BEGIN;

-- Sólo Ventas de Servicios. No modifica imports, OS, Comisiones ni la fuente
-- compartida con Máquinas/Repuestos. Cada movimiento conserva su importe/fecha.
CREATE OR REPLACE FUNCTION public.ventas_servicios_texto_normalizado(p_texto text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, pg_temp AS $$
  SELECT btrim(regexp_replace(translate(upper(coalesce(p_texto,'')),
    'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '[^A-Z0-9]+', ' ', 'g'));
$$;

-- Conserva los tres segmentos: no confunde 1-3-54 con 13-5-4.
-- Sólo quita ceros de relleno en números con tres segmentos explícitos.
CREATE OR REPLACE FUNCTION public.ventas_servicios_factura_clave(p_factura text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN btrim(p_factura) ~ '^[0-9]+[-/][0-9]+[-/][0-9]+$'
    THEN (SELECT string_agg(coalesce(nullif(ltrim(s.valor,'0'),''),'0'), '-' ORDER BY s.n)
      FROM regexp_split_to_table(btrim(p_factura),'[-/]') WITH ORDINALITY s(valor,n))
    ELSE nullif(upper(regexp_replace(btrim(p_factura),'\s+','','g')),'') END;
$$;

CREATE OR REPLACE FUNCTION public.ventas_servicios_movimientos_enriquecidos(
  p_desde date, p_hasta date, p_sucursal text DEFAULT NULL
)
RETURNS TABLE (
  linea_id text, fecha date, factura text, cliente text, sucursal text,
  concepto text, total_venta numeric, metodologia text, vinculada_os boolean,
  es_nota_credito boolean, os_numero text, codigo text, codigo_fabricante text,
  descripcion text, cantidad numeric, marca text, modelo text, chasis text,
  area_calculada text, nro_chasis text, propietario text, propietario_os text,
  cliente_os text, marca_parque text, tipo_maquina text, tipo_tiempo text,
  vinculo_os text, texto_busqueda text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '120s'
SET plan_cache_mode = 'force_custom_plan'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(),'servicios.ventas') THEN
    RAISE EXCEPTION 'No tenes acceso a Ventas de Servicios' USING ERRCODE='42501';
  END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_desde > p_hasta THEN
    RAISE EXCEPTION 'Rango de fechas invalido' USING ERRCODE='22023';
  END IF;
  RETURN QUERY
  WITH movimientos AS MATERIALIZED (
    SELECT b.* FROM public.ventas_area_movimientos_base(p_desde,p_hasta,p_sucursal,NULL) b
    WHERE b.area_calculada='servicios'
      AND b.concepto IN ('Servicio','Kilometraje','Repuestos','Terceros')
  ), ordenes_unicas AS MATERIALIZED (
    -- La PK original no impide duplicados que sólo difieran en espacios/case.
    SELECT o.* FROM (
      SELECT os.*,count(*) OVER (PARTITION BY upper(btrim(os.os_numero))) AS coincidencias
      FROM public.ordenes_servicio_importadas os
    ) o WHERE o.coincidencias=1
  ), documentos AS MATERIALIZED (
    SELECT DISTINCT b.factura, b.sucursal, extract(year FROM b.fecha)::integer AS anio
    FROM movimientos b WHERE b.metodologia='historico' AND b.factura IS NOT NULL
  ), referencias AS MATERIALIZED (
    -- Se desglosan las facturas de las OS una sola vez, no por línea facturada.
    SELECT os.os_numero, public.ventas_servicios_factura_clave(t.factura) AS factura_clave,
      extract(year FROM os.fecha_emision_factura AT TIME ZONE 'America/Asuncion')::integer AS anio,
      public.ventas_servicios_texto_normalizado(coalesce(
        nullif(btrim(os.raw_data->>'canonical_branch'),''), trabajo.sucursal::text)) AS sucursal_clave
    FROM public.ordenes_servicio_importadas os
    LEFT JOIN public.trabajos trabajo ON trabajo.id=os.trabajo_id
    CROSS JOIN LATERAL regexp_split_to_table(coalesce(os.factura,''),';') t(factura)
    WHERE os.fecha_emision_factura IS NOT NULL AND p_desde <= date '2026-06-30'
      AND nullif(btrim(t.factura),'') IS NOT NULL
  ), correspondencias AS MATERIALIZED (
    SELECT d.factura,d.sucursal,d.anio,
      CASE WHEN count(DISTINCT r.os_numero)=1 THEN min(r.os_numero) END AS os_numero,
      count(DISTINCT r.os_numero) AS candidatos
    FROM documentos d LEFT JOIN referencias r
      ON r.factura_clave=public.ventas_servicios_factura_clave(d.factura)
      AND r.anio=d.anio AND r.sucursal_clave<>''
      AND r.sucursal_clave=public.ventas_servicios_texto_normalizado(d.sucursal)
    GROUP BY d.factura,d.sucursal,d.anio
  ), maquinas AS MATERIALIZED (
    SELECT public.parque_normalizar_clave(p.serie) AS chasis_clave,
      CASE WHEN count(*)=1 THEN max(c.nombre) END AS propietario,
      CASE WHEN count(*)=1 THEN max(coalesce(nullif(p.marca_nombre,''),p.marca::text)) END AS marca_parque,
      CASE WHEN count(*)=1 THEN max(coalesce(nullif(p.subgrupo_personalizado,''),p.subgrupo::text)) END AS tipo_maquina
    FROM public.parque_maquinas p LEFT JOIN public.clientes c ON c.id=p.cliente_id
    WHERE nullif(public.parque_normalizar_clave(p.serie),'') IS NOT NULL
    GROUP BY public.parque_normalizar_clave(p.serie)
  ), enriquecidos AS (
    SELECT b.linea_id,b.fecha,b.factura,b.cliente,b.sucursal,b.concepto,b.total_venta,
      b.metodologia,(b.vinculada_os OR co.os_numero IS NOT NULL) AS vinculada_os,
      b.es_nota_credito,coalesce(b.os_numero,co.os_numero) AS os_numero,
      b.codigo,b.codigo_fabricante,b.descripcion,b.cantidad,b.marca,b.modelo,b.chasis,b.area_calculada,
      nullif(btrim(os.nro_chasis),'') AS nro_chasis,m.propietario,
      coalesce(nullif(btrim(os.raw_data->>'Nombre'),''),
        CASE WHEN os.raw_data->>'CLIFAC' IS NULL THEN nullif(btrim(os.cliente_nombre),'') END) AS propietario_os,
      os.cliente_nombre AS cliente_os,m.marca_parque,m.tipo_maquina,
      public.ventas_tipo_tiempo_normalizado(coalesce(nullif(fl.tipo_tiempo,''),
        nullif(fl.raw_data->>'canonical_time_type',''),os.tipo_tiempo)) AS tipo_tiempo,
      CASE WHEN b.os_numero IS NOT NULL THEN 'actual'
        WHEN co.os_numero IS NOT NULL THEN 'factura_sucursal_anio'
        WHEN co.candidatos>1 THEN 'ambiguo' ELSE 'sin_vinculo_verificable' END AS vinculo_os
    FROM movimientos b
    LEFT JOIN correspondencias co ON b.metodologia='historico' AND co.factura=b.factura
      AND co.sucursal IS NOT DISTINCT FROM b.sucursal AND co.anio=extract(year FROM b.fecha)::integer
    LEFT JOIN public.facturacion_lineas_importadas fl
      ON fl.id=CASE WHEN b.metodologia='actual' THEN b.linea_id::uuid ELSE NULL::uuid END
    LEFT JOIN ordenes_unicas os
      ON upper(btrim(os.os_numero))=upper(btrim(coalesce(b.os_numero,co.os_numero)))
    LEFT JOIN maquinas m ON m.chasis_clave=public.parque_normalizar_clave(os.nro_chasis)
  )
  SELECT e.*,public.ventas_servicios_texto_normalizado(concat_ws(' ',
    e.os_numero,e.factura,e.propietario,e.propietario_os,e.cliente_os,e.cliente,
    e.nro_chasis,e.tipo_tiempo,e.descripcion)) FROM enriquecidos e;
END;
$$;

REVOKE ALL ON FUNCTION public.ventas_servicios_movimientos_enriquecidos(date,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ventas_servicios_movimientos_enriquecidos(date,date,text) TO authenticated;
create or replace function public.ventas_servicios_panorama_v2(
  p_desde date,
  p_hasta date,
  p_sucursal text default null,
  p_tipo_tiempo text default null,
  p_agrupacion text default 'mes',
  p_buscar text default null,
  p_marca text default null,
  p_tipo_maquina text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
set statement_timeout = '120s'
set plan_cache_mode = 'force_custom_plan'
as $$
declare
  v_resultado jsonb;
  v_agrupacion text := lower(trim(coalesce(p_agrupacion, 'mes')));
  v_date_part text;
  v_intervalo interval;
begin
  if auth.uid() is null or not public.has_section_access(auth.uid(), 'servicios.ventas') then
    raise exception 'No tenes acceso a Ventas de Servicios' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'Rango de fechas invalido' using errcode = '22023';
  end if;
  if v_agrupacion not in ('dia', 'semana', 'mes', 'anio') then
    raise exception 'Agrupacion invalida' using errcode = '22023';
  end if;

  v_date_part := case v_agrupacion when 'dia' then 'day' when 'semana' then 'week' when 'anio' then 'year' else 'month' end;
  v_intervalo := case v_agrupacion when 'dia' then interval '1 day' when 'semana' then interval '1 week' when 'anio' then interval '1 year' else interval '1 month' end;

  with base as materialized (
    select b.*
    from public.ventas_servicios_movimientos_enriquecidos(p_desde,p_hasta,p_sucursal) b
    where (p_marca is null or coalesce(b.marca_parque,'Sin identificar')=p_marca)
      and (p_tipo_maquina is null or coalesce(b.tipo_maquina,'Sin identificar')=p_tipo_maquina)
      and (coalesce(public.ventas_servicios_texto_normalizado(p_buscar),'')='' or strpos(b.texto_busqueda,public.ventas_servicios_texto_normalizado(p_buscar))>0)
  ), filtrada as materialized (
    select * from base b
    where p_tipo_tiempo is null or trim(p_tipo_tiempo) = '' or upper(trim(p_tipo_tiempo)) = 'TODOS'
      or b.tipo_tiempo = public.ventas_tipo_tiempo_normalizado(p_tipo_tiempo)
  ), periodos as (
    select generate_series(
      date_trunc(v_date_part, p_desde::timestamp),
      date_trunc(v_date_part, p_hasta::timestamp),
      v_intervalo
    )::date as periodo
  ), facturado as (
    select date_trunc(v_date_part, f.fecha::timestamp)::date as periodo,
      sum(f.total_venta)::numeric as subtotal,
      coalesce(sum(f.total_venta) filter (where f.concepto = 'Servicio'), 0)::numeric as mo,
      coalesce(sum(f.total_venta) filter (where f.concepto = 'Kilometraje'), 0)::numeric as km,
      coalesce(sum(f.total_venta) filter (where f.concepto = 'Repuestos'), 0)::numeric as repuestos,
      coalesce(sum(f.total_venta) filter (where f.concepto = 'Terceros'), 0)::numeric as terceros,
      count(distinct jsonb_build_array(f.factura, f.fecha, f.cliente, f.sucursal, case when f.factura is null then f.linea_id end))::integer as facturas,
      count(distinct nullif(f.cliente, ''))::integer as clientes,
      case when min(f.metodologia) = max(f.metodologia) then min(f.metodologia) else 'mixto' end as metodologia
    from filtrada f group by 1
  ), resumen_facturado as (
    select coalesce(sum(total_venta), 0)::numeric as subtotal,
      count(distinct jsonb_build_array(factura, fecha, cliente, sucursal, case when factura is null then linea_id end))::integer as facturas,
      count(distinct nullif(cliente, ''))::integer as clientes,
      count(distinct os_numero)::integer as ordenes
    from filtrada
  )
  select jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta, 'agrupacion', v_agrupacion,
    'resumen', jsonb_build_object(
      'total', rf.subtotal,
      'facturas', rf.facturas, 'clientes', rf.clientes, 'ordenes', rf.ordenes,
      'promedio', case when rf.ordenes > 0 then rf.subtotal / rf.ordenes else 0 end
    ),
    'periodos', coalesce(jsonb_agg(jsonb_build_object(
      'periodo', p.periodo,
      'total', coalesce(f.subtotal, 0),
      'mo', coalesce(f.mo, 0), 'km', coalesce(f.km, 0),
      'repuestos', coalesce(f.repuestos, 0),
      'terceros', coalesce(f.terceros, 0),
      'facturas', coalesce(f.facturas, 0), 'clientes', coalesce(f.clientes, 0),
      'metodologia', coalesce(f.metodologia, case when p.periodo < date '2026-07-01' then 'historico' else 'actual' end)
    ) order by p.periodo), '[]'::jsonb)
  ) into v_resultado
  from periodos p
  left join facturado f using (periodo)
  cross join resumen_facturado rf
  group by rf.subtotal, rf.facturas, rf.clientes, rf.ordenes;

  return v_resultado;
end;
$$;

revoke all on function public.ventas_servicios_panorama_v2(date, date, text, text, text, text, text, text) from public, anon;
grant execute on function public.ventas_servicios_panorama_v2(date, date, text, text, text, text, text, text) to authenticated;

create or replace function public.ventas_servicios_detalle_os_v2(
  p_desde date,
  p_hasta date,
  p_sucursal text default null,
  p_buscar text default null,
  p_tipo_tiempo text default null,
  p_marca text default null,
  p_tipo_maquina text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
set statement_timeout = '120s'
set plan_cache_mode = 'force_custom_plan'
as $$
declare v_resultado jsonb;
begin
  if auth.uid() is null or not public.has_section_access(auth.uid(), 'servicios.ventas') then
    raise exception 'No tenes acceso a Ventas de Servicios' using errcode = '42501';
  end if;

  with base as materialized (
    select b.*,
      case when b.os_numero is not null then 'OS:' || upper(trim(b.os_numero))
        else jsonb_build_array(b.metodologia,b.factura,b.cliente,b.sucursal,b.fecha,case when b.factura is null then b.linea_id end)::text end as clave
    from public.ventas_servicios_movimientos_enriquecidos(p_desde,p_hasta,p_sucursal) b
    where (p_marca is null or coalesce(b.marca_parque,'Sin identificar')=p_marca)
      and (p_tipo_maquina is null or coalesce(b.tipo_maquina,'Sin identificar')=p_tipo_maquina)
  ), filtrada as (
    select * from base b
    where (p_tipo_tiempo is null or trim(p_tipo_tiempo) = '' or upper(trim(p_tipo_tiempo)) = 'TODOS'
      or b.tipo_tiempo = public.ventas_tipo_tiempo_normalizado(p_tipo_tiempo))
      and (public.ventas_servicios_texto_normalizado(p_buscar)='' or strpos(b.texto_busqueda,public.ventas_servicios_texto_normalizado(p_buscar))>0)
  ), agrupada as (
    select f.clave as id, max(f.fecha) as fecha, max(f.os_numero) as os,
      case when max(f.os_numero) is not null then max(f.os_numero)
        when bool_and(f.es_nota_credito) then 'Nota de credito sin OS'
        else 'Historico sin OS · ' || coalesce(min(f.factura), to_char(max(f.fecha), 'DD/MM/YYYY')) end as os_etiqueta,
      string_agg(distinct coalesce(f.nro_chasis, ''), ' / ') filter (where coalesce(f.nro_chasis, '') <> '') as chasis,
      string_agg(distinct coalesce(f.propietario,'Propietario no informado'), ' / ') as cliente,
      string_agg(distinct f.propietario_os, ' / ') as propietario_os,
      string_agg(distinct f.cliente, ' / ') as cliente_facturado,
      string_agg(distinct f.vinculo_os, ' / ') as vinculo_os,
      string_agg(distinct coalesce(f.sucursal, 'Sin sucursal'), ' / ') as sucursal,
      string_agg(distinct f.tipo_tiempo, ' / ' order by f.tipo_tiempo) as tipo_tiempo,
      count(distinct jsonb_build_array(f.factura, f.fecha, f.cliente, f.sucursal, case when f.factura is null then f.linea_id end))::integer as facturas,
      coalesce(sum(f.total_venta) filter (where f.concepto = 'Servicio'), 0)::numeric as mo,
      coalesce(sum(f.total_venta) filter (where f.concepto = 'Kilometraje'), 0)::numeric as km,
      coalesce(sum(f.total_venta) filter (where f.concepto = 'Repuestos'), 0)::numeric as repuestos,
      coalesce(sum(f.total_venta) filter (where f.concepto = 'Terceros'), 0)::numeric as terceros
    from filtrada f group by f.clave
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'fecha', a.fecha, 'os', a.os_etiqueta, 'os_numero', a.os,
    'chasis', a.chasis, 'cliente', a.cliente, 'propietario', a.cliente,
    'propietario_os',a.propietario_os,'cliente_facturado',a.cliente_facturado,'vinculo_os',a.vinculo_os,'sucursal',a.sucursal,
    'tipo_tiempo', a.tipo_tiempo, 'facturas', a.facturas,
    'mo', a.mo, 'km', a.km, 'repuestos', a.repuestos, 'terceros', a.terceros,
    'total', a.mo + a.km + a.repuestos + a.terceros
  ) order by a.fecha desc, (a.mo + a.km + a.repuestos + a.terceros) desc), '[]'::jsonb)
  into v_resultado from agrupada a;
  return v_resultado;
end;
$$;

revoke all on function public.ventas_servicios_detalle_os_v2(date, date, text, text, text, text, text) from public, anon;
grant execute on function public.ventas_servicios_detalle_os_v2(date, date, text, text, text, text, text) to authenticated;

create or replace function public.ventas_servicios_lineas_v2(
  p_desde date,
  p_hasta date,
  p_sucursal text default null,
  p_tipo_tiempo text default null,
  p_marca text default null,
  p_tipo_maquina text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
set statement_timeout = '120s'
set plan_cache_mode = 'force_custom_plan'
as $$
declare v_resultado jsonb;
begin
  if auth.uid() is null or not public.has_section_access(auth.uid(), 'servicios.ventas') then
    raise exception 'No tenes acceso a Ventas de Servicios' using errcode = '42501';
  end if;

  with base as materialized (
    select b.*
    from public.ventas_servicios_movimientos_enriquecidos(p_desde,p_hasta,p_sucursal) b
    where (p_marca is null or coalesce(b.marca_parque,'Sin identificar')=p_marca)
      and (p_tipo_maquina is null or coalesce(b.tipo_maquina,'Sin identificar')=p_tipo_maquina)
  ), filtrada as (
    select * from base b
    where p_tipo_tiempo is null or trim(p_tipo_tiempo) = '' or upper(trim(p_tipo_tiempo)) = 'TODOS'
      or b.tipo_tiempo = public.ventas_tipo_tiempo_normalizado(p_tipo_tiempo)
  ), lineas as (
    select f.linea_id as id, f.fecha, coalesce(f.factura, 'Sin numero') as factura,
      f.os_numero as os, coalesce(f.cliente, 'Sin cliente') as cliente,
      coalesce(f.sucursal, 'Sin sucursal') as sucursal, f.tipo_tiempo,
      case when f.concepto = 'Servicio' then 'Mano de obra' else f.concepto end as componente,
      f.total_venta, f.cantidad, f.propietario, f.marca_parque, f.tipo_maquina,
      f.propietario_os,f.cliente_os,f.nro_chasis,f.descripcion,f.texto_busqueda,f.es_nota_credito,f.vinculo_os
    from filtrada f
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'fecha', l.fecha, 'factura', l.factura, 'os', l.os,
    'cliente', l.cliente, 'sucursal', l.sucursal, 'tipo_tiempo', l.tipo_tiempo,
    'propietario', coalesce(l.propietario,'Propietario no informado'), 'marca', coalesce(l.marca_parque,'Sin identificar'), 'tipo_maquina', coalesce(l.tipo_maquina,'Sin identificar'),
    'propietario_os',l.propietario_os,'cliente_os',l.cliente_os,'chasis',l.nro_chasis,
    'descripcion',l.descripcion,'texto_busqueda',l.texto_busqueda,'es_nota_credito',l.es_nota_credito,'vinculo_os',l.vinculo_os,
    'componente', l.componente, 'total_venta', l.total_venta, 'cantidad', l.cantidad
  ) order by l.fecha desc, l.factura, l.id), '[]'::jsonb)
  into v_resultado from lineas l;
  return v_resultado;
end;
$$;

revoke all on function public.ventas_servicios_lineas_v2(date, date, text, text, text, text) from public, anon;
grant execute on function public.ventas_servicios_lineas_v2(date, date, text, text, text, text) to authenticated;


create or replace function public.ventas_servicios_indicadores_v1(
  p_desde date,
  p_hasta date,
  p_sucursal text default null,
  p_tipo_tiempo text default null,
  p_marca text default null,
  p_tipo_maquina text default null,
  p_buscar text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
set statement_timeout = '120s'
set plan_cache_mode = 'force_custom_plan'
as $$
declare v_resultado jsonb;
begin
  if auth.uid() is null or not public.has_section_access(auth.uid(), 'servicios.ventas') then
    raise exception 'No tenes acceso a Ventas de Servicios' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'Rango de fechas invalido' using errcode = '22023';
  end if;

  with base as materialized (
    select b.*
    from public.ventas_servicios_movimientos_enriquecidos(p_desde,p_hasta,p_sucursal) b
    where (p_marca is null or coalesce(b.marca_parque,'Sin identificar')=p_marca)
      and (p_tipo_maquina is null or coalesce(b.tipo_maquina,'Sin identificar')=p_tipo_maquina)
  ), filtrada as materialized (
    select * from base b
    where (p_tipo_tiempo is null or trim(p_tipo_tiempo) = '' or upper(trim(p_tipo_tiempo)) = 'TODOS'
      or b.tipo_tiempo = public.ventas_tipo_tiempo_normalizado(p_tipo_tiempo))
      and (public.ventas_servicios_texto_normalizado(p_buscar)='' or strpos(b.texto_busqueda,public.ventas_servicios_texto_normalizado(p_buscar))>0)
  ), horas_todas as (
    select upper(trim(os.os_numero)) as os_clave,
      public.ventas_tipo_tiempo_normalizado(t.key) as tipo_tiempo,
      coalesce((t.value->>'horas')::numeric, 0) as horas
    from public.ordenes_servicio_importadas os
    cross join lateral jsonb_each(os.raw_data->'totales_por_tipo') t
    where os.raw_data ? 'totales_por_tipo'
    union all
    select upper(trim(os.os_numero)),
      public.ventas_tipo_tiempo_normalizado(os.tipo_tiempo),
      coalesce(os.servicios_cantidad, 0)
    from public.ordenes_servicio_importadas os
    where not (coalesce(os.raw_data, '{}'::jsonb) ? 'totales_por_tipo')
  ), os_filtradas as (
    select distinct upper(trim(f.os_numero)) as os_clave, f.tipo_tiempo,
      coalesce(f.marca_parque,'Sin identificar') as marca,
      coalesce(f.tipo_maquina,'Sin identificar') as tipo_maquina,
      nullif(f.nro_chasis,'') as chasis
    from filtrada f where f.os_numero is not null
  ), horas_filtradas as (
    select o.os_clave, o.tipo_tiempo, o.marca, o.tipo_maquina,
      coalesce(sum(h.horas), 0) as horas
    from os_filtradas o
    left join horas_todas h on h.os_clave = o.os_clave and h.tipo_tiempo = o.tipo_tiempo
    group by 1,2,3,4
  ), totales as (
    select coalesce(sum(total_venta),0)::numeric as neto,
      coalesce(sum(total_venta) filter (where concepto = 'Servicio'),0)::numeric as mo,
      coalesce(sum(total_venta) filter (where concepto = 'Kilometraje'),0)::numeric as km,
      coalesce(sum(total_venta) filter (where concepto = 'Repuestos'),0)::numeric as repuestos,
      coalesce(sum(total_venta) filter (where concepto = 'Terceros'),0)::numeric as terceros,
      count(distinct upper(trim(os_numero)))::integer as ordenes,
      count(distinct jsonb_build_array(factura, fecha, cliente, sucursal, case when factura is null then linea_id end))::integer as documentos
    from filtrada
  ), por_tipo as (
    select f.tipo_tiempo,
      coalesce(sum(f.total_venta),0)::numeric as neto,
      coalesce(sum(f.total_venta) filter (where f.concepto = 'Servicio'),0)::numeric as mo,
      coalesce(sum(f.total_venta) filter (where f.concepto = 'Kilometraje'),0)::numeric as km,
      coalesce(sum(f.total_venta) filter (where f.concepto = 'Repuestos'),0)::numeric as repuestos,
      coalesce(sum(f.total_venta) filter (where f.concepto = 'Terceros'),0)::numeric as terceros,
      count(distinct upper(trim(f.os_numero)))::integer as ordenes,
      count(distinct nullif(trim(f.cliente),''))::integer as clientes,
      count(distinct jsonb_build_array(f.factura, f.fecha, f.cliente, f.sucursal, case when f.factura is null then f.linea_id end))::integer as facturas
    from filtrada f group by 1
  ), por_maquina as (
    select coalesce(f.marca_parque,'Sin identificar') as marca,
      coalesce(f.tipo_maquina,'Sin identificar') as tipo_maquina,
      coalesce(sum(f.total_venta),0)::numeric as neto,
      coalesce(sum(f.total_venta) filter (where f.concepto = 'Servicio'),0)::numeric as mo,
      coalesce(sum(f.total_venta) filter (where f.concepto = 'Kilometraje'),0)::numeric as km,
      coalesce(sum(f.total_venta) filter (where f.concepto = 'Repuestos'),0)::numeric as repuestos,
      coalesce(sum(f.total_venta) filter (where f.concepto = 'Terceros'),0)::numeric as terceros,
      count(distinct upper(trim(f.os_numero)))::integer as ordenes,
      count(distinct nullif(f.nro_chasis,''))::integer as maquinas
    from filtrada f group by 1,2
  )
  select jsonb_build_object(
    'totales', jsonb_build_object(
      'neto', t.neto, 'mo', t.mo, 'km', t.km, 'repuestos', t.repuestos, 'terceros', t.terceros,
      'ordenes', t.ordenes, 'documentos', t.documentos,
      'horas', (select coalesce(sum(horas),0) from horas_filtradas)
    ),
    'por_tipo', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'tipo_tiempo', p.tipo_tiempo, 'mo', p.mo, 'km', p.km, 'repuestos', p.repuestos,
        'terceros', p.terceros, 'neto', p.neto, 'ordenes', p.ordenes,
        'clientes', p.clientes, 'facturas', p.facturas,
        'horas', (select coalesce(sum(h.horas),0) from horas_filtradas h where h.tipo_tiempo = p.tipo_tiempo)
      ) order by p.neto desc), '[]'::jsonb) from por_tipo p
    ),
    'por_maquina', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'marca', m.marca, 'tipo_maquina', m.tipo_maquina, 'maquinas', m.maquinas,
        'ordenes', m.ordenes, 'mo', m.mo, 'km', m.km, 'repuestos', m.repuestos,
        'terceros', m.terceros, 'neto', m.neto,
        'horas', (select coalesce(sum(h.horas),0) from horas_filtradas h where h.marca = m.marca and h.tipo_maquina = m.tipo_maquina)
      ) order by m.neto desc), '[]'::jsonb) from por_maquina m
    )
  ) into v_resultado from totales t;

  return v_resultado;
end;
$$;

revoke all on function public.ventas_servicios_indicadores_v1(date, date, text, text, text, text, text) from public, anon;
grant execute on function public.ventas_servicios_indicadores_v1(date, date, text, text, text, text, text) to authenticated;

create or replace function public.ventas_servicios_tecnicos_v1(
  p_desde date,
  p_hasta date,
  p_sucursal text default null,
  p_tipo_tiempo text default null,
  p_marca text default null,
  p_tipo_maquina text default null,
  p_buscar text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
set statement_timeout = '120s'
set plan_cache_mode = 'force_custom_plan'
as $$
declare v_resultado jsonb;
begin
  if auth.uid() is null or not public.has_section_access(auth.uid(), 'servicios.ventas') then
    raise exception 'No tenes acceso a Ventas de Servicios' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'Rango de fechas invalido' using errcode = '22023';
  end if;

  with base as materialized (
    select b.*
    from public.ventas_servicios_movimientos_enriquecidos(p_desde,p_hasta,p_sucursal) b
    where (p_marca is null or coalesce(b.marca_parque,'Sin identificar')=p_marca)
      and (p_tipo_maquina is null or coalesce(b.tipo_maquina,'Sin identificar')=p_tipo_maquina)
  ), filtrada as materialized (
    select * from base b
    where (p_tipo_tiempo is null or trim(p_tipo_tiempo) = '' or upper(trim(p_tipo_tiempo)) = 'TODOS'
      or b.tipo_tiempo = public.ventas_tipo_tiempo_normalizado(p_tipo_tiempo))
      and (public.ventas_servicios_texto_normalizado(p_buscar)='' or strpos(b.texto_busqueda,public.ventas_servicios_texto_normalizado(p_buscar))>0)
  ), os_facturadas as (
    select distinct upper(trim(f.os_numero)) as os_clave
    from filtrada f
    where nullif(trim(f.os_numero),'') is not null
  ), mo_os_tipo as (
    select coalesce(nullif(upper(trim(f.os_numero)),''), 'SIN_OS') as os_clave,
      f.tipo_tiempo,
      coalesce(sum(f.total_venta) filter (where f.concepto = 'Servicio'),0)::numeric as mo
    from filtrada f
    group by 1,2
    having coalesce(sum(f.total_venta) filter (where f.concepto = 'Servicio'),0) <> 0
  ), jornadas as materialized (
    select upper(trim(j.os_numero)) as os_clave,
      coalesce(j.tecnico_profile_id::text, upper(trim(j.tecnico_nombre))) as tecnico_clave,
      max(coalesce(nullif(trim(j.tecnico_nombre),''), 'Sin nombre')) as tecnico_nombre,
      public.ventas_tipo_tiempo_normalizado(coalesce(nullif(trim(j.tipo_tiempo),''), nullif(trim(j.tipo_tiempo_importado),''))) as tipo_tiempo,
      coalesce(sum(greatest(coalesce(j.horas_validas, j.horas_calculadas, j.horas_reportadas, 0), 0)),0)::numeric as horas
    from public.comisiones_jornadas j
    where j.vigente
      and j.estado_validacion is distinct from 'INVALIDA'
      and nullif(trim(j.tecnico_nombre),'') is not null
      and upper(trim(j.os_numero)) in (select os_clave from os_facturadas)
      and (p_tipo_tiempo is null or trim(p_tipo_tiempo) = '' or upper(trim(p_tipo_tiempo)) = 'TODOS'
        or public.ventas_tipo_tiempo_normalizado(coalesce(nullif(trim(j.tipo_tiempo),''), nullif(trim(j.tipo_tiempo_importado),''))) = public.ventas_tipo_tiempo_normalizado(p_tipo_tiempo))
    group by 1,2,4
  ), participacion as (
    select j.*,
      sum(j.horas) over (partition by j.os_clave, j.tipo_tiempo) as horas_tipo
    from jornadas j
    where j.horas > 0
  ), reparto as (
    select p.tecnico_clave, p.tecnico_nombre, p.tipo_tiempo,
      (m.mo * p.horas / nullif(p.horas_tipo, 0))::numeric as mo
    from participacion p
    join mo_os_tipo m on m.os_clave = p.os_clave and m.tipo_tiempo = p.tipo_tiempo
  ), sin_asignar as (
    select 'SIN_TECNICO_ATRIBUIDO'::text as tecnico_clave,
      'Sin técnico atribuido'::text as tecnico_nombre,
      m.tipo_tiempo,
      m.mo
    from mo_os_tipo m
    where not exists (
      select 1 from participacion p
      where p.os_clave = m.os_clave and p.tipo_tiempo = m.tipo_tiempo
    )
  ), horas_resumen as (
    select j.tecnico_clave, max(j.tecnico_nombre) as tecnico,
      coalesce(sum(j.horas) filter (where j.tipo_tiempo = 'Cliente'),0)::numeric as horas_cliente,
      coalesce(sum(j.horas) filter (where j.tipo_tiempo = 'Garantia'),0)::numeric as horas_garantia,
      coalesce(sum(j.horas) filter (where j.tipo_tiempo = 'Interno'),0)::numeric as horas_interno,
      coalesce(sum(j.horas) filter (where j.tipo_tiempo not in ('Cliente','Garantia','Interno')),0)::numeric as horas_otros,
      coalesce(sum(j.horas),0)::numeric as total_horas
    from jornadas j
    group by j.tecnico_clave
  ), mo_resumen as (
    select r.tecnico_clave, max(r.tecnico_nombre) as tecnico,
      coalesce(sum(r.mo) filter (where r.tipo_tiempo = 'Cliente'),0)::numeric as mo_cliente,
      coalesce(sum(r.mo) filter (where r.tipo_tiempo = 'Garantia'),0)::numeric as mo_garantia,
      coalesce(sum(r.mo) filter (where r.tipo_tiempo = 'Interno'),0)::numeric as mo_interno,
      coalesce(sum(r.mo) filter (where r.tipo_tiempo not in ('Cliente','Garantia','Interno')),0)::numeric as mo_otros,
      coalesce(sum(r.mo),0)::numeric as mo_total
    from (
      select * from reparto
      union all
      select * from sin_asignar
    ) r
    group by r.tecnico_clave
  ), combinado as (
    select coalesce(h.tecnico_clave, m.tecnico_clave) as tecnico_clave,
      coalesce(h.tecnico, m.tecnico) as tecnico,
      coalesce(h.horas_cliente,0)::numeric as horas_cliente,
      coalesce(h.horas_garantia,0)::numeric as horas_garantia,
      coalesce(h.horas_interno,0)::numeric as horas_interno,
      coalesce(h.horas_otros,0)::numeric as horas_otros,
      coalesce(h.total_horas,0)::numeric as total_horas,
      coalesce(m.mo_cliente,0)::numeric as mo_cliente,
      coalesce(m.mo_garantia,0)::numeric as mo_garantia,
      coalesce(m.mo_interno,0)::numeric as mo_interno,
      coalesce(m.mo_otros,0)::numeric as mo_otros,
      coalesce(m.mo_total,0)::numeric as mo_total
    from horas_resumen h
    full join mo_resumen m using (tecnico_clave)
  )
  select coalesce(jsonb_agg(c order by c.mo_total desc, c.total_horas desc, c.tecnico), '[]'::jsonb)
  into v_resultado
  from combinado c;

  return v_resultado;
end;
$$;

comment on function public.ventas_servicios_tecnicos_v1(date, date, text, text, text, text, text) is
  'Atribuye la MO facturada por OS y tipo de tiempo segun horas computables (validadas o calculadas; excluye jornadas invalidas). Respeta tipo_tiempo corregido manualmente en Comisiones; importado es solo respaldo.';

revoke all on function public.ventas_servicios_tecnicos_v1(date, date, text, text, text, text, text) from public, anon;
grant execute on function public.ventas_servicios_tecnicos_v1(date, date, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';

COMMIT;
