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
        km_cantidad, responsable, situacion_os, factura, raw_data,
        servicios_valor, repuesto_valor, kilometro_valor, terceros_valor
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