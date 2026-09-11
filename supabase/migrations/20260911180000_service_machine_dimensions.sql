BEGIN;
-- Propietario actual y dimensiones del parque. No se infiere dueño de la factura.
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

  with maquinas as materialized (
    select public.parque_normalizar_clave(p.serie) as chasis_clave,
      case when count(*) = 1 then max(c.nombre) end as propietario,
      case when count(*) = 1 then max(coalesce(nullif(p.marca_nombre,''),p.marca::text)) end as marca_parque,
      case when count(*) = 1 then max(coalesce(nullif(p.subgrupo_personalizado,''),p.subgrupo::text)) end as tipo_maquina
    from public.parque_maquinas p left join public.clientes c on c.id = p.cliente_id
    where nullif(public.parque_normalizar_clave(p.serie),'') is not null
    group by public.parque_normalizar_clave(p.serie)
  ), base as materialized (
    select b.*,
      public.ventas_tipo_tiempo_normalizado(coalesce(nullif(fl.tipo_tiempo, ''), nullif(fl.raw_data->>'canonical_time_type', ''), os.tipo_tiempo)) as tipo_tiempo
    from public.ventas_area_movimientos_base(p_desde, p_hasta, p_sucursal, null) b
    left join public.facturacion_lineas_importadas fl
      on fl.id = case when b.metodologia = 'actual' then b.linea_id::uuid else null::uuid end
    left join public.ordenes_servicio_importadas os
      on upper(trim(os.os_numero)) = upper(trim(b.os_numero))
    left join maquinas m on m.chasis_clave = public.parque_normalizar_clave(os.nro_chasis)
    where b.area_calculada = 'servicios'
      and (p_buscar is null or trim(p_buscar) = '' or concat_ws(' ', b.os_numero, b.factura, m.propietario, b.cliente, os.nro_chasis, b.descripcion) ilike '%' || trim(p_buscar) || '%')
      and (p_marca is null or coalesce(m.marca_parque,'Sin identificar') = p_marca)
      and (p_tipo_maquina is null or coalesce(m.tipo_maquina,'Sin identificar') = p_tipo_maquina)
      and b.concepto in ('Servicio', 'Kilometraje', 'Repuestos', 'Terceros')
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
set statement_timeout = '30s'
as $$
declare v_resultado jsonb;
begin
  if auth.uid() is null or not public.has_section_access(auth.uid(), 'servicios.ventas') then
    raise exception 'No tenes acceso a Ventas de Servicios' using errcode = '42501';
  end if;

  with maquinas as materialized (
    select public.parque_normalizar_clave(p.serie) as chasis_clave,
      case when count(*) = 1 then max(c.nombre) end as propietario,
      case when count(*) = 1 then max(coalesce(nullif(p.marca_nombre,''),p.marca::text)) end as marca_parque,
      case when count(*) = 1 then max(coalesce(nullif(p.subgrupo_personalizado,''),p.subgrupo::text)) end as tipo_maquina
    from public.parque_maquinas p left join public.clientes c on c.id = p.cliente_id
    where nullif(public.parque_normalizar_clave(p.serie),'') is not null
    group by public.parque_normalizar_clave(p.serie)
  ), base as materialized (
    select b.*, os.nro_chasis,
      coalesce(m.propietario, 'Propietario no informado') as propietario, m.marca_parque, m.tipo_maquina,
      public.ventas_tipo_tiempo_normalizado(coalesce(nullif(fl.tipo_tiempo, ''), nullif(fl.raw_data->>'canonical_time_type', ''), os.tipo_tiempo)) as tipo_tiempo,
      case when b.os_numero is not null then 'OS:' || upper(trim(b.os_numero))
        else jsonb_build_array(b.metodologia, b.factura, b.cliente, b.sucursal, b.fecha, case when b.factura is null then b.linea_id end)::text end as clave
    from public.ventas_area_movimientos_base(p_desde, p_hasta, p_sucursal, null) b
    left join public.facturacion_lineas_importadas fl
      on fl.id = case when b.metodologia = 'actual' then b.linea_id::uuid else null::uuid end
    left join public.ordenes_servicio_importadas os
      on upper(trim(os.os_numero)) = upper(trim(b.os_numero))
    left join maquinas m on m.chasis_clave = public.parque_normalizar_clave(os.nro_chasis)
    where b.area_calculada = 'servicios'
      and (p_marca is null or coalesce(m.marca_parque,'Sin identificar') = p_marca)
      and (p_tipo_maquina is null or coalesce(m.tipo_maquina,'Sin identificar') = p_tipo_maquina)
      and b.concepto in ('Servicio', 'Kilometraje', 'Repuestos', 'Terceros')
  ), filtrada as (
    select * from base b
    where (p_tipo_tiempo is null or trim(p_tipo_tiempo) = '' or upper(trim(p_tipo_tiempo)) = 'TODOS'
      or b.tipo_tiempo = public.ventas_tipo_tiempo_normalizado(p_tipo_tiempo))
      and (p_buscar is null or trim(p_buscar) = '' or concat_ws(' ', b.os_numero, b.factura, b.propietario, b.cliente, b.nro_chasis, b.tipo_tiempo, b.descripcion) ilike '%' || trim(p_buscar) || '%')
  ), agrupada as (
    select f.clave as id, max(f.fecha) as fecha, max(f.os_numero) as os,
      case when max(f.os_numero) is not null then max(f.os_numero)
        when bool_and(f.es_nota_credito) then 'Nota de credito sin OS'
        else 'Historico sin OS · ' || coalesce(min(f.factura), to_char(max(f.fecha), 'DD/MM/YYYY')) end as os_etiqueta,
      string_agg(distinct coalesce(f.nro_chasis, ''), ' / ') filter (where coalesce(f.nro_chasis, '') <> '') as chasis,
      string_agg(distinct f.propietario, ' / ') as cliente,
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
    'chasis', a.chasis, 'cliente', a.cliente, 'propietario', a.cliente, 'sucursal', a.sucursal,
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
set statement_timeout = '30s'
as $$
declare v_resultado jsonb;
begin
  if auth.uid() is null or not public.has_section_access(auth.uid(), 'servicios.ventas') then
    raise exception 'No tenes acceso a Ventas de Servicios' using errcode = '42501';
  end if;

  with maquinas as materialized (
    select public.parque_normalizar_clave(p.serie) as chasis_clave,
      case when count(*) = 1 then max(c.nombre) end as propietario,
      case when count(*) = 1 then max(coalesce(nullif(p.marca_nombre,''),p.marca::text)) end as marca_parque,
      case when count(*) = 1 then max(coalesce(nullif(p.subgrupo_personalizado,''),p.subgrupo::text)) end as tipo_maquina
    from public.parque_maquinas p left join public.clientes c on c.id = p.cliente_id
    where nullif(public.parque_normalizar_clave(p.serie),'') is not null
    group by public.parque_normalizar_clave(p.serie)
  ), base as materialized (
    select b.*, m.propietario, m.marca_parque, m.tipo_maquina, public.ventas_tipo_tiempo_normalizado(coalesce(nullif(fl.tipo_tiempo, ''), nullif(fl.raw_data->>'canonical_time_type', ''), os.tipo_tiempo)) as tipo_tiempo
    from public.ventas_area_movimientos_base(p_desde, p_hasta, p_sucursal, null) b
    left join public.facturacion_lineas_importadas fl
      on fl.id = case when b.metodologia = 'actual' then b.linea_id::uuid else null::uuid end
    left join public.ordenes_servicio_importadas os
      on upper(trim(os.os_numero)) = upper(trim(b.os_numero))
    left join maquinas m on m.chasis_clave = public.parque_normalizar_clave(os.nro_chasis)
    where b.area_calculada = 'servicios'
      and (p_marca is null or coalesce(m.marca_parque,'Sin identificar') = p_marca)
      and (p_tipo_maquina is null or coalesce(m.tipo_maquina,'Sin identificar') = p_tipo_maquina)
      and b.concepto in ('Servicio', 'Kilometraje', 'Repuestos', 'Terceros')
  ), filtrada as (
    select * from base b
    where p_tipo_tiempo is null or trim(p_tipo_tiempo) = '' or upper(trim(p_tipo_tiempo)) = 'TODOS'
      or b.tipo_tiempo = public.ventas_tipo_tiempo_normalizado(p_tipo_tiempo)
  ), lineas as (
    select f.linea_id as id, f.fecha, coalesce(f.factura, 'Sin numero') as factura,
      f.os_numero as os, coalesce(f.cliente, 'Sin cliente') as cliente,
      coalesce(f.sucursal, 'Sin sucursal') as sucursal, f.tipo_tiempo,
      case when f.concepto = 'Servicio' then 'Mano de obra' else f.concepto end as componente,
      f.total_venta, f.cantidad, f.propietario, f.marca_parque, f.tipo_maquina
    from filtrada f
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'fecha', l.fecha, 'factura', l.factura, 'os', l.os,
    'cliente', l.cliente, 'sucursal', l.sucursal, 'tipo_tiempo', l.tipo_tiempo,
    'propietario', coalesce(l.propietario,'Propietario no informado'), 'marca', coalesce(l.marca_parque,'Sin identificar'), 'tipo_maquina', coalesce(l.tipo_maquina,'Sin identificar'),
    'componente', l.componente, 'total_venta', l.total_venta, 'cantidad', l.cantidad
  ) order by l.fecha desc, l.factura, l.id), '[]'::jsonb)
  into v_resultado from lineas l;
  return v_resultado;
