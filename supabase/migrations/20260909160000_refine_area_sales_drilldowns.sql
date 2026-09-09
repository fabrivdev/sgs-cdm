-- Reemplaza la salida generica de Ventas por desgloses propios de cada area.

insert into public.app_secciones (id, modulo_id, nombre, orden, activo) values
  ('servicios.ventas', 'servicios', 'Ventas', 5, true),
  ('parque.ventas', 'parque', 'Ventas', 5, true),
  ('repuestos.ventas', 'repuestos', 'Ventas', 5, true)
on conflict (id) do update
set modulo_id = excluded.modulo_id,
    nombre = excluded.nombre,
    orden = excluded.orden,
    activo = excluded.activo;

create or replace function public.ventas_area_resumen(
  p_area text,
  p_desde date,
  p_hasta date,
  p_sucursal text default null,
  p_buscar text default null,
  p_limite integer default 200
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
set statement_timeout = '30s'
as $$
declare
  v_area text := lower(trim(coalesce(p_area, '')));
  v_seccion text;
  v_resultado jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sesion requerida' using errcode = '42501';
  end if;

  if v_area not in ('servicios', 'repuestos', 'maquinas') then
    raise exception 'Area de ventas invalida: %', p_area using errcode = '22023';
  end if;

  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'Rango de fechas invalido' using errcode = '22023';
  end if;

  v_seccion := case v_area
    when 'servicios' then 'servicios.ventas'
    when 'repuestos' then 'repuestos.ventas'
    else 'parque.ventas'
  end;

  if not public.has_section_access(auth.uid(), v_seccion) then
    raise exception 'No tenes acceso a esta seccion de Ventas' using errcode = '42501';
  end if;

  with movimientos as (
    select
      f.id::text as linea_id,
      f.fecha::date as fecha,
      nullif(trim(f.cod_factura), '') as factura,
      f.entidad_nombre as cliente,
      f.sucursal::text as sucursal,
      case
        when lower(trim(coalesce(f.grupo_fx, f.grupo, ''))) like '%maquin%' then 'Maquinarias'
        when lower(trim(coalesce(f.grupo_fx, f.grupo, ''))) like '%repuesto%' then 'Repuestos'
        when lower(trim(coalesce(f.grupo_fx, f.grupo, ''))) like '%kilometr%' then 'Kilometraje'
        when lower(trim(coalesce(f.grupo_fx, f.grupo, ''))) like '%servic%'
          or lower(trim(coalesce(f.grupo_fx, f.grupo, ''))) like '%mano de obra%' then 'Servicio'
        else 'Otros'
      end as concepto,
      coalesce(f.total_venta, 0)::numeric as total_venta,
      'historico'::text as metodologia,
      false as vinculada_os,
      null::text as os_numero,
      null::text as codigo,
      null::text as codigo_fabricante,
      nullif(trim(coalesce(f.grupo_fx, f.grupo)), '') as descripcion,
      coalesce(f.cantidad, 0)::numeric as cantidad,
      null::text as marca,
      '{}'::jsonb as raw_data
    from public.facturacion f
    where f.fecha::date between p_desde and least(p_hasta, date '2026-06-30')
      and not coalesce(f.excluido_de_reportes, false)
      and upper(trim(coalesce(f.moneda, 'USD'))) = 'USD'

    union all

    select
      f.id::text,
      f.fecha_factura::date,
      coalesce(nullif(trim(f.factura), ''), nullif(trim(f.codigo_interno_factura), '')),
      f.entidad_nombre,
      f.sucursal::text,
      case
        when lower(trim(coalesce(f.grupo_normalizado, f.subgrupo_original, ''))) like '%maquin%' then 'Maquinarias'
        when lower(trim(coalesce(f.grupo_normalizado, f.subgrupo_original, ''))) like '%repuesto%' then 'Repuestos'
        when lower(trim(coalesce(f.grupo_normalizado, f.subgrupo_original, ''))) like '%kilometr%' then 'Kilometraje'
        when lower(trim(coalesce(f.grupo_normalizado, f.subgrupo_original, ''))) like '%servic%'
          or lower(trim(coalesce(f.grupo_normalizado, f.subgrupo_original, ''))) like '%mano de obra%' then 'Servicio'
        else 'Otros'
      end,
      coalesce(f.total_venta, 0)::numeric,
      'actual'::text,
      (
        f.origen_sistema = 'new_xml_facturacion_os'
        or nullif(trim(coalesce(f.raw_data ->> 'linked_service_order', '')), '') is not null
      ),
      nullif(trim(coalesce(f.raw_data ->> 'linked_service_order', '')), ''),
      nullif(trim(f.cod_mercaderia), ''),
      nullif(trim(f.codigo_fabricante), ''),
      coalesce(nullif(trim(f.mercaderia), ''), nullif(trim(f.observacion), ''), nullif(trim(f.subgrupo_original), '')),
      coalesce(f.cantidad, 0)::numeric,
      f.marca_normalizada::text,
      coalesce(f.raw_data, '{}'::jsonb)
    from public.facturacion_lineas_importadas f
    where f.fecha_factura::date between greatest(p_desde, date '2026-07-01') and p_hasta
      and upper(trim(coalesce(f.moneda, 'USD'))) = 'USD'
  ), clasificados as (
    select
      m.*,
      case
        when m.metodologia = 'historico' then case
          when m.concepto = 'Maquinarias' then 'maquinas'
          when m.concepto = 'Repuestos' then 'repuestos'
          when m.concepto in ('Servicio', 'Kilometraje') then 'servicios'
          else 'otros'
        end
        when m.concepto = 'Maquinarias' then 'maquinas'
        when m.vinculada_os then 'servicios'
        when m.concepto = 'Repuestos' then 'repuestos'
        when m.concepto in ('Servicio', 'Kilometraje') then 'servicios'
        else 'otros'
      end as area
    from movimientos m
  ), filtrados as (
    select *
    from clasificados c
    where c.area = v_area
      and (
        p_sucursal is null or trim(p_sucursal) = '' or upper(trim(p_sucursal)) = 'TODAS'
        or upper(coalesce(c.sucursal, '')) = upper(trim(p_sucursal))
      )
      and (
        p_buscar is null or trim(p_buscar) = ''
        or coalesce(c.factura, '') ilike '%' || trim(p_buscar) || '%'
        or coalesce(c.cliente, '') ilike '%' || trim(p_buscar) || '%'
        or c.concepto ilike '%' || trim(p_buscar) || '%'
        or coalesce(c.os_numero, '') ilike '%' || trim(p_buscar) || '%'
        or coalesce(c.codigo, '') ilike '%' || trim(p_buscar) || '%'
        or coalesce(c.codigo_fabricante, '') ilike '%' || trim(p_buscar) || '%'
        or coalesce(c.descripcion, '') ilike '%' || trim(p_buscar) || '%'
        or c.raw_data::text ilike '%' || trim(p_buscar) || '%'
      )
  ), enriquecidos as (
    select
      f.*,
      case when v_area = 'maquinas' and f.metodologia = 'actual' then
        coalesce(
          nullif(trim(public.valor_json_insensible(f.raw_data, array['MODELO', 'MODEL'])), ''),
          nullif(trim((regexp_match(coalesce(f.descripcion, ''), '(?i)MODELO[[:space:]]*:[[:space:]]*([^|;]+)'))[1]), ''),
          f.descripcion
        )
      else null end as modelo,
      case when v_area = 'maquinas' and f.metodologia = 'actual' then
        public.extraer_chasis_venta_maquina(f.descripcion, f.raw_data, f.os_numero)
      else null end as chasis
    from filtrados f
  ), documentos as (
    select
      min(linea_id) as id,
      fecha,
      coalesce(factura, 'Sin numero') as factura,
      cliente,
      sucursal,
      metodologia,
      bool_or(vinculada_os) as vinculada_os,
      sum(total_venta)::numeric as total_venta
    from enriquecidos
    group by fecha, coalesce(factura, 'Sin numero'), cliente, sucursal, metodologia
  ), resumen as (
    select
      coalesce(sum(total_venta), 0)::numeric as total,
      count(*)::integer as facturas,
      count(distinct nullif(cliente, ''))::integer as clientes,
      coalesce(sum(total_venta) filter (where metodologia = 'historico'), 0)::numeric as historico,
      coalesce(sum(total_venta) filter (where metodologia = 'actual'), 0)::numeric as actual
    from documentos
  ), desglose as (
    select coalesce(
      jsonb_agg(jsonb_build_object('concepto', concepto, 'importe', importe) order by importe desc),
      '[]'::jsonb
    ) as data
    from (
      select concepto, sum(total_venta)::numeric as importe
      from enriquecidos
      group by concepto
    ) d
  ), sucursales as (
    select coalesce(
      jsonb_agg(jsonb_build_object('sucursal', sucursal, 'importe', importe, 'facturas', facturas) order by importe desc),
      '[]'::jsonb
    ) as data
    from (
      select coalesce(sucursal, 'Sin informar') as sucursal,
             sum(total_venta)::numeric as importe,
             count(distinct coalesce(factura, linea_id))::integer as facturas
      from enriquecidos
      group by coalesce(sucursal, 'Sin informar')
    ) s
  ), grupos_base as (
    select
      case v_area
        when 'servicios' then coalesce(os_numero, case when metodologia = 'historico' then 'OS no disponible' else 'Sin OS' end)
        when 'repuestos' then coalesce(codigo, codigo_fabricante, 'Sin codigo')
        else coalesce(modelo, descripcion, 'Modelo no informado') || '|' || coalesce(chasis, 'Sin chasis')
      end as clave,
      case v_area
        when 'servicios' then coalesce(max(os_numero), case when max(metodologia) = 'historico' then 'OS no disponible' else 'Venta directa / sin OS' end)
        when 'repuestos' then coalesce(max(descripcion), 'Repuesto sin descripcion')
        else coalesce(max(modelo), max(descripcion), 'Modelo no informado')
      end as nombre,
      case v_area
        when 'servicios' then string_agg(distinct concepto, ' · ' order by concepto)
        when 'repuestos' then max(codigo_fabricante)
        else max(chasis)
      end as referencia,
      max(marca) as marca,
      sum(cantidad)::numeric as cantidad,
      count(distinct coalesce(factura, linea_id))::integer as facturas,
      count(distinct nullif(cliente, ''))::integer as clientes,
      sum(total_venta)::numeric as importe
    from enriquecidos
    group by
      case v_area
        when 'servicios' then coalesce(os_numero, case when metodologia = 'historico' then 'OS no disponible' else 'Sin OS' end)
        when 'repuestos' then coalesce(codigo, codigo_fabricante, 'Sin codigo')
        else coalesce(modelo, descripcion, 'Modelo no informado') || '|' || coalesce(chasis, 'Sin chasis')
      end
  ), grupos as (
    select coalesce(jsonb_agg(to_jsonb(g) order by g.importe desc), '[]'::jsonb) as data
    from (
      select * from grupos_base order by importe desc limit 500
    ) g
  ), detalle as (
    select coalesce(jsonb_agg(to_jsonb(d) order by d.fecha desc, d.factura), '[]'::jsonb) as data
    from (
      select
        linea_id as id, fecha, coalesce(factura, 'Sin numero') as factura,
        cliente, sucursal, concepto, metodologia, total_venta, cantidad,
        os_numero, codigo, codigo_fabricante, descripcion, marca, modelo, chasis
      from enriquecidos
      order by fecha desc, factura
      limit least(greatest(coalesce(p_limite, 300), 1), 500)
    ) d
  )
  select jsonb_build_object(
    'area', v_area,
    'desde', p_desde,
    'hasta', p_hasta,
    'total', r.total,
    'facturas', r.facturas,
    'clientes', r.clientes,
    'promedio', case when r.facturas > 0 then r.total / r.facturas else 0 end,
    'historico', r.historico,
    'actual', r.actual,
    'cruza_corte', p_desde < date '2026-07-01' and p_hasta >= date '2026-07-01',
    'desglose', d.data,
    'sucursales', s.data,
    'grupos', g.data,
    'lineas', l.data
  )
  into v_resultado
  from resumen r cross join desglose d cross join sucursales s cross join grupos g cross join detalle l;

  return v_resultado;
end;
$$;

revoke all on function public.ventas_area_resumen(text, date, date, text, text, integer) from public, anon;
grant execute on function public.ventas_area_resumen(text, date, date, text, text, integer) to authenticated;

notify pgrst, 'reload schema';
