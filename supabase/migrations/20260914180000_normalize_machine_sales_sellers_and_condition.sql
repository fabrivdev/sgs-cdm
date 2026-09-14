-- Unifica vendedores del historico y del sistema actual en Ventas de Maquinas.
-- Regla de condicion: una maquina solo es Usada con evidencia explicita;
-- si la fuente no informa condicion, comercialmente corresponde a Nueva.

create or replace function public.ventas_normalizar_vendedor_maquinas(p_vendedor text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  with limpio as (
    select
      upper(btrim(coalesce(p_vendedor, ''))) as original,
      upper(regexp_replace(
        regexp_replace(btrim(coalesce(p_vendedor, '')), '^[0-9]+[[:space:]]*-[[:space:]]*', ''),
        '[[:space:]]+', ' ', 'g'
      )) as nombre
  ), clave as (
    select original, nombre,
      translate(nombre, 'ÁÉÍÓÚÜÑ', 'AEIOUUN') as valor
    from limpio
  )
  select case
    when nombre = '' then null
    when original like '000007%' or (valor like '%CARLOS%' and valor like '%BENITEZ%')
      then 'CARLOS JAVIER BENITEZ ZARZA'
    when original like '000003%' or (valor like '%ANDRES%' and valor like '%CANETE%')
      then 'LUIS ANDRES CAÑETE RODRIGUEZ'
    when original like '000011%' or (valor like '%RUBEN%' and valor like '%CENTURION%')
      then 'RUBEN JUAN ANTONIO CENTURION RAMOS'
    when original like '000005%' or (valor like '%HELWIN%' and valor like '%LOPEZ%')
      then 'HELWIN LOPEZ BORGES'
    when original like '000006%' or (valor like '%OSCAR%' and valor like '%BENITEZ%')
      then 'OSCAR DANIEL BENITEZ MEZA'
    when original like '000004%' or (valor like '%JUAN%' and valor like '%APODACA%')
      then 'JUAN DANIEL APODACA FERREIRA'
    else nombre
  end
  from clave;
$$;

revoke all on function public.ventas_normalizar_vendedor_maquinas(text) from public, anon;
grant execute on function public.ventas_normalizar_vendedor_maquinas(text) to authenticated;

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
    h.nombre_mercaderia, 'historico',
    public.ventas_normalizar_vendedor_maquinas(h.vendedor),
    h.codigo_pedido, h.fecha_pedido,
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
    public.ventas_normalizar_vendedor_maquinas(coalesce(
      nullif(btrim(f.vendedor), ''),
      nullif(btrim(public.valor_json_insensible(
        coalesce(f.raw_data, '{}'::jsonb),
        array['VENDEDOR', 'NOMVEN', 'NOMBRE VENDEDOR', 'NOMVEND', 'VEND']
      )), '')
    )),
    null::text, null::date, 'NUEVA'::text, b.codigo
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

notify pgrst, 'reload schema';
