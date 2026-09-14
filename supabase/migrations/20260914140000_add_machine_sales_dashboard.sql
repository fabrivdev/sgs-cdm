-- Ventas de Maquinas: una fuente unica para panorama, clientes, maquinas y detalle.
--
-- Grano: una linea facturada de maquinaria. La unidad conserva el signo del
-- documento (venta positiva / nota de credito negativa). Las dimensiones se
-- resuelven por chasis en Parque, luego por NP, catalogo y finalmente por el
-- texto de la factura. Una NP solo se vincula por factura+chasis exactos o,
-- como respaldo auditable, por chasis exacto; nunca por nombre/modelo.

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

  with movimientos as materialized (
    select *
    from public.ventas_area_movimientos_base(p_desde, p_hasta, p_sucursal, null)
    where area_calculada = 'maquinas'
  ), parseados as (
    select
      b.*,
      nullif(public.parque_normalizar_clave(b.factura), '') as factura_clave,
      public.normalizar_chasis_notificacion(b.chasis) as chasis_clave,
      nullif(btrim(substring(coalesce(b.descripcion, '') from
        '(?i)MARCA[[:space:]]*:[[:space:]]*([^|;]+?)(?:[[:space:]]+-[[:space:]]+MODELO[[:space:]]*:|$)')), '') as marca_texto,
      nullif(btrim(substring(coalesce(b.descripcion, '') from
        '(?i)TIPO[[:space:]]*:[[:space:]]*([^|;]+?)(?:[[:space:]]+-[[:space:]]+MARCA[[:space:]]*:|$)')), '') as tipo_texto
    from movimientos b
  ), vinculados as (
    select
      p.*,
      parque.id as parque_id,
      parque.marca_nombre as parque_marca_nombre,
      parque.marca::text as parque_marca,
      parque.subgrupo::text as parque_subgrupo,
      parque.subgrupo_personalizado,
      parque.modelo_tipo as parque_modelo,
      parque.modelo_catalogo_id,
      propietario.nombre as propietario,
      np.operacion_id,
      np.np_numero,
      np.np_fecha,
      np.cliente_nombre as np_cliente,
      np.comercial,
      np.marca as np_marca,
      np.producto as np_tipo,
      np.modelo as np_modelo,
      np.condicion,
      case
        when np.operacion_id is null then null
        when p.factura_clave is not null
          and public.parque_normalizar_clave(np.factura_venta) = p.factura_clave
          and p.chasis_clave is not null
          and public.normalizar_chasis_notificacion(np.chasis) = p.chasis_clave
          then 'FACTURA_Y_CHASIS'
        else 'CHASIS'
      end as vinculo_np
    from parseados p
    left join lateral (
      select pm.*
      from public.parque_maquinas pm
      where p.chasis_clave is not null
        and public.normalizar_chasis_notificacion(pm.serie) = p.chasis_clave
      order by pm.activo desc, pm.actualizado_en desc
      limit 1
    ) parque on true
    left join public.clientes propietario on propietario.id = parque.cliente_id
    left join lateral (
      select pedido.*
      from public.maquinaria_pedidos_lineas_estado_actual pedido
      where p.chasis_clave is not null
        and public.normalizar_chasis_notificacion(pedido.chasis) = p.chasis_clave
      order by
        case when p.factura_clave is not null
          and public.parque_normalizar_clave(pedido.factura_venta) = p.factura_clave then 0 else 1 end,
        pedido.np_fecha desc nulls last,
        pedido.actualizado_en desc
      limit 1
    ) np on true
  ), previos as (
    select
      v.*,
      public.maquinaria_normalizar_marca(coalesce(
        nullif(v.parque_marca_nombre, ''), nullif(v.parque_marca, ''),
        nullif(v.np_marca, ''), nullif(v.marca_texto, ''), nullif(v.marca, '')
      )) as marca_previa,
      coalesce(nullif(v.parque_modelo, ''), nullif(v.np_modelo, ''), nullif(v.modelo, '')) as modelo_previo
    from vinculados v
  ), catalogados as (
    select
      p.*,
      catalogo.nombre as catalogo_modelo,
      catalogo.subgrupo::text as catalogo_subgrupo
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
  ), normalizados as (
    select
      c.linea_id as id,
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
      coalesce(nullif(c.marca_previa, ''), 'Sin marca') as marca,
      coalesce(
        nullif(case when c.parque_subgrupo = 'OTRO' then c.subgrupo_personalizado else c.parque_subgrupo end, ''),
        nullif(c.np_tipo, ''), nullif(c.catalogo_subgrupo, ''), nullif(upper(c.tipo_texto), ''), 'Sin tipo'
      ) as tipo_maquina,
      coalesce(nullif(c.catalogo_modelo, ''), nullif(c.parque_modelo, ''), nullif(c.np_modelo, ''), nullif(c.modelo, ''), 'Modelo no informado') as modelo,
      nullif(c.chasis, '') as chasis,
      coalesce(nullif(c.propietario, ''), 'No informado') as propietario,
      c.operacion_id,
      c.np_numero,
      c.np_fecha,
      c.np_cliente,
      c.comercial,
      c.condicion,
      c.vinculo_np,
      c.metodologia
    from catalogados c
  ), dimensiones as (
    select * from normalizados n
    where p_buscar is null or btrim(p_buscar) = '' or concat_ws(' ',
      n.factura, n.cliente_facturado, n.sucursal, n.marca, n.tipo_maquina,
      n.modelo, n.chasis, n.propietario, n.np_numero, n.np_cliente, n.comercial
    ) ilike '%' || btrim(p_buscar) || '%'
  ), filtrados as materialized (
    select * from dimensiones n
    where (p_marca is null or btrim(p_marca) = '' or upper(n.marca) = upper(btrim(p_marca)))
      and (p_tipo_maquina is null or btrim(p_tipo_maquina) = '' or upper(n.tipo_maquina) = upper(btrim(p_tipo_maquina)))
  ), periodos_base as (
    select
      case v_agrupacion
        when 'dia' then fecha
        when 'semana' then date_trunc('week', fecha)::date
        when 'anio' then date_trunc('year', fecha)::date
        else date_trunc('month', fecha)::date
      end as periodo,
      sum(facturado)::numeric as total,
      sum(case when unidades > 0 then unidades else 0 end)::numeric as vendidas,
      abs(sum(case when unidades < 0 then unidades else 0 end))::numeric as notas_credito,
      sum(unidades)::numeric as netas,
      count(distinct factura)::integer as facturas,
      count(distinct cliente_facturado)::integer as clientes,
      count(*) filter (where operacion_id is not null)::integer as con_np,
      count(*) filter (where operacion_id is null)::integer as sin_np
    from filtrados
    group by 1
  ), maquinas_base as (
    select marca, tipo_maquina,
      sum(case when unidades > 0 then unidades else 0 end)::numeric as vendidas,
      abs(sum(case when unidades < 0 then unidades else 0 end))::numeric as notas_credito,
      sum(unidades)::numeric as netas,
      count(distinct cliente_facturado)::integer as clientes,
      count(distinct factura)::integer as facturas,
      sum(facturado)::numeric as total
    from filtrados group by marca, tipo_maquina
  ), modelos_base as (
    select marca, tipo_maquina, modelo,
      sum(case when unidades > 0 then unidades else 0 end)::numeric as vendidas,
      abs(sum(case when unidades < 0 then unidades else 0 end))::numeric as notas_credito,
      sum(unidades)::numeric as netas,
      count(distinct cliente_facturado)::integer as clientes,
      count(distinct factura)::integer as facturas,
      sum(facturado)::numeric as total
    from filtrados group by marca, tipo_maquina, modelo
  )
  select jsonb_build_object(
    'resumen', jsonb_build_object(
      'total', coalesce((select sum(facturado) from filtrados), 0),
      'facturas', (select count(distinct factura) from filtrados),
      'clientes', (select count(distinct cliente_facturado) from filtrados),
      'vendidas', coalesce((select sum(case when unidades > 0 then unidades else 0 end) from filtrados), 0),
      'notas_credito', coalesce((select abs(sum(case when unidades < 0 then unidades else 0 end)) from filtrados), 0),
      'netas', coalesce((select sum(unidades) from filtrados), 0),
      'promedio_unidad', coalesce((select sum(facturado) / nullif(sum(unidades), 0) from filtrados), 0),
      'con_np', (select count(*) from filtrados where operacion_id is not null),
      'sin_np', (select count(*) from filtrados where operacion_id is null)
    ),
    'periodos', coalesce((select jsonb_agg(to_jsonb(p) order by p.periodo) from periodos_base p), '[]'::jsonb),
    'por_maquina', coalesce((select jsonb_agg(to_jsonb(m) order by m.total desc, m.marca, m.tipo_maquina) from maquinas_base m), '[]'::jsonb),
    'por_modelo', coalesce((select jsonb_agg(to_jsonb(m) order by m.total desc, m.marca, m.tipo_maquina, m.modelo) from modelos_base m), '[]'::jsonb),
    'lineas', coalesce((select jsonb_agg(to_jsonb(l) order by l.fecha desc, l.factura, l.id) from filtrados l), '[]'::jsonb),
    'dimensiones', jsonb_build_object(
      'marcas', coalesce((select jsonb_agg(x.marca order by x.marca) from (select distinct marca from dimensiones) x), '[]'::jsonb),
      'tipos', coalesce((select jsonb_agg(x.tipo_maquina order by x.tipo_maquina) from (select distinct tipo_maquina from dimensiones) x), '[]'::jsonb)
    )
  ) into v_resultado;

  return v_resultado;
end;
$$;

revoke all on function public.ventas_maquinas_dashboard_v1(date, date, text, text, text, text, text)
  from public, anon;
grant execute on function public.ventas_maquinas_dashboard_v1(date, date, text, text, text, text, text)
  to authenticated;

notify pgrst, 'reload schema';
