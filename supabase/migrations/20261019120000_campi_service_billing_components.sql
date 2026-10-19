-- Panorama needs the same service movement scope as Ventas de Servicios, with
-- positive sales and reversals kept apart. No stored business data is changed.
create or replace function public.campi_ventas_servicios_componentes_v1(
  p_desde date, p_hasta date
) returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
set statement_timeout = '120s'
set plan_cache_mode = 'force_custom_plan'
as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.has_section_access(auth.uid(), 'servicios.ventas') then
    raise exception 'No tenes acceso a Ventas de Servicios' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'Rango de fechas invalido' using errcode = '22023';
  end if;

  with movimientos as materialized (
    select fecha, total_venta, es_nota_credito
    from public.ventas_servicios_movimientos_enriquecidos(p_desde, p_hasta, null)
  ), periodos as (
    select generate_series(date_trunc('month', p_desde::timestamp),
      date_trunc('month', p_hasta::timestamp), interval '1 month')::date as periodo
  ), totales as (
    select date_trunc('month', fecha::timestamp)::date as periodo,
      coalesce(sum(total_venta), 0)::numeric as total,
      coalesce(sum(total_venta) filter (where total_venta > 0), 0)::numeric as venta_bruta,
      coalesce(abs(sum(total_venta) filter (where total_venta < 0)), 0)::numeric as notas_credito_monto,
      count(*) filter (where es_nota_credito and total_venta > 0)::integer as nc_sign_conflicts
    from movimientos group by 1
  )
  select jsonb_build_object(
    'resumen', jsonb_build_object(
      'total', coalesce(sum(t.total), 0),
      'venta_bruta', coalesce(sum(t.venta_bruta), 0),
      'notas_credito_monto', coalesce(sum(t.notas_credito_monto), 0),
      'nc_sign_conflicts', coalesce(sum(t.nc_sign_conflicts), 0)),
    'periodos', coalesce(jsonb_agg(jsonb_build_object(
      'periodo', p.periodo, 'total', coalesce(t.total, 0),
      'venta_bruta', coalesce(t.venta_bruta, 0),
      'notas_credito_monto', coalesce(t.notas_credito_monto, 0)) order by p.periodo), '[]'::jsonb)
  ) into v_result from periodos p left join totales t using (periodo);
  return v_result;
end;
$$;

revoke all on function public.campi_ventas_servicios_componentes_v1(date,date) from public, anon;
grant execute on function public.campi_ventas_servicios_componentes_v1(date,date) to authenticated;
