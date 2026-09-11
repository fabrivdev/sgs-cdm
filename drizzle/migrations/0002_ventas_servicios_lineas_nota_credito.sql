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
      f.total_venta, f.cantidad, f.propietario, f.marca_parque, f.tipo_maquina,
      coalesce(f.es_nota_credito, false) as es_nota_credito
    from filtrada f
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'fecha', l.fecha, 'factura', l.factura, 'os', l.os,
    'cliente', l.cliente, 'sucursal', l.sucursal, 'tipo_tiempo', l.tipo_tiempo,
    'propietario', coalesce(l.propietario,'Propietario no informado'), 'marca', coalesce(l.marca_parque,'Sin identificar'), 'tipo_maquina', coalesce(l.tipo_maquina,'Sin identificar'),
    'componente', l.componente, 'total_venta', l.total_venta, 'cantidad', l.cantidad,
    'es_nota_credito', l.es_nota_credito
  ) order by l.fecha desc, l.factura, l.id), '[]'::jsonb)
  into v_resultado from lineas l;
  return v_resultado;
end;
$$;

revoke all on function public.ventas_servicios_lineas_v2(date, date, text, text, text, text) from public, anon;
grant execute on function public.ventas_servicios_lineas_v2(date, date, text, text, text, text) to authenticated;