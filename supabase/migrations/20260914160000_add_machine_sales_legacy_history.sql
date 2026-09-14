-- Ventas de maquinas del sistema anterior.
-- Carga unica, auditable e idempotente del archivo "Analisis de Ventas Detallado".
-- El historico participa hasta 30/06/2026; el sistema actual desde 01/07/2026.

create table if not exists public.ventas_maquinas_historico_cargas (
  id uuid primary key default gen_random_uuid(),
  archivo_nombre text not null,
  estado text not null default 'PROCESANDO' check (estado in ('PROCESANDO', 'COMPLETADO', 'FALLIDO')),
  filas_archivo integer not null check (filas_archivo >= 0),
  activo boolean not null default false,
  creado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now(),
  completado_en timestamptz
);

create unique index if not exists ventas_maquinas_historico_carga_activa_idx
  on public.ventas_maquinas_historico_cargas (activo) where activo;

create table if not exists public.ventas_maquinas_historico_lineas (
  id uuid primary key default gen_random_uuid(),
  carga_id uuid not null references public.ventas_maquinas_historico_cargas(id) on delete restrict,
  linea_clave text not null unique,
  fecha_factura date not null check (fecha_factura <= date '2026-06-30'),
  sucursal public.sucursal not null,
  vendedor text,
  cod_mercaderia text not null,
  nombre_mercaderia text not null,
  tipo_movimiento text not null check (tipo_movimiento in ('S', 'E')),
  cod_entidad text,
  entidad_nombre text not null,
  grupo text not null,
  plan_financiacion text,
  factura text not null,
  cantidad numeric not null,
  total_venta numeric not null,
  valor_medio numeric not null default 0,
  total_cobrado numeric not null default 0,
  saldo numeric not null default 0,
  fecha_vencimiento date,
  margen_venta_pct numeric not null default 0,
  margen_costo_pct numeric not null default 0,
  lucro_bruto numeric not null default 0,
  costo_medio numeric not null default 0,
  costo_total numeric not null default 0,
  fecha_pedido date,
  codigo_pedido text,
  precio_tabla numeric not null default 0,
  chasis text,
  marca_estimada public.marca not null default 'OTROS',
  tipo_maquina_estimado text not null default 'OTRO',
  modelo_estimado text not null default 'Modelo no informado',
  raw_data jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now()
);

create index if not exists ventas_maquinas_historico_fecha_idx
  on public.ventas_maquinas_historico_lineas (fecha_factura);
create index if not exists ventas_maquinas_historico_chasis_idx
  on public.ventas_maquinas_historico_lineas (chasis) where chasis is not null;
create index if not exists ventas_maquinas_historico_carga_idx
  on public.ventas_maquinas_historico_lineas (carga_id);

alter table public.ventas_maquinas_historico_cargas enable row level security;
alter table public.ventas_maquinas_historico_lineas enable row level security;

drop policy if exists ventas_maquinas_historico_cargas_select on public.ventas_maquinas_historico_cargas;
create policy ventas_maquinas_historico_cargas_select on public.ventas_maquinas_historico_cargas
  for select to authenticated using (public.has_section_access(auth.uid(), 'parque.ventas'));
drop policy if exists ventas_maquinas_historico_lineas_select on public.ventas_maquinas_historico_lineas;
create policy ventas_maquinas_historico_lineas_select on public.ventas_maquinas_historico_lineas
  for select to authenticated using (public.has_section_access(auth.uid(), 'parque.ventas'));

grant select on public.ventas_maquinas_historico_cargas to authenticated;
grant select on public.ventas_maquinas_historico_lineas to authenticated;

