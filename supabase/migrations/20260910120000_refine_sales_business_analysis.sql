-- Hace que el explorador de ventas use dimensiones utiles para cada area.
-- El detalle y el analisis se paginan en el servidor para no ocultar registros.

create or replace function public.ventas_area_documentos(
  p_area text,
  p_desde date,
  p_hasta date,
  p_sucursal text default null,
  p_buscar text default null,
  p_pagina integer default 1,
  p_por_pagina integer default 50
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
  v_pagina integer := greatest(coalesce(p_pagina, 1), 1);
  v_por_pagina integer := least(greatest(coalesce(p_por_pagina, 50), 10), 100);
  v_resultado jsonb;
begin
  if auth.uid() is null then raise exception 'Sesion requerida' using errcode = '42501'; end if;
  if v_area not in ('servicios', 'repuestos', 'maquinas') then raise exception 'Area invalida' using errcode = '22023'; end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then raise exception 'Rango invalido' using errcode = '22023'; end if;

  v_seccion := case v_area when 'servicios' then 'servicios.ventas' when 'repuestos' then 'repuestos.ventas' else 'parque.ventas' end;
  if not public.has_section_access(auth.uid(), v_seccion) then raise exception 'No tenes acceso a esta seccion de Ventas' using errcode = '42501'; end if;

  with base as (
    select *
    from public.ventas_area_movimientos_base(p_desde, p_hasta, p_sucursal, p_buscar)
    where area_calculada = v_area
  ), documentos as (
    select
      min(linea_id) as id,
      fecha,
      coalesce(factura, 'Sin numero') as factura,
      coalesce(cliente, 'Sin cliente') as cliente,
      sucursal,
      metodologia,
      sum(total_venta)::numeric as total_venta,
      count(*)::integer as cantidad_lineas,
      jsonb_agg(jsonb_build_object(
        'id', linea_id,
        'concepto', concepto,
        'total_venta', total_venta,
        'cantidad', cantidad,
        'os_numero', os_numero,
        'codigo', codigo,
        'codigo_fabricante', codigo_fabricante,
        'descripcion', descripcion,
        'marca', marca,
        'modelo', modelo,
        'chasis', chasis,
        'es_nota_credito', es_nota_credito,
        'metodologia', metodologia,
        'fecha', fecha,
        'factura', coalesce(factura, 'Sin numero'),
        'cliente', coalesce(cliente, 'Sin cliente'),
        'sucursal', sucursal
      ) order by concepto, descripcion) as lineas
    from base
    group by fecha, coalesce(factura, 'Sin numero'), coalesce(cliente, 'Sin cliente'), sucursal, metodologia
  ), total as (
    select count(*)::integer as registros from documentos
  ), pagina as (
    select * from documentos
    order by fecha desc, factura desc, cliente
    limit v_por_pagina offset (v_pagina - 1) * v_por_pagina
  ), datos as (
    select coalesce(jsonb_agg(to_jsonb(p) order by p.fecha desc, p.factura desc, p.cliente), '[]'::jsonb) as items
    from pagina p
  )
  select jsonb_build_object(
    'total', t.registros,
    'pagina', v_pagina,
    'por_pagina', v_por_pagina,
    'paginas', greatest(ceil(t.registros::numeric / v_por_pagina)::integer, 1),
    'documentos', d.items
  ) into v_resultado
  from total t cross join datos d;

  return v_resultado;
end;
$$;

create or replace function public.ventas_area_analisis_negocio(
  p_area text,
  p_desde date,
  p_hasta date,
  p_sucursal text default null,
  p_buscar text default null,
  p_filas text default 'concepto',
  p_columnas text default 'mes',
  p_medida text default 'usd',
  p_pagina integer default 1,
  p_por_pagina integer default 50
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
  v_filas text := lower(trim(coalesce(p_filas, 'concepto')));
  v_columnas text := lower(trim(coalesce(p_columnas, 'mes')));
  v_medida text := lower(trim(coalesce(p_medida, 'usd')));
  v_seccion text;
  v_pagina integer := greatest(coalesce(p_pagina, 1), 1);
  v_por_pagina integer := least(greatest(coalesce(p_por_pagina, 50), 10), 100);
  v_resultado jsonb;
begin
  if auth.uid() is null then raise exception 'Sesion requerida' using errcode = '42501'; end if;
  if v_area not in ('servicios', 'repuestos', 'maquinas') then raise exception 'Area invalida' using errcode = '22023'; end if;
  if v_filas not in ('concepto', 'cliente', 'sucursal', 'repuesto', 'subgrupo', 'modelo') then raise exception 'Dimension de filas invalida' using errcode = '22023'; end if;
  if v_columnas not in ('none', 'mes', 'sucursal') then raise exception 'Dimension de columnas invalida' using errcode = '22023'; end if;
  if v_medida not in ('usd', 'facturas', 'cantidad') then raise exception 'Medida invalida' using errcode = '22023'; end if;

  v_seccion := case v_area when 'servicios' then 'servicios.ventas' when 'repuestos' then 'repuestos.ventas' else 'parque.ventas' end;
  if not public.has_section_access(auth.uid(), v_seccion) then raise exception 'No tenes acceso a esta seccion de Ventas' using errcode = '42501'; end if;

  with base as (
    select *
    from public.ventas_area_movimientos_base(p_desde, p_hasta, p_sucursal, p_buscar)
    where area_calculada = v_area
  ), normalizados as (
    select
      b.*,
      catalogo.nombre as modelo_normalizado,
      catalogo.subgrupo as subgrupo_normalizado
    from base b
    left join lateral (
      select candidato.nombre, candidato.subgrupo
      from (
        select coalesce(c.nombre, p.modelo_tipo, b.modelo) as nombre, p.subgrupo::text as subgrupo, 1 as prioridad
        from public.parque_maquinas p
        left join public.parque_modelos_catalogo c on c.id = p.modelo_catalogo_id
        where b.area_calculada = 'maquinas'
          and nullif(trim(b.chasis), '') is not null
          and upper(trim(p.serie)) = upper(trim(b.chasis))

        union all

        select c.nombre, c.subgrupo::text, 2 + case when c.clave_normalizada = public.parque_modelo_clave(b.modelo) then 0 else 1 end
        from public.parque_modelos_catalogo c
        left join public.parque_modelos_alias a on a.modelo_catalogo_id = c.id
        where b.area_calculada = 'maquinas'
          and c.activo
          and c.marca_nombre = public.maquinaria_normalizar_marca(coalesce(b.marca, 'OTROS'))
          and (
            c.clave_normalizada = public.parque_modelo_clave(b.modelo)
            or a.clave_alias = public.parque_modelo_clave(b.modelo)
          )
      ) candidato
      order by candidato.prioridad, candidato.nombre
      limit 1
    ) catalogo on true
  ), dimensiones as (
    select
      n.*,
      case v_filas
        when 'concepto' then case n.concepto when 'Servicio' then 'Mano de obra' else n.concepto end
        when 'cliente' then coalesce(n.cliente, 'Sin cliente')
        when 'sucursal' then coalesce(n.sucursal, 'Sin sucursal')
        when 'repuesto' then case
          when coalesce(n.codigo_fabricante, n.codigo) is not null
            and nullif(n.descripcion, 'Repuestos') is not null
            then coalesce(n.codigo_fabricante, n.codigo) || ' · ' || n.descripcion
          else coalesce(n.codigo_fabricante, n.codigo, nullif(n.descripcion, 'Repuestos'),
            case when n.metodologia = 'historico' then 'Detalle no disponible en historico' else 'Repuesto sin identificar' end)
        end
        when 'subgrupo' then coalesce(n.subgrupo_normalizado, 'Sin tipo normalizado')
        when 'modelo' then coalesce(n.modelo_normalizado, n.modelo, 'Modelo no informado')
      end as fila,
      case v_columnas
        when 'mes' then to_char(n.fecha, 'YYYY-MM')
        when 'sucursal' then coalesce(n.sucursal, 'Sin sucursal')
        else '__total__'
      end as columna
    from normalizados n
  ), celdas as (
    select fila, columna,
      case v_medida
        when 'usd' then sum(total_venta)::numeric
        when 'cantidad' then sum(cantidad)::numeric
        else count(distinct coalesce(factura, linea_id))::numeric
      end as valor
    from dimensiones
    where fila is not null
    group by fila, columna
  ), totales as (
    select fila,
      case v_medida
        when 'usd' then sum(total_venta)::numeric
        when 'cantidad' then sum(cantidad)::numeric
        else count(distinct coalesce(factura, linea_id))::numeric
      end as total
    from dimensiones
    where fila is not null
    group by fila
  ), ordenadas as (
    select t.*, row_number() over (order by t.total desc, t.fila)::integer as posicion
    from totales t
  ), pagina as (
    select * from ordenadas
    where posicion > (v_pagina - 1) * v_por_pagina
      and posicion <= v_pagina * v_por_pagina
  ), columnas as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'key', columna,
      'label', case when columna = '__total__' then 'Total' when v_columnas = 'mes' then substr(columna, 6, 2) || '/' || substr(columna, 1, 4) else columna end
    ) order by columna), '[]'::jsonb) as data
    from (select distinct columna from celdas where v_columnas <> 'none') x
  ), filas as (
    select coalesce(jsonb_agg(jsonb_build_object('key', p.fila, 'values', q.valores, 'total', p.total) order by p.posicion), '[]'::jsonb) as data
    from pagina p
    join lateral (
      select jsonb_object_agg(c.columna, c.valor) as valores
      from celdas c where c.fila = p.fila
    ) q on true
  ), total_filas as (
    select count(*)::integer as registros from totales
  )
  select jsonb_build_object(
    'columns', c.data,
    'rows', f.data,
    'total', t.registros,
    'pagina', v_pagina,
    'por_pagina', v_por_pagina,
    'paginas', greatest(ceil(t.registros::numeric / v_por_pagina)::integer, 1)
  ) into v_resultado
  from columnas c cross join filas f cross join total_filas t;

  return v_resultado;
end;
$$;

revoke all on function public.ventas_area_documentos(text, date, date, text, text, integer, integer) from public, anon;
grant execute on function public.ventas_area_documentos(text, date, date, text, text, integer, integer) to authenticated;
revoke all on function public.ventas_area_analisis_negocio(text, date, date, text, text, text, text, text, integer, integer) from public, anon;
grant execute on function public.ventas_area_analisis_negocio(text, date, date, text, text, text, text, text, integer, integer) to authenticated;

notify pgrst, 'reload schema';
