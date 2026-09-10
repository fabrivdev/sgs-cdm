-- Reconcilia Ventas de Servicios con la misma fuente de verdad de Facturacion.
-- Los importes siempre salen de ventas_area_movimientos_base; los datos operativos
-- (horas, km, tipo de tiempo, chasis y terceros) enriquecen la venta desde la OS.

create or replace function public.ventas_tipo_tiempo_normalizado(p_valor text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when upper(trim(coalesce(p_valor, ''))) like '%GARANT%' then 'Garantia'
    when upper(trim(coalesce(p_valor, ''))) like '%INTERN%'
      or upper(trim(coalesce(p_valor, ''))) like '%CDM%'
      or upper(trim(coalesce(p_valor, ''))) like '%ABSOR%' then 'Interno'
    when upper(trim(coalesce(p_valor, ''))) like '%CLIENT%'
      or upper(trim(coalesce(p_valor, ''))) like '%FACTUR%' then 'Cliente'
    else 'No informado'
  end
$$;

revoke all on function public.ventas_tipo_tiempo_normalizado(text) from public, anon;
grant execute on function public.ventas_tipo_tiempo_normalizado(text) to authenticated;

drop function if exists public.ventas_servicios_panorama(date, date, text);
drop function if exists public.ventas_servicios_panorama(date, date, text, text, text, text);

create function public.ventas_servicios_panorama(
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
  v_intervalo := case v_agrupacion when 'dia' then interval '1 day' when 'semana' then interval '1 week' when 'anio' then interval '1 year' else interval '1 month' end;

  with base as materialized (
    select
      b.*,
      public.ventas_tipo_tiempo_normalizado(os.tipo_tiempo) as tipo_tiempo,
      coalesce(os.servicios_cantidad, 0)::numeric as horas_os,
      coalesce(os.km_cantidad, 0)::numeric as km_os,
      coalesce(os.terceros_valor, 0)::numeric as terceros_os
    from public.ventas_area_movimientos_base(p_desde, p_hasta, p_sucursal, p_buscar) b
    left join public.ordenes_servicio_importadas os
      on upper(trim(os.os_numero)) = upper(trim(b.os_numero))
    where b.area_calculada = 'servicios'
  ), filtrada as materialized (
    select * from base b
    where p_tipo_tiempo is null or trim(p_tipo_tiempo) = '' or upper(trim(p_tipo_tiempo)) = 'TODOS'
      or b.tipo_tiempo = public.ventas_tipo_tiempo_normalizado(p_tipo_tiempo)
  ), periodos as (
    select generate_series(
      date_trunc(v_agrupacion, p_desde::timestamp),
      date_trunc(v_agrupacion, p_hasta::timestamp),
      v_intervalo
    )::date as periodo
  ), facturado as (
    select
      date_trunc(v_agrupacion, f.fecha::timestamp)::date as periodo,
      sum(f.total_venta)::numeric as total,
      sum(f.total_venta) filter (where f.concepto = 'Servicio')::numeric as mo,
      sum(f.total_venta) filter (where f.concepto = 'Kilometraje')::numeric as km,
      sum(f.total_venta) filter (where f.concepto = 'Repuestos')::numeric as repuestos_os,
      sum(f.total_venta) filter (where f.concepto not in ('Servicio', 'Kilometraje', 'Repuestos'))::numeric as otros_facturados,
      count(distinct jsonb_build_array(f.factura, f.fecha, f.cliente, f.sucursal, case when f.factura is null then f.linea_id end))::integer as facturas,
      count(distinct nullif(f.cliente, ''))::integer as clientes,
      case when min(f.metodologia) = max(f.metodologia) then min(f.metodologia) else 'mixto' end as metodologia
    from filtrada f
    group by 1
  ), os_unicas as (
    select
      f.os_numero,
      date_trunc(v_agrupacion, min(f.fecha)::timestamp)::date as periodo,
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
  ), resumen as (
    select
      coalesce(sum(total_venta), 0)::numeric as total,
      count(distinct jsonb_build_array(factura, fecha, cliente, sucursal, case when factura is null then linea_id end))::integer as facturas,
      count(distinct nullif(cliente, ''))::integer as clientes,
      count(distinct os_numero)::integer as ordenes
    from filtrada
  )
  select jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,
    'agrupacion', v_agrupacion,
    'resumen', jsonb_build_object(
      'total', r.total,
      'facturas', r.facturas,
      'clientes', r.clientes,
      'ordenes', r.ordenes,
      'promedio', case when r.ordenes > 0 then r.total / r.ordenes else 0 end
    ),
    'periodos', coalesce(jsonb_agg(jsonb_build_object(
      'periodo', p.periodo,
      'total', coalesce(f.total, 0),
      'mo', coalesce(f.mo, 0),
      'km', coalesce(f.km, 0),
      'repuestos_os', coalesce(f.repuestos_os, 0),
      'otros_facturados', coalesce(f.otros_facturados, 0),
      'horas', coalesce(o.horas, 0),
      'km_cantidad', coalesce(o.km_cantidad, 0),
      'terceros_os', coalesce(o.terceros_os, 0),
      'facturas', coalesce(f.facturas, 0),
      'clientes', coalesce(f.clientes, 0),
      'metodologia', coalesce(f.metodologia, case when p.periodo < date '2026-07-01' then 'historico' else 'actual' end)
    ) order by p.periodo), '[]'::jsonb)
  ) into v_resultado
  from periodos p
  left join facturado f using (periodo)
  left join operacion o using (periodo)
  cross join resumen r
  group by r.total, r.facturas, r.clientes, r.ordenes;

  return v_resultado;
end;
$$;

revoke all on function public.ventas_servicios_panorama(date, date, text, text, text, text) from public, anon;
grant execute on function public.ventas_servicios_panorama(date, date, text, text, text, text) to authenticated;

drop function if exists public.ventas_servicios_detalle_os(date, date, text, text);
drop function if exists public.ventas_servicios_detalle_os(date, date, text, text, text);

create function public.ventas_servicios_detalle_os(
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
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'Rango de fechas invalido' using errcode = '22023';
  end if;

  with base as materialized (
    select
      b.*,
      os.nro_chasis,
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
  ), filtrada as (
    select * from base b
    where (p_tipo_tiempo is null or trim(p_tipo_tiempo) = '' or upper(trim(p_tipo_tiempo)) = 'TODOS'
      or b.tipo_tiempo = public.ventas_tipo_tiempo_normalizado(p_tipo_tiempo))
      and (p_buscar is null or trim(p_buscar) = '' or concat_ws(' ', b.os_numero, b.factura, b.cliente, b.nro_chasis, b.tipo_tiempo, b.descripcion) ilike '%' || trim(p_buscar) || '%')
  ), agrupada as (
    select
      f.clave as id,
      max(f.fecha) as fecha,
      max(f.os_numero) as os,
      case when max(f.os_numero) is not null then max(f.os_numero)
        when bool_and(f.es_nota_credito) then 'Nota de credito sin OS'
        else 'Historico sin OS · ' || coalesce(min(f.factura), to_char(max(f.fecha), 'DD/MM/YYYY')) end as os_etiqueta,
      string_agg(distinct coalesce(f.nro_chasis, ''), ' / ') filter (where coalesce(f.nro_chasis, '') <> '') as chasis,
      string_agg(distinct coalesce(f.cliente, 'Sin cliente'), ' / ') as cliente,
      string_agg(distinct coalesce(f.sucursal, 'Sin sucursal'), ' / ') as sucursal,
      max(f.tipo_tiempo) as tipo_tiempo,
      count(distinct jsonb_build_array(f.factura, f.fecha, f.cliente, f.sucursal, case when f.factura is null then f.linea_id end))::integer as facturas,
      max(f.horas_os)::numeric as horas,
      max(f.km_os)::numeric as km_cantidad,
      sum(f.total_venta) filter (where f.concepto = 'Servicio')::numeric as mo,
      sum(f.total_venta) filter (where f.concepto = 'Kilometraje')::numeric as km,
      sum(f.total_venta) filter (where f.concepto = 'Repuestos')::numeric as repuestos,
      sum(f.total_venta) filter (where f.concepto not in ('Servicio', 'Kilometraje', 'Repuestos'))::numeric as otros_facturados,
      max(f.terceros_os)::numeric as terceros_os,
      sum(f.total_venta)::numeric as total
    from filtrada f
    group by f.clave
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'fecha', a.fecha, 'os', a.os_etiqueta, 'os_numero', a.os,
    'chasis', a.chasis, 'cliente', a.cliente, 'sucursal', a.sucursal,
    'tipo_tiempo', a.tipo_tiempo, 'facturas', a.facturas,
    'horas', coalesce(a.horas, 0), 'km_cantidad', coalesce(a.km_cantidad, 0),
    'mo', coalesce(a.mo, 0), 'km', coalesce(a.km, 0), 'repuestos', coalesce(a.repuestos, 0),
    'otros_facturados', coalesce(a.otros_facturados, 0), 'terceros_os', coalesce(a.terceros_os, 0),
    'total', coalesce(a.total, 0)
  ) order by a.fecha desc, a.total desc), '[]'::jsonb) into v_resultado
  from agrupada a;
  return v_resultado;
