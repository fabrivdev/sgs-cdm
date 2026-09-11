CREATE OR REPLACE FUNCTION public.ventas_servicios_tecnicos_v1(p_desde date, p_hasta date, p_sucursal text DEFAULT NULL::text, p_tipo_tiempo text DEFAULT NULL::text, p_marca text DEFAULT NULL::text, p_tipo_maquina text DEFAULT NULL::text, p_buscar text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '30s'
AS $function$
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
  ), mo_os as (
    select upper(trim(f.os_numero)) as os_clave,
      coalesce(sum(f.total_venta) filter (where f.concepto = 'Servicio'),0)::numeric as mo
    from filtrada f where f.os_numero is not null group by 1
  ), jornadas as (
    select upper(trim(j.os_numero)) as os_clave,
      coalesce(j.tecnico_profile_id::text, upper(trim(j.tecnico_nombre))) as tecnico_clave,
      max(coalesce(nullif(trim(j.tecnico_nombre),''), 'Sin nombre')) as tecnico_nombre,
      public.ventas_tipo_tiempo_normalizado(coalesce(nullif(trim(j.tipo_tiempo),''), nullif(trim(j.tipo_tiempo_importado),''))) as tipo_tiempo,
      coalesce(sum(coalesce(j.horas_validas, j.horas_calculadas, j.horas_reportadas, 0)),0)::numeric as horas
    from public.comisiones_jornadas j
    where j.vigente
      and upper(trim(j.os_numero)) in (select os_clave from mo_os)
      and (p_tipo_tiempo is null or trim(p_tipo_tiempo) = '' or upper(trim(p_tipo_tiempo)) = 'TODOS'
        or public.ventas_tipo_tiempo_normalizado(coalesce(nullif(trim(j.tipo_tiempo),''), nullif(trim(j.tipo_tiempo_importado),''))) = public.ventas_tipo_tiempo_normalizado(p_tipo_tiempo))
    group by 1,2,4
  ), participantes as (
    select os_clave, count(distinct tecnico_clave)::numeric as tecnicos from jornadas group by 1
  ), reparto as (
    select j.tecnico_clave, j.tecnico_nombre, j.tipo_tiempo, j.horas,
      case when coalesce(sum(j.horas) over (partition by j.os_clave, j.tecnico_clave), 0) > 0
        then (m.mo / p.tecnicos) * (j.horas / sum(j.horas) over (partition by j.os_clave, j.tecnico_clave))
        else (m.mo / p.tecnicos) / count(*) over (partition by j.os_clave, j.tecnico_clave)
      end as mo
    from jornadas j
    join participantes p on p.os_clave = j.os_clave
    join mo_os m on m.os_clave = j.os_clave
  )
  select coalesce(jsonb_agg(t order by t.total_horas desc, t.tecnico), '[]'::jsonb) into v_resultado
  from (
    select r.tecnico_clave, max(r.tecnico_nombre) as tecnico,
      coalesce(sum(r.horas) filter (where r.tipo_tiempo = 'Cliente'),0)::numeric as horas_cliente,
      coalesce(sum(r.horas) filter (where r.tipo_tiempo = 'Garantia'),0)::numeric as horas_garantia,
      coalesce(sum(r.horas) filter (where r.tipo_tiempo = 'Interno'),0)::numeric as horas_interno,
      coalesce(sum(r.horas) filter (where r.tipo_tiempo not in ('Cliente','Garantia','Interno')),0)::numeric as horas_otros,
      coalesce(sum(r.horas),0)::numeric as total_horas,
      coalesce(sum(r.mo) filter (where r.tipo_tiempo = 'Cliente'),0)::numeric as mo_cliente,
      coalesce(sum(r.mo) filter (where r.tipo_tiempo = 'Garantia'),0)::numeric as mo_garantia,
      coalesce(sum(r.mo) filter (where r.tipo_tiempo = 'Interno'),0)::numeric as mo_interno,
      coalesce(sum(r.mo) filter (where r.tipo_tiempo not in ('Cliente','Garantia','Interno')),0)::numeric as mo_otros,
      coalesce(sum(r.mo),0)::numeric as mo_total
    from reparto r group by r.tecnico_clave
  ) t;

  return v_resultado;
end;
$function$;