create or replace function public.ventas_maquinas_estado_historico_v1()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select jsonb_build_object(
      'cargado', c.estado = 'COMPLETADO' and c.activo,
      'en_proceso', c.estado = 'PROCESANDO',
      'carga_id', c.id,
      'archivo_nombre', c.archivo_nombre,
      'filas_archivo', c.filas_archivo,
      'fecha_desde', (select min(l.fecha_factura) from public.ventas_maquinas_historico_lineas l where l.carga_id = c.id),
      'fecha_hasta', (select max(l.fecha_factura) from public.ventas_maquinas_historico_lineas l where l.carga_id = c.id),
      'facturacion_neta', coalesce((select sum(l.total_venta) from public.ventas_maquinas_historico_lineas l where l.carga_id = c.id), 0),
      'completado_en', c.completado_en
    )
    from public.ventas_maquinas_historico_cargas c
    where c.activo or c.estado = 'PROCESANDO'
    order by c.activo desc, c.creado_en desc
    limit 1
  ), jsonb_build_object('cargado', false, 'en_proceso', false));
$$;

create or replace function public.ventas_maquinas_iniciar_historico_v1(
  p_archivo_nombre text,
  p_filas_archivo integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if auth.uid() is not null
    and not public.has_role(auth.uid(), 'admin'::public.app_role)
    and not public.has_role(auth.uid(), 'superadmin'::public.app_role) then
    raise exception 'Solo un administrador puede cargar el historico de ventas de maquinas' using errcode = '42501';
  end if;
  if exists (select 1 from public.ventas_maquinas_historico_cargas where activo and estado = 'COMPLETADO') then
    raise exception 'El historico de ventas de maquinas ya fue cargado. Esta operacion se realiza una sola vez.';
  end if;
  update public.ventas_maquinas_historico_cargas set estado = 'FALLIDO' where estado = 'PROCESANDO';
  insert into public.ventas_maquinas_historico_cargas(archivo_nombre, filas_archivo, creado_por)
  values (coalesce(nullif(btrim(p_archivo_nombre), ''), 'Analisis de Ventas Detallado.xls'), greatest(coalesce(p_filas_archivo, 0), 0), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.ventas_maquinas_importar_historico_lote_v1(
  p_carga_id uuid,
  p_lineas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_recibidas integer := jsonb_array_length(coalesce(p_lineas, '[]'::jsonb));
begin
  if auth.uid() is not null
    and not public.has_role(auth.uid(), 'admin'::public.app_role)
    and not public.has_role(auth.uid(), 'superadmin'::public.app_role) then
    raise exception 'Solo un administrador puede cargar el historico de ventas de maquinas' using errcode = '42501';
  end if;
  if not exists (select 1 from public.ventas_maquinas_historico_cargas where id = p_carga_id and estado = 'PROCESANDO') then
    raise exception 'La carga no existe o ya fue cerrada';
  end if;
  if v_recibidas = 0 or v_recibidas > 500 then raise exception 'El lote debe contener entre 1 y 500 lineas'; end if;

  insert into public.ventas_maquinas_historico_lineas(
    carga_id, linea_clave, fecha_factura, sucursal, vendedor, cod_mercaderia,
    nombre_mercaderia, tipo_movimiento, cod_entidad, entidad_nombre, grupo,
    plan_financiacion, factura, cantidad, total_venta, valor_medio, total_cobrado,
    saldo, fecha_vencimiento, margen_venta_pct, margen_costo_pct, lucro_bruto,
    costo_medio, costo_total, fecha_pedido, codigo_pedido, precio_tabla, chasis,
    marca_estimada, tipo_maquina_estimado, modelo_estimado, raw_data
  )
  select
    p_carga_id, nullif(btrim(x.linea_clave), ''), x.fecha_factura, x.sucursal,
    nullif(btrim(x.vendedor), ''), nullif(btrim(x.cod_mercaderia), ''),
    nullif(btrim(x.nombre_mercaderia), ''), upper(btrim(x.tipo_movimiento)),
    nullif(btrim(x.cod_entidad), ''), coalesce(nullif(btrim(x.entidad_nombre), ''), 'Cliente historico'),
    nullif(btrim(x.grupo), ''), nullif(btrim(x.plan_financiacion), ''), nullif(btrim(x.factura), ''),
    x.cantidad, x.total_venta, coalesce(x.valor_medio, 0), coalesce(x.total_cobrado, 0),
    coalesce(x.saldo, 0), x.fecha_vencimiento, coalesce(x.margen_venta_pct, 0),
    coalesce(x.margen_costo_pct, 0), coalesce(x.lucro_bruto, 0), coalesce(x.costo_medio, 0),
    coalesce(x.costo_total, 0), x.fecha_pedido, nullif(btrim(x.codigo_pedido), ''),
    coalesce(x.precio_tabla, 0), nullif(btrim(x.chasis), ''), coalesce(x.marca_estimada, 'OTROS'::public.marca),
    coalesce(nullif(btrim(x.tipo_maquina_estimado), ''), 'OTRO'),
    coalesce(nullif(btrim(x.modelo_estimado), ''), 'Modelo no informado'), coalesce(x.raw_data, '{}'::jsonb)
  from jsonb_to_recordset(p_lineas) as x(
    linea_clave text, fecha_factura date, sucursal public.sucursal, vendedor text,
    cod_mercaderia text, nombre_mercaderia text, tipo_movimiento text, cod_entidad text,
    entidad_nombre text, grupo text, plan_financiacion text, factura text, cantidad numeric,
    total_venta numeric, valor_medio numeric, total_cobrado numeric, saldo numeric,
    fecha_vencimiento date, margen_venta_pct numeric, margen_costo_pct numeric,
    lucro_bruto numeric, costo_medio numeric, costo_total numeric, fecha_pedido date,
    codigo_pedido text, precio_tabla numeric, chasis text, marca_estimada public.marca,
    tipo_maquina_estimado text, modelo_estimado text, raw_data jsonb
  )
  where x.fecha_factura <= date '2026-06-30'
    and upper(btrim(x.tipo_movimiento)) in ('S', 'E')
    and nullif(btrim(x.linea_clave), '') is not null
  on conflict (linea_clave) do update set
    carga_id = excluded.carga_id,
    fecha_factura = excluded.fecha_factura,
    sucursal = excluded.sucursal,
    vendedor = excluded.vendedor,
    cod_mercaderia = excluded.cod_mercaderia,
    nombre_mercaderia = excluded.nombre_mercaderia,
    tipo_movimiento = excluded.tipo_movimiento,
    cod_entidad = excluded.cod_entidad,
    entidad_nombre = excluded.entidad_nombre,
    grupo = excluded.grupo,
    plan_financiacion = excluded.plan_financiacion,
    factura = excluded.factura,
    cantidad = excluded.cantidad,
    total_venta = excluded.total_venta,
    valor_medio = excluded.valor_medio,
    total_cobrado = excluded.total_cobrado,
    saldo = excluded.saldo,
    fecha_vencimiento = excluded.fecha_vencimiento,
    margen_venta_pct = excluded.margen_venta_pct,
    margen_costo_pct = excluded.margen_costo_pct,
    lucro_bruto = excluded.lucro_bruto,
    costo_medio = excluded.costo_medio,
    costo_total = excluded.costo_total,
    fecha_pedido = excluded.fecha_pedido,
    codigo_pedido = excluded.codigo_pedido,
    precio_tabla = excluded.precio_tabla,
    chasis = excluded.chasis,
    marca_estimada = excluded.marca_estimada,
    tipo_maquina_estimado = excluded.tipo_maquina_estimado,
    modelo_estimado = excluded.modelo_estimado,
    raw_data = excluded.raw_data;

  return jsonb_build_object(
    'recibidas', v_recibidas,
    'acumuladas', (select count(*) from public.ventas_maquinas_historico_lineas where carga_id = p_carga_id)
  );
end;
$$;

create or replace function public.ventas_maquinas_finalizar_historico_v1(p_carga_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_esperadas integer; v_cargadas integer;
begin
  if auth.uid() is not null
    and not public.has_role(auth.uid(), 'admin'::public.app_role)
    and not public.has_role(auth.uid(), 'superadmin'::public.app_role) then
    raise exception 'Solo un administrador puede cargar el historico de ventas de maquinas' using errcode = '42501';
  end if;
  select filas_archivo into v_esperadas from public.ventas_maquinas_historico_cargas where id = p_carga_id and estado = 'PROCESANDO' for update;
  if not found then raise exception 'La carga no existe o ya fue cerrada'; end if;
  select count(*) into v_cargadas from public.ventas_maquinas_historico_lineas where carga_id = p_carga_id;
  if v_cargadas <> v_esperadas then
    raise exception 'Carga incompleta: se esperaban % lineas y se recibieron %', v_esperadas, v_cargadas;
  end if;
  update public.ventas_maquinas_historico_cargas set activo = false where activo;
  update public.ventas_maquinas_historico_cargas
    set estado = 'COMPLETADO', activo = true, completado_en = now()
    where id = p_carga_id;
  return public.ventas_maquinas_estado_historico_v1();
end;
$$;

create or replace function public.ventas_maquinas_cancelar_historico_v1(p_carga_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null
    and not public.has_role(auth.uid(), 'admin'::public.app_role)
    and not public.has_role(auth.uid(), 'superadmin'::public.app_role) then
    raise exception 'Solo un administrador puede cancelar esta carga' using errcode = '42501';
  end if;
  update public.ventas_maquinas_historico_cargas set estado = 'FALLIDO', activo = false
  where id = p_carga_id and estado = 'PROCESANDO';
end;
$$;

revoke all on function public.ventas_maquinas_estado_historico_v1() from public, anon;
revoke all on function public.ventas_maquinas_iniciar_historico_v1(text, integer) from public, anon;
revoke all on function public.ventas_maquinas_importar_historico_lote_v1(uuid, jsonb) from public, anon;
revoke all on function public.ventas_maquinas_finalizar_historico_v1(uuid) from public, anon;
revoke all on function public.ventas_maquinas_cancelar_historico_v1(uuid) from public, anon;
grant execute on function public.ventas_maquinas_estado_historico_v1() to authenticated;
grant execute on function public.ventas_maquinas_iniciar_historico_v1(text, integer) to authenticated;
grant execute on function public.ventas_maquinas_importar_historico_lote_v1(uuid, jsonb) to authenticated;
grant execute on function public.ventas_maquinas_finalizar_historico_v1(uuid) to authenticated;
grant execute on function public.ventas_maquinas_cancelar_historico_v1(uuid) to authenticated;

-- Fuente con corte explicito: evita duplicar el historico resumido que ya existia
-- en public.facturacion cuando se carga el detalle de cada maquina.
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
  join public.ventas_maquinas_historico_cargas c on c.id = h.carga_id and c.activo and c.estado = 'COMPLETADO'
  where h.fecha_factura between p_desde and least(p_hasta, date '2026-06-30')
    and (p_sucursal is null or btrim(p_sucursal) = '' or h.sucursal::text = btrim(p_sucursal))

  union all

  select b.linea_id, b.fecha, b.factura, b.cliente, b.sucursal::public.sucursal, b.total_venta,
    b.es_nota_credito, b.cantidad, b.marca, null::text, b.modelo, b.chasis,
    b.descripcion, 'actual', null::text, null::text, null::date, null::text, b.codigo
  from public.ventas_area_movimientos_base(
    greatest(p_desde, date '2026-07-01'),
    greatest(p_hasta, date '2026-07-01'),
    p_sucursal,
    null
  ) b
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
  if auth.uid() is null then raise exception 'Sesion requerida' using errcode = '42501'; end if;
  if not public.has_section_access(auth.uid(), 'parque.ventas') then raise exception 'No tenes acceso a Ventas de Maquinas' using errcode = '42501'; end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then raise exception 'Rango de fechas invalido' using errcode = '22023'; end if;
  if v_agrupacion not in ('dia', 'semana', 'mes', 'anio') then raise exception 'Agrupacion invalida' using errcode = '22023'; end if;
  v_dias := p_hasta - p_desde + 1;
  v_previo_hasta := p_desde - 1;
  v_previo_desde := v_previo_hasta - v_dias + 1;

  with movimientos as materialized (
    select * from public.ventas_maquinas_fuente_v2(v_previo_desde, p_hasta, p_sucursal)
  ), parseados as (
    select b.*,
      nullif(public.parque_normalizar_clave(b.factura), '') as factura_clave,
      public.normalizar_chasis_notificacion(b.chasis) as chasis_clave,
      nullif(btrim(substring(coalesce(b.descripcion, '') from '(?i)MARCA[[:space:]]*:[[:space:]]*([^|;]+?)(?:[[:space:]]+-[[:space:]]+MODELO[[:space:]]*:|$)')), '') as marca_texto,
      nullif(btrim(substring(coalesce(b.descripcion, '') from '(?i)TIPO[[:space:]]*:[[:space:]]*([^|;]+?)(?:[[:space:]]+-[[:space:]]+MARCA[[:space:]]*:|$)')), '') as tipo_texto
    from movimientos b
  ), vinculados as (
    select p.*,
      parque.marca_nombre as parque_marca_nombre, parque.marca::text as parque_marca,
      parque.subgrupo::text as parque_subgrupo, parque.subgrupo_personalizado,
      parque.modelo_tipo as parque_modelo, parque.modelo_catalogo_id,
      propietario.nombre as propietario,
      np.operacion_id, np.np_numero as np_numero_actual, np.np_fecha as np_fecha_actual,
      np.cliente_nombre as np_cliente, np.comercial, np.marca as np_marca,
      np.producto as np_tipo, np.modelo as np_modelo, np.condicion as np_condicion,
      case
        when p.metodologia = 'historico' and p.codigo_pedido is not null then 'PEDIDO_HISTORICO'
        when np.operacion_id is null then null
        when p.factura_clave is not null and public.parque_normalizar_clave(np.factura_venta) = p.factura_clave then 'FACTURA_Y_CHASIS'
        else 'CHASIS'
      end as vinculo_np
    from parseados p
    left join lateral (
      select pm.* from public.parque_maquinas pm
      where p.chasis_clave is not null and public.normalizar_chasis_notificacion(pm.serie) = p.chasis_clave
      order by pm.activo desc, pm.actualizado_en desc limit 1
    ) parque on true
    left join public.clientes propietario on propietario.id = parque.cliente_id
    left join lateral (
      select pedido.* from public.maquinaria_pedidos_lineas_estado_actual pedido
      where p.metodologia = 'actual' and p.chasis_clave is not null
        and public.normalizar_chasis_notificacion(pedido.chasis) = p.chasis_clave
      order by case when p.factura_clave is not null and public.parque_normalizar_clave(pedido.factura_venta) = p.factura_clave then 0 else 1 end,
        pedido.np_fecha desc nulls last, pedido.actualizado_en desc limit 1
    ) np on true
  ), previos as (
    select v.*,
      public.maquinaria_normalizar_marca(coalesce(nullif(v.parque_marca_nombre, ''), nullif(v.parque_marca, ''), nullif(v.np_marca, ''), nullif(v.marca_texto, ''), nullif(v.marca, ''))) as marca_previa,
      coalesce(nullif(v.parque_modelo, ''), nullif(v.np_modelo, ''), nullif(v.modelo, '')) as modelo_previo
    from vinculados v
  ), catalogados as (
    select p.*, catalogo.nombre as catalogo_modelo, catalogo.subgrupo::text as catalogo_subgrupo
    from previos p
    left join lateral (
      select c.nombre, c.subgrupo from public.parque_modelos_catalogo c
      where c.activo and c.marca_nombre = p.marca_previa and (
        c.id = p.modelo_catalogo_id or c.clave_normalizada = public.parque_modelo_clave(p.modelo_previo)
        or exists (select 1 from public.parque_modelos_alias a where a.modelo_catalogo_id = c.id and a.clave_alias = public.parque_modelo_clave(p.modelo_previo))
      ) order by (c.id = p.modelo_catalogo_id) desc, c.nombre limit 1
    ) catalogo on true
  ), normalizados as (
    select c.linea_id as id, c.fecha, coalesce(c.factura, 'Sin factura') as factura,
      coalesce(nullif(c.cliente, ''), 'Sin cliente facturado') as cliente_facturado,
      c.sucursal, c.total_venta::numeric as facturado, c.es_nota_credito,
      case when c.es_nota_credito or c.total_venta < 0 then -greatest(abs(coalesce(nullif(c.cantidad, 0), 1)), 1)
        else greatest(abs(coalesce(nullif(c.cantidad, 0), 1)), 1) end::numeric as unidades,
      coalesce(nullif(c.marca_previa, ''), 'Sin marca') as marca,
      coalesce(nullif(case when c.parque_subgrupo = 'OTRO' then c.subgrupo_personalizado else c.parque_subgrupo end, ''),
        nullif(c.np_tipo, ''), nullif(c.catalogo_subgrupo, ''), nullif(c.tipo_maquina, ''), nullif(upper(c.tipo_texto), ''), 'Sin tipo') as tipo_maquina,
      coalesce(nullif(c.catalogo_modelo, ''), nullif(c.parque_modelo, ''), nullif(c.np_modelo, ''), nullif(c.modelo, ''), 'Modelo no informado') as modelo,
      nullif(c.chasis, '') as chasis, coalesce(nullif(c.propietario, ''), 'No informado') as propietario,
      c.operacion_id, coalesce(c.np_numero_actual, c.codigo_pedido) as np_numero,
      coalesce(c.np_fecha_actual, c.pedido_fecha) as np_fecha,
      c.np_cliente, coalesce(c.comercial, c.vendedor) as comercial,
      coalesce(c.np_condicion, c.condicion_fuente) as condicion, c.vinculo_np,
      c.metodologia, case when c.metodologia = 'historico' then 'Sistema anterior' else 'Sistema actual' end as origen,
      c.cod_mercaderia, c.descripcion
    from catalogados c
  ), buscados as (
    select * from normalizados n where p_buscar is null or btrim(p_buscar) = '' or concat_ws(' ',
      n.factura, n.cliente_facturado, n.sucursal, n.marca, n.tipo_maquina, n.modelo,
      n.chasis, n.propietario, n.np_numero, n.np_cliente, n.comercial, n.cod_mercaderia, n.descripcion
    ) ilike '%' || btrim(p_buscar) || '%'
  ), filtrados as materialized (
    select * from buscados n
    where (p_marca is null or btrim(p_marca) = '' or upper(n.marca) = upper(btrim(p_marca)))
      and (p_tipo_maquina is null or btrim(p_tipo_maquina) = '' or upper(n.tipo_maquina) = upper(btrim(p_tipo_maquina)))
  ), actuales as materialized (
    select * from filtrados where fecha between p_desde and p_hasta
  ), anteriores as materialized (
    select * from filtrados where fecha between v_previo_desde and v_previo_hasta
  ), periodos_base as (
    select case v_agrupacion when 'dia' then fecha when 'semana' then date_trunc('week', fecha)::date when 'anio' then date_trunc('year', fecha)::date else date_trunc('month', fecha)::date end as periodo,
      sum(facturado)::numeric as total,
      sum(case when unidades > 0 then unidades else 0 end)::numeric as vendidas,
      abs(sum(case when unidades < 0 then unidades else 0 end))::numeric as notas_credito,
      sum(unidades)::numeric as netas, count(distinct factura)::integer as facturas,
      count(distinct cliente_facturado)::integer as clientes,
      count(*) filter (where np_numero is not null)::integer as con_np,
      count(*) filter (where np_numero is null)::integer as sin_np
    from actuales group by 1
  ), maquinas_base as (
    select marca, tipo_maquina,
      sum(case when unidades > 0 then unidades else 0 end)::numeric as vendidas,
      abs(sum(case when unidades < 0 then unidades else 0 end))::numeric as notas_credito,
      sum(unidades)::numeric as netas, count(distinct cliente_facturado)::integer as clientes,
      count(distinct factura)::integer as facturas, sum(facturado)::numeric as total,
      count(*) filter (where np_numero is not null)::integer as con_np,
      count(*) filter (where np_numero is null)::integer as sin_np,
      coalesce(sum(facturado) / nullif(sum(unidades), 0), 0)::numeric as promedio_unidad
    from actuales group by marca, tipo_maquina
  ), modelos_base as (
    select marca, tipo_maquina, modelo,
      sum(case when unidades > 0 then unidades else 0 end)::numeric as vendidas,
      abs(sum(case when unidades < 0 then unidades else 0 end))::numeric as notas_credito,
      sum(unidades)::numeric as netas, count(distinct cliente_facturado)::integer as clientes,
      count(distinct factura)::integer as facturas, sum(facturado)::numeric as total,
      count(*) filter (where np_numero is not null)::integer as con_np,
      count(*) filter (where np_numero is null)::integer as sin_np,
      coalesce(sum(facturado) / nullif(sum(unidades), 0), 0)::numeric as promedio_unidad
    from actuales group by marca, tipo_maquina, modelo
  )
  select jsonb_build_object(
    'resumen', jsonb_build_object(
      'total', coalesce((select sum(facturado) from actuales), 0),
      'venta_bruta', coalesce((select sum(facturado) from actuales where facturado > 0), 0),
      'notas_credito_monto', coalesce((select abs(sum(facturado)) from actuales where facturado < 0), 0),
      'facturas', (select count(distinct factura) from actuales),
      'clientes', (select count(distinct cliente_facturado) from actuales),
      'vendidas', coalesce((select sum(case when unidades > 0 then unidades else 0 end) from actuales), 0),
      'notas_credito', coalesce((select abs(sum(case when unidades < 0 then unidades else 0 end)) from actuales), 0),
      'netas', coalesce((select sum(unidades) from actuales), 0),
      'promedio_unidad', coalesce((select sum(facturado) / nullif(sum(unidades), 0) from actuales), 0),
      'con_np', (select count(*) from actuales where np_numero is not null),
      'sin_np', (select count(*) from actuales where np_numero is null)
    ),
    'comparacion', jsonb_build_object(
      'desde', v_previo_desde, 'hasta', v_previo_hasta,
      'total', coalesce((select sum(facturado) from anteriores), 0),
      'netas', coalesce((select sum(unidades) from anteriores), 0),
      'vendidas', coalesce((select sum(case when unidades > 0 then unidades else 0 end) from anteriores), 0),
      'notas_credito_monto', coalesce((select abs(sum(facturado)) from anteriores where facturado < 0), 0)
    ),
    'periodos', coalesce((select jsonb_agg(to_jsonb(p) order by p.periodo) from periodos_base p), '[]'::jsonb),
    'por_maquina', coalesce((select jsonb_agg(to_jsonb(m) order by m.total desc, m.marca, m.tipo_maquina) from maquinas_base m), '[]'::jsonb),
    'por_modelo', coalesce((select jsonb_agg(to_jsonb(m) order by m.total desc, m.marca, m.tipo_maquina, m.modelo) from modelos_base m), '[]'::jsonb),
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
