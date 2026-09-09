-- Ventas de Servicios usa la OS como fuente de verdad y el analisis se calcula
-- sobre todo el periodo, no sobre las ultimas lineas visibles.

create or replace function public.ventas_area_movimientos_base(
  p_desde date,
  p_hasta date,
  p_sucursal text default null,
  p_buscar text default null
)
returns table (
  linea_id text,
  fecha date,
  factura text,
  cliente text,
  sucursal text,
  concepto text,
  total_venta numeric,
  metodologia text,
  vinculada_os boolean,
  es_nota_credito boolean,
  os_numero text,
  codigo text,
  codigo_fabricante text,
  descripcion text,
  cantidad numeric,
  marca text,
  modelo text,
  chasis text,
  area_calculada text
)
language sql
stable
security definer
set search_path = public, pg_temp
set statement_timeout = '30s'
as $$
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
      false as es_nota_credito,
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
      nullif(trim(coalesce(f.raw_data ->> 'linked_service_order', '')), '') is not null,
      coalesce(f.raw_data ->> 'canonical_document_kind', '') = 'NotaCredito'
        or upper(coalesce(public.valor_json_insensible(f.raw_data, array['ESPECIE']), '')) like '%NCC%'
        or coalesce(f.total_venta, 0) < 0,
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
        when m.es_nota_credito and m.concepto in ('Servicio', 'Kilometraje') then 'servicios'
        when m.concepto in ('Servicio', 'Kilometraje') then 'revision'
        else 'otros'
      end as area_calculada
    from movimientos m
  ), filtrados as (
    select *
    from clasificados c
    where (
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
  )
  select
    f.linea_id, f.fecha, f.factura, f.cliente, f.sucursal, f.concepto,
    f.total_venta, f.metodologia, f.vinculada_os, f.es_nota_credito,
    f.os_numero, f.codigo, f.codigo_fabricante, f.descripcion, f.cantidad, f.marca,
    case when f.metodologia = 'actual' and f.concepto = 'Maquinarias' then
      regexp_replace(
        coalesce(
          nullif(trim(public.valor_json_insensible(f.raw_data, array['MODELO', 'MODEL'])), ''),
          nullif(trim((regexp_match(coalesce(f.descripcion, ''), '(?i)MODELO[[:space:]]*:[[:space:]]*([^|;]+)'))[1]), ''),
          f.descripcion
        ),
        '[[:space:]]*[-·]?[[:space:]]*(CHASIS|CASIS)[[:space:]]*:.*$', '', 'i'
      )
    else null end as modelo,
    case when f.metodologia = 'actual' and f.concepto = 'Maquinarias'
      then public.extraer_chasis_venta_maquina(f.descripcion, f.raw_data, f.os_numero)
      else null end as chasis,
    f.area_calculada
  from filtrados f;
$$;

revoke all on function public.ventas_area_movimientos_base(date, date, text, text) from public, anon, authenticated;

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
  if auth.uid() is null then raise exception 'Sesion requerida' using errcode = '42501'; end if;
  if v_area not in ('servicios', 'repuestos', 'maquinas') then raise exception 'Area de ventas invalida' using errcode = '22023'; end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then raise exception 'Rango de fechas invalido' using errcode = '22023'; end if;

  v_seccion := case v_area when 'servicios' then 'servicios.ventas' when 'repuestos' then 'repuestos.ventas' else 'parque.ventas' end;
  if not public.has_section_access(auth.uid(), v_seccion) then raise exception 'No tenes acceso a esta seccion de Ventas' using errcode = '42501'; end if;

  with base as (
    select * from public.ventas_area_movimientos_base(p_desde, p_hasta, p_sucursal, p_buscar)
  ), filtrados as (
    select * from base where area_calculada = v_area
  ), documentos as (
    select fecha, coalesce(factura, 'Sin numero') as factura, cliente, sucursal, metodologia, sum(total_venta)::numeric as total_venta
    from filtrados group by fecha, coalesce(factura, 'Sin numero'), cliente, sucursal, metodologia
  ), resumen as (
    select coalesce(sum(total_venta), 0)::numeric as total, count(*)::integer as facturas,
      count(distinct nullif(cliente, ''))::integer as clientes,
      coalesce(sum(total_venta) filter (where metodologia = 'historico'), 0)::numeric as historico,
      coalesce(sum(total_venta) filter (where metodologia = 'actual'), 0)::numeric as actual
    from documentos
  ), clientes as (
    select coalesce(jsonb_agg(to_jsonb(c) order by c.importe desc), '[]'::jsonb) as data
    from (
      select coalesce(cliente, 'Sin cliente') as nombre, sum(total_venta)::numeric as importe,
        count(distinct coalesce(factura, linea_id))::integer as facturas
      from filtrados group by coalesce(cliente, 'Sin cliente')
    ) c
  ), detalle as (
    select coalesce(jsonb_agg(to_jsonb(d) order by d.fecha desc, d.factura), '[]'::jsonb) as data
    from (
      select linea_id as id, fecha, coalesce(factura, 'Sin numero') as factura, cliente, sucursal,
        concepto, metodologia, total_venta, cantidad, os_numero, codigo, codigo_fabricante,
        descripcion, marca, modelo, chasis, es_nota_credito
      from filtrados order by fecha desc, factura
      limit least(greatest(coalesce(p_limite, 300), 1), 500)
    ) d
  ), pendientes as (
    select count(distinct coalesce(factura, linea_id))::integer as facturas,
      coalesce(sum(total_venta), 0)::numeric as importe
    from base where area_calculada = 'revision'
  )
  select jsonb_build_object(
    'area', v_area, 'desde', p_desde, 'hasta', p_hasta,
    'total', r.total, 'facturas', r.facturas, 'clientes', r.clientes,
    'promedio', case when r.facturas > 0 then r.total / r.facturas else 0 end,
    'historico', r.historico, 'actual', r.actual,
    'cruza_corte', p_desde < date '2026-07-01' and p_hasta >= date '2026-07-01',
    'clientes_detalle', c.data, 'lineas', d.data,
    'pendientes_vinculacion', jsonb_build_object('facturas', p.facturas, 'importe', p.importe)
  ) into v_resultado
  from resumen r cross join clientes c cross join detalle d cross join pendientes p;

  return v_resultado;
end;
$$;

create or replace function public.ventas_area_analisis(
  p_area text,
  p_desde date,
  p_hasta date,
  p_sucursal text default null,
  p_buscar text default null,
  p_filas text default 'cliente',
  p_columnas text default 'mes',
  p_medida text default 'usd'
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
  v_filas text := lower(trim(coalesce(p_filas, 'cliente')));
  v_columnas text := lower(trim(coalesce(p_columnas, 'mes')));
  v_medida text := lower(trim(coalesce(p_medida, 'usd')));
  v_seccion text;
  v_resultado jsonb;
begin
  if auth.uid() is null then raise exception 'Sesion requerida' using errcode = '42501'; end if;
  if v_area not in ('servicios', 'repuestos', 'maquinas') then raise exception 'Area invalida' using errcode = '22023'; end if;
  if v_filas not in ('cliente', 'sucursal', 'factura', 'os', 'repuesto', 'maquina') then raise exception 'Dimension de filas invalida' using errcode = '22023'; end if;
  if v_columnas not in ('none', 'mes', 'sucursal') then raise exception 'Dimension de columnas invalida' using errcode = '22023'; end if;
  if v_medida not in ('usd', 'facturas', 'cantidad') then raise exception 'Medida invalida' using errcode = '22023'; end if;

  v_seccion := case v_area when 'servicios' then 'servicios.ventas' when 'repuestos' then 'repuestos.ventas' else 'parque.ventas' end;
  if not public.has_section_access(auth.uid(), v_seccion) then raise exception 'No tenes acceso a esta seccion de Ventas' using errcode = '42501'; end if;

  with base as (
    select * from public.ventas_area_movimientos_base(p_desde, p_hasta, p_sucursal, p_buscar)
    where area_calculada = v_area
  ), dimensiones as (
    select *,
      case v_filas
        when 'cliente' then coalesce(cliente, 'Sin cliente')
        when 'sucursal' then coalesce(sucursal, 'Sin sucursal')
        when 'factura' then coalesce(factura, 'Sin factura')
        when 'os' then coalesce(os_numero, case when es_nota_credito then 'Nota de credito sin OS' else 'OS no disponible' end)
        when 'repuesto' then coalesce(codigo_fabricante, codigo, nullif(descripcion, 'Repuestos'), case when metodologia = 'historico' then 'Detalle no disponible en historico' else 'Repuesto sin identificar' end)
        else coalesce(modelo, descripcion, 'Modelo no informado') || case when chasis is not null then ' · ' || chasis else '' end
      end as fila,
      case v_columnas
        when 'mes' then to_char(fecha, 'YYYY-MM')
        when 'sucursal' then coalesce(sucursal, 'Sin sucursal')
        else '__total__'
      end as columna
    from base
  ), celdas as (
    select fila, columna,
      case v_medida
        when 'usd' then sum(total_venta)::numeric
        when 'cantidad' then sum(cantidad)::numeric
        else count(distinct coalesce(factura, linea_id))::numeric
      end as valor
    from dimensiones group by fila, columna
  ), totales as (
    select fila,
      case v_medida
        when 'usd' then sum(total_venta)::numeric
        when 'cantidad' then sum(cantidad)::numeric
        else count(distinct coalesce(factura, linea_id))::numeric
      end as total
    from dimensiones group by fila
  ), columnas as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'key', columna,
      'label', case when columna = '__total__' then 'Total' when v_columnas = 'mes' then substr(columna, 6, 2) || '/' || substr(columna, 1, 4) else columna end
    ) order by columna), '[]'::jsonb) as data
    from (select distinct columna from celdas) x
  ), filas as (
    select coalesce(jsonb_agg(jsonb_build_object('key', q.fila, 'values', q.valores, 'total', q.total) order by q.total desc), '[]'::jsonb) as data
    from (
      select t.fila, t.total, jsonb_object_agg(c.columna, c.valor) as valores
      from totales t join celdas c using (fila)
      group by t.fila, t.total order by t.total desc limit 500
    ) q
  )
  select jsonb_build_object('columns', c.data, 'rows', f.data)
  into v_resultado from columnas c cross join filas f;

  return v_resultado;
end;
$$;

revoke all on function public.ventas_area_resumen(text, date, date, text, text, integer) from public, anon;
grant execute on function public.ventas_area_resumen(text, date, date, text, text, integer) to authenticated;
revoke all on function public.ventas_area_analisis(text, date, date, text, text, text, text, text) from public, anon;
grant execute on function public.ventas_area_analisis(text, date, date, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
