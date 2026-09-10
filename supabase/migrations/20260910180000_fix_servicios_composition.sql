-- Corrige la composición comercial de Servicios.
-- Servicios = Mano de obra + Kilometraje + Repuestos de OS + Terceros de OS.
-- La categoría contable genérica "Otros" no forma parte de esta vista.

create or replace function public.ventas_servicios_panorama(
  p_desde date,
  p_hasta date,
  p_sucursal text default null,
  p_tipo_tiempo text default null,
  p_agrupacion text default 'mes',
  p_buscar text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
set statement_timeout = '30s'
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
    select b.*,
      public.ventas_tipo_tiempo_normalizado(os.tipo_tiempo) as tipo_tiempo,
      coalesce(os.servicios_cantidad, 0)::numeric as horas_os,
      coalesce(os.km_cantidad, 0)::numeric as km_os,
      coalesce(os.terceros_valor, 0)::numeric as terceros_os
    from public.ventas_area_movimientos_base(p_desde, p_hasta, p_sucursal, p_buscar) b
    left join public.ordenes_servicio_importadas os
      on upper(trim(os.os_numero)) = upper(trim(b.os_numero))
    where b.area_calculada = 'servicios'
      and b.concepto in ('Servicio', 'Kilometraje', 'Repuestos')
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
      coalesce(sum(f.total_venta) filter (where f.concepto = 'Repuestos'), 0)::numeric as repuestos_os,
      count(distinct jsonb_build_array(f.factura, f.fecha, f.cliente, f.sucursal, case when f.factura is null then f.linea_id end))::integer as facturas,
      count(distinct nullif(f.cliente, ''))::integer as clientes,
      case when min(f.metodologia) = max(f.metodologia) then min(f.metodologia) else 'mixto' end as metodologia
    from filtrada f group by 1
  ), os_unicas as (
    select f.os_numero,
      date_trunc(v_date_part, min(f.fecha)::timestamp)::date as periodo,
      max(f.horas_os)::numeric as horas,
      max(f.km_os)::numeric as km_cantidad,
      max(f.terceros_os)::numeric as terceros_os
    from filtrada f
    where f.os_numero is not null
    group by f.os_numero
  ), operacion as (
    select periodo, sum(horas)::numeric as horas, sum(km_cantidad)::numeric as km_cantidad,
      sum(terceros_os)::numeric as terceros_os
    from os_unicas group by periodo
  ), resumen_facturado as (
    select coalesce(sum(total_venta), 0)::numeric as subtotal,
      count(distinct jsonb_build_array(factura, fecha, cliente, sucursal, case when factura is null then linea_id end))::integer as facturas,
      count(distinct nullif(cliente, ''))::integer as clientes,
      count(distinct os_numero)::integer as ordenes
    from filtrada
  ), resumen_terceros as (
    select coalesce(sum(terceros_os), 0)::numeric as terceros from os_unicas
  )
  select jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta, 'agrupacion', v_agrupacion,
    'resumen', jsonb_build_object(
      'total', rf.subtotal + rt.terceros,
      'facturas', rf.facturas, 'clientes', rf.clientes, 'ordenes', rf.ordenes,
      'promedio', case when rf.ordenes > 0 then (rf.subtotal + rt.terceros) / rf.ordenes else 0 end
    ),
    'periodos', coalesce(jsonb_agg(jsonb_build_object(
      'periodo', p.periodo,
      'total', coalesce(f.subtotal, 0) + coalesce(o.terceros_os, 0),
      'mo', coalesce(f.mo, 0), 'km', coalesce(f.km, 0),
      'repuestos_os', coalesce(f.repuestos_os, 0),
      'terceros_os', coalesce(o.terceros_os, 0),
      'horas', coalesce(o.horas, 0), 'km_cantidad', coalesce(o.km_cantidad, 0),
      'facturas', coalesce(f.facturas, 0), 'clientes', coalesce(f.clientes, 0),
      'metodologia', coalesce(f.metodologia, case when p.periodo < date '2026-07-01' then 'historico' else 'actual' end)
    ) order by p.periodo), '[]'::jsonb)
  ) into v_resultado
  from periodos p
  left join facturado f using (periodo)
  left join operacion o using (periodo)
  cross join resumen_facturado rf
  cross join resumen_terceros rt
  group by rf.subtotal, rf.facturas, rf.clientes, rf.ordenes, rt.terceros;

  return v_resultado;
