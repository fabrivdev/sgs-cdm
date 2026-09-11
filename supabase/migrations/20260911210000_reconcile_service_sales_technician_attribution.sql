-- Ventas de Servicios:
-- 1) completa el resumen por tipo con clientes y facturas para que sea comparable
--    con el panorama por periodo;
-- 2) atribuye la mano de obra a cada tecnico segun sus horas computables dentro de la
--    OS y del tipo de tiempo correspondiente. El tipo corregido manualmente en
--    Comisiones (comisiones_jornadas.tipo_tiempo) prevalece sobre el importado.

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

  with maquinas as materialized (
    select public.parque_normalizar_clave(p.serie) as chasis_clave,
      case when count(*) = 1 then max(coalesce(nullif(p.marca_nombre,''),p.marca::text)) end as marca_parque,
      case when count(*) = 1 then max(coalesce(nullif(p.subgrupo_personalizado,''),p.subgrupo::text)) end as tipo_maquina,
      case when count(*) = 1 then max(c.nombre) end as propietario
    from public.parque_maquinas p left join public.clientes c on c.id = p.cliente_id
    where nullif(public.parque_normalizar_clave(p.serie),'') is not null
    group by public.parque_normalizar_clave(p.serie)
  ), base as materialized (
    select b.*, os.nro_chasis, m.marca_parque, m.tipo_maquina, m.propietario,
      public.ventas_tipo_tiempo_normalizado(coalesce(nullif(fl.tipo_tiempo, ''), nullif(fl.raw_data->>'canonical_time_type', ''), os.tipo_tiempo)) as tipo_tiempo
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
  ), filtrada as materialized (
    select * from base b
    where (p_tipo_tiempo is null or trim(p_tipo_tiempo) = '' or upper(trim(p_tipo_tiempo)) = 'TODOS'
      or b.tipo_tiempo = public.ventas_tipo_tiempo_normalizado(p_tipo_tiempo))
      and (p_buscar is null or trim(p_buscar) = '' or concat_ws(' ', b.os_numero, b.factura, b.propietario, b.cliente, b.nro_chasis, b.tipo_tiempo, b.descripcion) ilike '%' || trim(p_buscar) || '%')
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

  with maquinas as materialized (
    select public.parque_normalizar_clave(p.serie) as chasis_clave,
      case when count(*) = 1 then max(coalesce(nullif(p.marca_nombre,''),p.marca::text)) end as marca_parque,
      case when count(*) = 1 then max(coalesce(nullif(p.subgrupo_personalizado,''),p.subgrupo::text)) end as tipo_maquina,
      case when count(*) = 1 then max(c.nombre) end as propietario
    from public.parque_maquinas p left join public.clientes c on c.id = p.cliente_id
    where nullif(public.parque_normalizar_clave(p.serie),'') is not null
    group by public.parque_normalizar_clave(p.serie)
  ), base as materialized (
    select b.*, os.nro_chasis, m.marca_parque, m.tipo_maquina, m.propietario,
      public.ventas_tipo_tiempo_normalizado(coalesce(nullif(fl.tipo_tiempo, ''), nullif(fl.raw_data->>'canonical_time_type', ''), os.tipo_tiempo)) as tipo_tiempo
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
  ), filtrada as materialized (
    select * from base b
    where (p_tipo_tiempo is null or trim(p_tipo_tiempo) = '' or upper(trim(p_tipo_tiempo)) = 'TODOS'
      or b.tipo_tiempo = public.ventas_tipo_tiempo_normalizado(p_tipo_tiempo))
      and (p_buscar is null or trim(p_buscar) = '' or concat_ws(' ', b.os_numero, b.factura, b.propietario, b.cliente, b.nro_chasis, b.tipo_tiempo, b.descripcion) ilike '%' || trim(p_buscar) || '%')
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
