BEGIN;
-- Requiere 20260915100000_unify_service_sales_identity_and_search.sql.
-- Restaura el contrato de Resumen: por_tipo + por_marca_tipo + por_maquina.
-- No cambia la población, los importes, los tipos corregidos ni el reparto técnico.
-- El histórico sin OS verificable conserva su neto; sus horas son desconocidas.
DO $$
BEGIN
  IF to_regprocedure('public.ventas_servicios_movimientos_enriquecidos(date,date,text)') IS NULL THEN
    RAISE EXCEPTION 'Aplicá primero 20260915100000_unify_service_sales_identity_and_search.sql';
  END IF;
END;
$$;

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
    select b.*, (b.metodologia='historico' and b.os_numero is null) as sin_vinculo_historico from base b
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
    select f.tipo_tiempo, f.sin_vinculo_historico,
      coalesce(sum(f.total_venta),0)::numeric as neto,
      coalesce(sum(f.total_venta) filter (where f.concepto = 'Servicio'),0)::numeric as mo,
      coalesce(sum(f.total_venta) filter (where f.concepto = 'Kilometraje'),0)::numeric as km,
      coalesce(sum(f.total_venta) filter (where f.concepto = 'Repuestos'),0)::numeric as repuestos,
      coalesce(sum(f.total_venta) filter (where f.concepto = 'Terceros'),0)::numeric as terceros,
      count(distinct upper(trim(f.os_numero)))::integer as ordenes,
      count(distinct nullif(trim(f.cliente),''))::integer as clientes,
      count(distinct jsonb_build_array(f.factura, f.fecha, f.cliente, f.sucursal, case when f.factura is null then f.linea_id end))::integer as facturas
    from filtrada f group by 1,2
  ), por_marca_tipo as (
    select coalesce(f.marca_parque,'Sin identificar') as marca,
      f.tipo_tiempo, f.sin_vinculo_historico,
      coalesce(sum(f.total_venta),0)::numeric as neto,
      coalesce(sum(f.total_venta) filter (where f.concepto='Servicio'),0)::numeric as mo,
      coalesce(sum(f.total_venta) filter (where f.concepto='Kilometraje'),0)::numeric as km,
      coalesce(sum(f.total_venta) filter (where f.concepto='Repuestos'),0)::numeric as repuestos,
      coalesce(sum(f.total_venta) filter (where f.concepto='Terceros'),0)::numeric as terceros
    from filtrada f group by 1,2,3
  ), horas_marca_tipo as (
    select h.marca,h.tipo_tiempo,sum(h.horas)::numeric as horas
    from horas_filtradas h group by 1,2
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
        'tipo_tiempo', p.tipo_tiempo, 'sin_vinculo_historico',p.sin_vinculo_historico, 'mo', p.mo, 'km', p.km, 'repuestos', p.repuestos,
        'terceros', p.terceros, 'neto', p.neto, 'ordenes', p.ordenes,
        'clientes', p.clientes, 'facturas', p.facturas,
        'horas', case when p.sin_vinculo_historico then null::numeric else
          (select coalesce(sum(h.horas),0) from horas_filtradas h where h.tipo_tiempo = p.tipo_tiempo) end
      ) order by p.neto desc), '[]'::jsonb) from por_tipo p
    ),
    'por_marca_tipo', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'marca',p.marca,'tipo_tiempo',p.tipo_tiempo,'sin_vinculo_historico',p.sin_vinculo_historico,
        'mo',p.mo,'km',p.km,'repuestos',p.repuestos,'terceros',p.terceros,'neto',p.neto,
        'horas',case when p.sin_vinculo_historico then null::numeric else coalesce(h.horas,0) end
      ) order by p.sin_vinculo_historico,p.marca,p.tipo_tiempo),'[]'::jsonb)
      from por_marca_tipo p left join horas_marca_tipo h
        on h.marca=p.marca and h.tipo_tiempo=p.tipo_tiempo
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


NOTIFY pgrst, 'reload schema';
COMMIT;