end;
$$;

revoke all on function public.ventas_servicios_panorama(date, date, text, text, text, text) from public, anon;
grant execute on function public.ventas_servicios_panorama(date, date, text, text, text, text) to authenticated;

create or replace function public.ventas_servicios_detalle_os(
  p_desde date,
  p_hasta date,
  p_sucursal text default null,
  p_buscar text default null,
  p_tipo_tiempo text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
set statement_timeout = '30s'
as $$
declare v_resultado jsonb;
begin
  if auth.uid() is null or not public.has_section_access(auth.uid(), 'servicios.ventas') then
    raise exception 'No tenes acceso a Ventas de Servicios' using errcode = '42501';
  end if;

  with base as materialized (
    select b.*, os.nro_chasis,
      public.ventas_tipo_tiempo_normalizado(os.tipo_tiempo) as tipo_tiempo,
      coalesce(os.servicios_cantidad, 0)::numeric as horas_os,
      coalesce(os.km_cantidad, 0)::numeric as km_os,
      coalesce(os.terceros_valor, 0)::numeric as terceros_os,
      case when b.os_numero is not null then 'OS:' || upper(trim(b.os_numero))
        else jsonb_build_array(b.metodologia, b.factura, b.cliente, b.sucursal, b.fecha, case when b.factura is null then b.linea_id end)::text end as clave
    from public.ventas_area_movimientos_base(p_desde, p_hasta, p_sucursal, null) b
    left join public.ordenes_servicio_importadas os
      on upper(trim(os.os_numero)) = upper(trim(b.os_numero))
    where b.area_calculada = 'servicios'
      and b.concepto in ('Servicio', 'Kilometraje', 'Repuestos')
  ), filtrada as (
    select * from base b
    where (p_tipo_tiempo is null or trim(p_tipo_tiempo) = '' or upper(trim(p_tipo_tiempo)) = 'TODOS'
      or b.tipo_tiempo = public.ventas_tipo_tiempo_normalizado(p_tipo_tiempo))
      and (p_buscar is null or trim(p_buscar) = '' or concat_ws(' ', b.os_numero, b.factura, b.cliente, b.nro_chasis, b.tipo_tiempo, b.descripcion) ilike '%' || trim(p_buscar) || '%')
  ), agrupada as (
    select f.clave as id, max(f.fecha) as fecha, max(f.os_numero) as os,
      case when max(f.os_numero) is not null then max(f.os_numero)
        when bool_and(f.es_nota_credito) then 'Nota de credito sin OS'
        else 'Historico sin OS · ' || coalesce(min(f.factura), to_char(max(f.fecha), 'DD/MM/YYYY')) end as os_etiqueta,
      string_agg(distinct coalesce(f.nro_chasis, ''), ' / ') filter (where coalesce(f.nro_chasis, '') <> '') as chasis,
      string_agg(distinct coalesce(f.cliente, 'Sin cliente'), ' / ') as cliente,
      string_agg(distinct coalesce(f.sucursal, 'Sin sucursal'), ' / ') as sucursal,
      max(f.tipo_tiempo) as tipo_tiempo,
      count(distinct jsonb_build_array(f.factura, f.fecha, f.cliente, f.sucursal, case when f.factura is null then f.linea_id end))::integer as facturas,
      max(f.horas_os)::numeric as horas, max(f.km_os)::numeric as km_cantidad,
      coalesce(sum(f.total_venta) filter (where f.concepto = 'Servicio'), 0)::numeric as mo,
      coalesce(sum(f.total_venta) filter (where f.concepto = 'Kilometraje'), 0)::numeric as km,
      coalesce(sum(f.total_venta) filter (where f.concepto = 'Repuestos'), 0)::numeric as repuestos,
      max(f.terceros_os)::numeric as terceros_os
    from filtrada f group by f.clave
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'fecha', a.fecha, 'os', a.os_etiqueta, 'os_numero', a.os,
    'chasis', a.chasis, 'cliente', a.cliente, 'sucursal', a.sucursal,
    'tipo_tiempo', a.tipo_tiempo, 'facturas', a.facturas,
    'horas', coalesce(a.horas, 0), 'km_cantidad', coalesce(a.km_cantidad, 0),
    'mo', a.mo, 'km', a.km, 'repuestos', a.repuestos,
    'terceros_os', coalesce(a.terceros_os, 0),
    'total', a.mo + a.km + a.repuestos + coalesce(a.terceros_os, 0)
  ) order by a.fecha desc, (a.mo + a.km + a.repuestos + coalesce(a.terceros_os, 0)) desc), '[]'::jsonb)
  into v_resultado from agrupada a;
  return v_resultado;