end;
$$;

revoke all on function public.ventas_servicios_detalle_os(date, date, text, text, text) from public, anon;
grant execute on function public.ventas_servicios_detalle_os(date, date, text, text, text) to authenticated;

drop function if exists public.ventas_servicios_lineas(date, date, text);
drop function if exists public.ventas_servicios_lineas(date, date, text, text);

create function public.ventas_servicios_lineas(
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
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'Rango de fechas invalido' using errcode = '22023';
  end if;

  with base as materialized (
    select
      b.*,
      public.ventas_tipo_tiempo_normalizado(os.tipo_tiempo) as tipo_tiempo,
      coalesce(os.servicios_cantidad, 0)::numeric as horas_os,
      coalesce(os.km_cantidad, 0)::numeric as km_os,
      row_number() over (partition by b.os_numero, b.concepto order by b.fecha, b.linea_id) as numero_componente_os
    from public.ventas_area_movimientos_base(p_desde, p_hasta, p_sucursal, null) b
    left join public.ordenes_servicio_importadas os
      on upper(trim(os.os_numero)) = upper(trim(b.os_numero))
    where b.area_calculada = 'servicios'
  ), filtrada as (
    select * from base b
    where p_tipo_tiempo is null or trim(p_tipo_tiempo) = '' or upper(trim(p_tipo_tiempo)) = 'TODOS'
      or b.tipo_tiempo = public.ventas_tipo_tiempo_normalizado(p_tipo_tiempo)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', f.linea_id, 'fecha', f.fecha, 'factura', coalesce(f.factura, 'Sin numero'),
    'os', f.os_numero, 'cliente', coalesce(f.cliente, 'Sin cliente'),
    'sucursal', coalesce(f.sucursal, 'Sin sucursal'), 'tipo_tiempo', f.tipo_tiempo,
    'componente', f.concepto, 'total_venta', f.total_venta,
    'cantidad', case
      when f.os_numero is not null and f.concepto = 'Servicio' then case when f.numero_componente_os = 1 then f.horas_os else 0 end
      when f.os_numero is not null and f.concepto = 'Kilometraje' then case when f.numero_componente_os = 1 then f.km_os else 0 end
      else f.cantidad end
  ) order by f.fecha desc, f.factura, f.linea_id), '[]'::jsonb) into v_resultado
  from filtrada f;
  return v_resultado;