end;
$$;

revoke all on function public.ventas_servicios_lineas_v2(date, date, text, text, text, text) from public, anon;
grant execute on function public.ventas_servicios_lineas_v2(date, date, text, text, text, text) to authenticated;

-- Narrow, indexed machine history. The authorization gate is identical to sales.
create index if not exists idx_facturacion_lineas_linked_os_id
on public.facturacion_lineas_importadas ((raw_data->>'linked_service_order'), id);

create or replace function public.ventas_servicios_dimensiones()
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_section_access(auth.uid(), 'servicios.ventas') then
    raise exception 'No tenes acceso a Ventas de Servicios' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) from (
    select distinct coalesce(nullif(marca_nombre,''),nullif(marca::text,''),'Sin identificar') as marca,
      coalesce(nullif(coalesce(nullif(subgrupo_personalizado,''),subgrupo::text),''),'Sin identificar') as tipo_maquina
    from public.parque_maquinas
    union select 'Sin identificar', 'Sin identificar'
  ) d);
end;
$$;
revoke all on function public.ventas_servicios_dimensiones() from public, anon;
grant execute on function public.ventas_servicios_dimensiones() to authenticated;

create or replace function public.ventas_servicios_historial(p_chasis text, p_vista text default 'os')
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
set statement_timeout = '30s'
as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.has_section_access(auth.uid(), 'servicios.ventas') then
    raise exception 'No tenes acceso a Ventas de Servicios' using errcode = '42501';
  end if;
  if nullif(public.parque_normalizar_clave(p_chasis),'') is null then
    raise exception 'Chasis requerido';
  end if;
  if p_vista = 'os' then
    select coalesce(jsonb_agg(to_jsonb(o) order by o.fecha_abierta_os desc nulls last, o.os_numero), '[]'::jsonb)
    into result from (
      select os_numero, fecha_abierta_os, fecha_cierre_os, tipo_tiempo, servicios_cantidad,
        km_cantidad, responsable, situacion_os, factura, raw_data
      from public.ordenes_servicio_importadas
      where nro_chasis is not null and public.parque_normalizar_clave(nro_chasis) = public.parque_normalizar_clave(p_chasis)
    ) o;
  elsif p_vista = 'maquina' then
    select case when count(*) = 1 then jsonb_build_object(
      'modelo_tipo', max(p.modelo_tipo), 'clientes', jsonb_build_object('nombre',max(c.nombre)))
      else null end into result
    from public.parque_maquinas p left join public.clientes c on c.id = p.cliente_id
    where public.parque_normalizar_clave(p.serie) = public.parque_normalizar_clave(p_chasis);
  elsif p_vista = 'repuestos' then
    with ordenes as materialized (
      select distinct os_numero from public.ordenes_servicio_importadas
      where nro_chasis is not null and public.parque_normalizar_clave(nro_chasis) = public.parque_normalizar_clave(p_chasis)
    )
    select coalesce(jsonb_agg(to_jsonb(p) order by p.fecha_factura desc, p.id), '[]'::jsonb) into result
    from (
      select f.id, f.fecha_factura, f.factura, f.cod_mercaderia, f.codigo_fabricante,
        f.mercaderia, f.observacion, f.cantidad, f.total_venta,
        jsonb_build_object('linked_service_order', f.raw_data->>'linked_service_order') as raw_data
      from ordenes o join public.facturacion_lineas_importadas f
        on f.raw_data->>'linked_service_order' = o.os_numero
      where lower(coalesce(nullif(f.grupo_normalizado,''), f.subgrupo_original,'')) like '%repuesto%'
    ) p;
  else
    raise exception 'Vista no válida';
  end if;
  return result;
end;
$$;
revoke all on function public.ventas_servicios_historial(text,text) from public, anon;
grant execute on function public.ventas_servicios_historial(text,text) to authenticated;

notify pgrst, 'reload schema';

COMMIT;