end;
$$;

revoke all on function public.ventas_servicios_detalle_os(date, date, text, text, text) from public, anon;
grant execute on function public.ventas_servicios_detalle_os(date, date, text, text, text) to authenticated;

create or replace function public.ventas_servicios_lineas(
  p_desde date,
  p_hasta date,
  p_sucursal text default null,
  p_tipo_tiempo text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
set statement_timeout = '30s'
as $$
declare v_resultado jsonb;
begin
  if auth.uid() is null or not public.has_section_access(auth.uid(), 'servicios.ventas') then
    raise exception 'No tenes acceso a Ventas de Servicios' using errcode = '42501';
  end if;

  with base as materialized (
    select b.*, public.ventas_tipo_tiempo_normalizado(os.tipo_tiempo) as tipo_tiempo,
      coalesce(os.servicios_cantidad, 0)::numeric as horas_os,
      coalesce(os.km_cantidad, 0)::numeric as km_os,
      coalesce(os.terceros_valor, 0)::numeric as terceros_os,
      row_number() over (partition by b.os_numero, b.concepto order by b.fecha, b.linea_id) as numero_componente_os,
      row_number() over (partition by b.os_numero order by b.fecha, b.linea_id) as numero_os
    from public.ventas_area_movimientos_base(p_desde, p_hasta, p_sucursal, null) b
    left join public.ordenes_servicio_importadas os
      on upper(trim(os.os_numero)) = upper(trim(b.os_numero))
    where b.area_calculada = 'servicios'
      and b.concepto in ('Servicio', 'Kilometraje', 'Repuestos')
  ), filtrada as (
    select * from base b
    where p_tipo_tiempo is null or trim(p_tipo_tiempo) = '' or upper(trim(p_tipo_tiempo)) = 'TODOS'
      or b.tipo_tiempo = public.ventas_tipo_tiempo_normalizado(p_tipo_tiempo)
  ), lineas as (
    select f.linea_id as id, f.fecha, coalesce(f.factura, 'Sin numero') as factura,
      f.os_numero as os, coalesce(f.cliente, 'Sin cliente') as cliente,
      coalesce(f.sucursal, 'Sin sucursal') as sucursal, f.tipo_tiempo,
      case when f.concepto = 'Servicio' then 'Mano de obra' else f.concepto end as componente,
      f.total_venta,
      case
        when f.os_numero is not null and f.concepto = 'Servicio' then case when f.numero_componente_os = 1 then f.horas_os else 0 end
        when f.os_numero is not null and f.concepto = 'Kilometraje' then case when f.numero_componente_os = 1 then f.km_os else 0 end
        else f.cantidad end as cantidad
    from filtrada f
    union all
    select f.linea_id || ':terceros', f.fecha, coalesce(f.factura, 'Sin numero'),
      f.os_numero, coalesce(f.cliente, 'Sin cliente'), coalesce(f.sucursal, 'Sin sucursal'),
      f.tipo_tiempo, 'Terceros', f.terceros_os, 1::numeric
    from filtrada f
    where f.numero_os = 1 and f.os_numero is not null and f.terceros_os <> 0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'fecha', l.fecha, 'factura', l.factura, 'os', l.os,
    'cliente', l.cliente, 'sucursal', l.sucursal, 'tipo_tiempo', l.tipo_tiempo,
    'componente', l.componente, 'total_venta', l.total_venta, 'cantidad', l.cantidad
  ) order by l.fecha desc, l.factura, l.id), '[]'::jsonb)
  into v_resultado from lineas l;
  return v_resultado;
end;
$$;

revoke all on function public.ventas_servicios_lineas(date, date, text, text) from public, anon;
grant execute on function public.ventas_servicios_lineas(date, date, text, text) to authenticated;