end;
$$;

revoke all on function public.ventas_servicios_lineas(date, date, text, text) from public, anon;
grant execute on function public.ventas_servicios_lineas(date, date, text, text) to authenticated;

-- Auditoria: permite comprobar si "terceros" tiene una linea contable propia o
-- si solo esta informado en la OS (y, por tanto, no debe sumarse otra vez al facturado).
create or replace function public.ventas_servicios_terceros_auditoria(
  p_desde date,
  p_hasta date,
  p_sucursal text default null
)
returns table (
  os_numero text,
  cliente text,
  sucursal text,
  terceros_registrados_os numeric,
  otros_facturados numeric,
  total_facturado_os numeric,
  diagnostico text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with b as (
    select m.* from public.ventas_area_movimientos_base(p_desde, p_hasta, p_sucursal, null) m
    where auth.uid() is not null
      and public.has_section_access(auth.uid(), 'servicios.ventas')
      and m.area_calculada = 'servicios' and m.os_numero is not null
  )
  select os.os_numero, max(b.cliente), max(b.sucursal), max(coalesce(os.terceros_valor, 0))::numeric,
    coalesce(sum(b.total_venta) filter (where b.concepto not in ('Servicio', 'Kilometraje', 'Repuestos')), 0)::numeric,
    coalesce(sum(b.total_venta), 0)::numeric,
    case when coalesce(sum(b.total_venta) filter (where b.concepto not in ('Servicio', 'Kilometraje', 'Repuestos')), 0) <> 0
      then 'Terceros identificado en una linea facturada de Otros'
      else 'Terceros existe solo en la OS o esta incluido dentro de otro concepto facturado' end
  from public.ordenes_servicio_importadas os
  join b on upper(trim(b.os_numero)) = upper(trim(os.os_numero))
  where coalesce(os.terceros_valor, 0) <> 0
  group by os.os_numero
  order by max(coalesce(os.terceros_valor, 0)) desc;
$$;

revoke all on function public.ventas_servicios_terceros_auditoria(date, date, text) from public, anon;
grant execute on function public.ventas_servicios_terceros_auditoria(date, date, text) to authenticated;

notify pgrst, 'reload schema';
