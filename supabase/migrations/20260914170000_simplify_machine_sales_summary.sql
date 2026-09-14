-- Simplifica Ventas de Maquinas y fija las dimensiones comerciales comunes.
-- La nota de pedido puede aportar metadatos de la venta actual, pero no se
-- devuelve ni se presenta como parte de este reporte.

-- Conserva el vendedor del historico y recupera el vendedor que el sistema
-- actual guarda en la fila original importada. La operacion/parque se usa
-- despues solamente como respaldo cuando la factura no lo informa.
alter table public.facturacion_lineas_importadas
  add column if not exists vendedor text;

-- No se hace un UPDATE masivo para completar cargas anteriores: esta tabla
-- tiene varios triggers operativos y reescribirla completa puede agotar el
-- tiempo de ejecucion. La fuente consulta raw_data como respaldo, sin mutarlo.

create or replace function public.ventas_maquinas_fuente_v2(
  p_desde date,
  p_hasta date,
  p_sucursal text default null
)
returns table (
  linea_id text, fecha date, factura text, cliente text, sucursal public.sucursal,
  total_venta numeric, es_nota_credito boolean, cantidad numeric, marca text,
  tipo_maquina text, modelo text, chasis text, descripcion text, metodologia text,
  vendedor text, codigo_pedido text, pedido_fecha date, condicion_fuente text,
  cod_mercaderia text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select h.id::text, h.fecha_factura, h.factura, h.entidad_nombre, h.sucursal,
    h.total_venta, h.tipo_movimiento = 'E' or h.total_venta < 0, h.cantidad,
    h.marca_estimada::text, h.tipo_maquina_estimado, h.modelo_estimado, h.chasis,
    h.nombre_mercaderia, 'historico', h.vendedor, h.codigo_pedido, h.fecha_pedido,
    case when upper(h.grupo) like '%USADA%' then 'USADA' else 'NUEVA' end,
    h.cod_mercaderia
  from public.ventas_maquinas_historico_lineas h
  join public.ventas_maquinas_historico_cargas c
    on c.id = h.carga_id and c.activo and c.estado = 'COMPLETADO'
  where h.fecha_factura between p_desde and least(p_hasta, date '2026-06-30')
    and (p_sucursal is null or btrim(p_sucursal) = '' or h.sucursal::text = btrim(p_sucursal))

  union all

  select b.linea_id, b.fecha, b.factura, b.cliente, b.sucursal::public.sucursal,
    b.total_venta, b.es_nota_credito, b.cantidad, b.marca, null::text, b.modelo,
    b.chasis, b.descripcion, 'actual',
    coalesce(
      nullif(btrim(f.vendedor), ''),
      nullif(btrim(public.valor_json_insensible(
        coalesce(f.raw_data, '{}'::jsonb),
        array['VENDEDOR', 'NOMVEN', 'NOMBRE VENDEDOR', 'NOMVEND', 'VEND']
      )), '')
    ),
    null::text, null::date, null::text, b.codigo
  from public.ventas_area_movimientos_base(
    greatest(p_desde, date '2026-07-01'),
    greatest(p_hasta, date '2026-07-01'),
    p_sucursal,
    null
  ) b
  left join public.facturacion_lineas_importadas f on f.id::text = b.linea_id
  where p_hasta >= date '2026-07-01'
    and b.area_calculada = 'maquinas'
    and b.metodologia = 'actual';
$$;

revoke all on function public.ventas_maquinas_fuente_v2(date, date, text) from public, anon, authenticated;

create or replace function public.ventas_maquinas_dashboard_v1(
  p_desde date,
  p_hasta date,
  p_sucursal text default null,
  p_buscar text default null,
  p_marca text default null,
  p_tipo_maquina text default null,
  p_agrupacion text default 'mes'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
set statement_timeout = '20s'
as $$
declare
  v_agrupacion text := lower(btrim(coalesce(p_agrupacion, 'mes')));
  v_dias integer;
  v_previo_desde date;
  v_previo_hasta date;
  v_resultado jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sesion requerida' using errcode = '42501';
  end if;
  if not public.has_section_access(auth.uid(), 'parque.ventas') then
    raise exception 'No tenes acceso a Ventas de Maquinas' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'Rango de fechas invalido' using errcode = '22023';
  end if;
  if v_agrupacion not in ('dia', 'semana', 'mes', 'anio') then
    raise exception 'Agrupacion invalida' using errcode = '22023';
  end if;

  v_dias := p_hasta - p_desde + 1;
  v_previo_hasta := p_desde - 1;
  v_previo_desde := v_previo_hasta - v_dias + 1;

  with movimientos as materialized (
    select *
    from public.ventas_maquinas_fuente_v2(v_previo_desde, p_hasta, p_sucursal)
  ), parseados as (
    select b.*,
      nullif(public.parque_normalizar_clave(b.factura), '') as factura_clave,
      public.normalizar_chasis_notificacion(b.chasis) as chasis_clave,
      nullif(btrim(substring(coalesce(b.descripcion, '') from '(?i)MARCA[[:space:]]*:[[:space:]]*([^|;]+?)(?:[[:space:]]+-[[:space:]]+MODELO[[:space:]]*:|$)')), '') as marca_texto,
      nullif(btrim(substring(coalesce(b.descripcion, '') from '(?i)TIPO[[:space:]]*:[[:space:]]*([^|;]+?)(?:[[:space:]]+-[[:space:]]+MARCA[[:space:]]*:|$)')), '') as tipo_texto
    from movimientos b
  ), vinculados as (
    select p.*,
      parque.marca_nombre as parque_marca_nombre,
      parque.marca::text as parque_marca,
      parque.subgrupo::text as parque_subgrupo,
      parque.subgrupo_personalizado,
      parque.modelo_tipo as parque_modelo,
      parque.modelo_catalogo_id,
      parque.vendedor as parque_vendedor,
      operacion.comercial,
      operacion.marca as operacion_marca,
      operacion.producto as operacion_tipo,
      operacion.modelo as operacion_modelo,
      operacion.condicion as operacion_condicion
    from parseados p
    left join lateral (
      select pm.*
      from public.parque_maquinas pm
      where p.chasis_clave is not null
        and public.normalizar_chasis_notificacion(pm.serie) = p.chasis_clave
      order by pm.activo desc, pm.actualizado_en desc
      limit 1
    ) parque on true
    left join lateral (
      select pedido.*
      from public.maquinaria_pedidos_lineas_estado_actual pedido
      where p.metodologia = 'actual'
        and p.chasis_clave is not null
        and public.normalizar_chasis_notificacion(pedido.chasis) = p.chasis_clave
      order by
        case
          when p.factura_clave is not null
            and public.parque_normalizar_clave(pedido.factura_venta) = p.factura_clave
          then 0 else 1
        end,
        pedido.np_fecha desc nulls last,
        pedido.actualizado_en desc
      limit 1
    ) operacion on true
  ), previos as (
    select v.*,
      public.maquinaria_normalizar_marca(coalesce(
        nullif(v.parque_marca_nombre, ''), nullif(v.parque_marca, ''),
        nullif(v.operacion_marca, ''), nullif(v.marca_texto, ''), nullif(v.marca, '')
      )) as marca_previa,
      coalesce(nullif(v.parque_modelo, ''), nullif(v.operacion_modelo, ''), nullif(v.modelo, '')) as modelo_previo
    from vinculados v
  ), catalogados as (
    select p.*, catalogo.nombre as catalogo_modelo, catalogo.subgrupo::text as catalogo_subgrupo
    from previos p
    left join lateral (
      select c.nombre, c.subgrupo
      from public.parque_modelos_catalogo c
      where c.activo
        and c.marca_nombre = p.marca_previa
        and (
          c.id = p.modelo_catalogo_id
          or c.clave_normalizada = public.parque_modelo_clave(p.modelo_previo)
          or exists (
            select 1 from public.parque_modelos_alias a
            where a.modelo_catalogo_id = c.id
              and a.clave_alias = public.parque_modelo_clave(p.modelo_previo)
          )
        )
      order by (c.id = p.modelo_catalogo_id) desc, c.nombre
      limit 1
    ) catalogo on true
  ), clasificables as (
    select c.*,
      coalesce(
        nullif(case when c.parque_subgrupo = 'OTRO' then c.subgrupo_personalizado else c.parque_subgrupo end, ''),
        nullif(c.operacion_tipo, ''), nullif(c.catalogo_subgrupo, ''),
        nullif(c.tipo_maquina, ''), nullif(c.tipo_texto, ''), 'Sin tipo'
      ) as tipo_previo,
      upper(concat_ws(' ', c.operacion_condicion, c.condicion_fuente, c.descripcion)) as texto_condicion
    from catalogados c
  ), normalizados as (
    select c.linea_id as id,
      c.fecha,
      coalesce(c.factura, 'Sin factura') as factura,
      coalesce(nullif(c.cliente, ''), 'Sin cliente facturado') as cliente_facturado,
      c.sucursal,
      c.total_venta::numeric as facturado,
      c.es_nota_credito,
      case
        when c.es_nota_credito or c.total_venta < 0
          then -greatest(abs(coalesce(nullif(c.cantidad, 0), 1)), 1)
        else greatest(abs(coalesce(nullif(c.cantidad, 0), 1)), 1)
      end::numeric as unidades,
      case when upper(coalesce(c.marca_previa, '')) in ('CLAAS', 'HORSCH')
        then upper(c.marca_previa) else 'OTROS' end as marca,
      case
        when upper(c.tipo_previo) similar to '%(PLANTADOR|SEMBRADOR)%' then 'SEMBRADORAS'
        when upper(c.tipo_previo) similar to '%(PLATAFORM|CABEZAL)%' then 'PLATAFORMAS/CABEZALES'
        when upper(c.tipo_previo) like '%COSECH%' then 'COSECHADORAS'
        when upper(c.tipo_previo) like '%PICADOR%' then 'PICADORAS'
        when upper(c.tipo_previo) like '%PULVER%' then 'PULVERIZADORAS'
        when upper(c.tipo_previo) like '%TRACTOR%' then 'TRACTORES'
        when upper(c.tipo_previo) similar to '%(SUELO|IMPLEMENT)%' then 'SUELO'
        else upper(btrim(c.tipo_previo))
      end as tipo_maquina,
      coalesce(nullif(c.catalogo_modelo, ''), nullif(c.parque_modelo, ''),
        nullif(c.operacion_modelo, ''), nullif(c.modelo, ''), 'Modelo no informado') as modelo,
      nullif(c.chasis, '') as chasis,
      coalesce(nullif(c.vendedor, ''), nullif(c.comercial, ''), nullif(c.parque_vendedor, '')) as comercial,
      case
        when c.texto_condicion like '%USAD%' then 'USADA'
        when c.texto_condicion like '%NUEV%' then 'NUEVA'
        else 'SIN IDENTIFICAR'
      end as condicion,
      c.metodologia,
      case when c.metodologia = 'historico' then 'Sistema anterior' else 'Sistema actual' end as origen,
      c.cod_mercaderia,
      c.descripcion
    from clasificables c
  ), buscados as (
    select *
    from normalizados n
    where p_buscar is null or btrim(p_buscar) = '' or concat_ws(' ',
      n.factura, n.cliente_facturado, n.sucursal, n.marca, n.tipo_maquina,
      n.modelo, n.chasis, n.comercial, n.condicion, n.cod_mercaderia, n.descripcion
    ) ilike '%' || btrim(p_buscar) || '%'
  ), filtrados as materialized (
    select *
    from buscados n
    where (p_marca is null or btrim(p_marca) = '' or upper(n.marca) = upper(btrim(p_marca)))
      and (p_tipo_maquina is null or btrim(p_tipo_maquina) = '' or upper(n.tipo_maquina) = upper(btrim(p_tipo_maquina)))
  ), actuales as materialized (
    select * from filtrados where fecha between p_desde and p_hasta
  ), anteriores as materialized (
    select * from filtrados where fecha between v_previo_desde and v_previo_hasta
  ), periodos_base as (
    select case v_agrupacion
        when 'dia' then fecha
        when 'semana' then date_trunc('week', fecha)::date
        when 'anio' then date_trunc('year', fecha)::date
        else date_trunc('month', fecha)::date
      end as periodo,
      sum(facturado)::numeric as total,
      sum(case when unidades > 0 then unidades else 0 end)::numeric as vendidas,
      sum(case when unidades > 0 and condicion = 'NUEVA' then unidades else 0 end)::numeric as nuevas,
      sum(case when unidades > 0 and condicion = 'USADA' then unidades else 0 end)::numeric as usadas,
      abs(sum(case when unidades < 0 then unidades else 0 end))::numeric as notas_credito,
      sum(unidades)::numeric as netas,
      count(distinct factura)::integer as facturas,
      count(distinct cliente_facturado)::integer as clientes
    from actuales
    group by 1
  ), maquinas_base as (
    select marca, tipo_maquina, condicion,
      sum(case when unidades > 0 then unidades else 0 end)::numeric as vendidas,
      abs(sum(case when unidades < 0 then unidades else 0 end))::numeric as notas_credito,
      sum(unidades)::numeric as netas,
      count(distinct cliente_facturado)::integer as clientes,
      count(distinct factura)::integer as facturas,
      sum(facturado)::numeric as total,
      coalesce(sum(facturado) / nullif(sum(unidades), 0), 0)::numeric as promedio_unidad
    from actuales
    group by marca, tipo_maquina, condicion
  ), modelos_base as (
    select marca, tipo_maquina, condicion, modelo,
      sum(case when unidades > 0 then unidades else 0 end)::numeric as vendidas,
      abs(sum(case when unidades < 0 then unidades else 0 end))::numeric as notas_credito,
      sum(unidades)::numeric as netas,
      count(distinct cliente_facturado)::integer as clientes,
      count(distinct factura)::integer as facturas,
      sum(facturado)::numeric as total,
      coalesce(sum(facturado) / nullif(sum(unidades), 0), 0)::numeric as promedio_unidad
    from actuales
    group by marca, tipo_maquina, condicion, modelo
  )
  select jsonb_build_object(
    'resumen', jsonb_build_object(
      'total', coalesce((select sum(facturado) from actuales), 0),
      'venta_bruta', coalesce((select sum(facturado) from actuales where facturado > 0), 0),
      'notas_credito_monto', coalesce((select abs(sum(facturado)) from actuales where facturado < 0), 0),
      'facturas', (select count(distinct factura) from actuales),
      'clientes', (select count(distinct cliente_facturado) from actuales),
      'vendidas', coalesce((select sum(case when unidades > 0 then unidades else 0 end) from actuales), 0),
      'nuevas', coalesce((select sum(case when unidades > 0 and condicion = 'NUEVA' then unidades else 0 end) from actuales), 0),
      'usadas', coalesce((select sum(case when unidades > 0 and condicion = 'USADA' then unidades else 0 end) from actuales), 0),
      'notas_credito', coalesce((select abs(sum(case when unidades < 0 then unidades else 0 end)) from actuales), 0),
      'netas', coalesce((select sum(unidades) from actuales), 0),
      'promedio_unidad', coalesce((select sum(facturado) / nullif(sum(unidades), 0) from actuales), 0)
    ),
    'comparacion', jsonb_build_object(
      'desde', v_previo_desde,
      'hasta', v_previo_hasta,
      'total', coalesce((select sum(facturado) from anteriores), 0),
      'netas', coalesce((select sum(unidades) from anteriores), 0),
      'vendidas', coalesce((select sum(case when unidades > 0 then unidades else 0 end) from anteriores), 0),
      'notas_credito_monto', coalesce((select abs(sum(facturado)) from anteriores where facturado < 0), 0)
    ),
    'periodos', coalesce((select jsonb_agg(to_jsonb(p) order by p.periodo) from periodos_base p), '[]'::jsonb),
    'por_maquina', coalesce((select jsonb_agg(to_jsonb(m) order by m.total desc, m.marca, m.tipo_maquina, m.condicion) from maquinas_base m), '[]'::jsonb),
    'por_modelo', coalesce((select jsonb_agg(to_jsonb(m) order by m.total desc, m.marca, m.tipo_maquina, m.condicion, m.modelo) from modelos_base m), '[]'::jsonb),
    'lineas', coalesce((select jsonb_agg(to_jsonb(l) order by l.fecha desc, l.factura, l.id) from actuales l), '[]'::jsonb),
    'dimensiones', jsonb_build_object(
      'marcas', coalesce((select jsonb_agg(x.marca order by x.marca) from (select distinct marca from buscados where fecha between p_desde and p_hasta) x), '[]'::jsonb),
      'tipos', coalesce((select jsonb_agg(x.tipo_maquina order by x.tipo_maquina) from (select distinct tipo_maquina from buscados where fecha between p_desde and p_hasta) x), '[]'::jsonb)
    )
  ) into v_resultado;

  return v_resultado;
end;
$$;

revoke all on function public.ventas_maquinas_dashboard_v1(date, date, text, text, text, text, text) from public, anon;
grant execute on function public.ventas_maquinas_dashboard_v1(date, date, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
