-- Foto vigente del inventario comercial de maquinarias exportado por TOTVS.
-- Se mantiene separado de parque_maquinas: aquel representa equipos de
-- clientes; esta tabla representa unidades propias disponibles para venta.

create table if not exists public.parque_stock_maquinas (
  id uuid primary key default gen_random_uuid(),
  producto_codigo text not null unique,
  sucursal public.sucursal,
  filial_original text,
  deposito text,
  tipo text,
  marca text,
  modelo text,
  estado text check (estado is null or estado in ('Nuevo', 'Usado')),
  chasis text,
  saldo_actual numeric not null default 0,
  carga_id uuid not null,
  importado_en timestamptz not null default now()
);

create index if not exists parque_stock_maquinas_sucursal_idx on public.parque_stock_maquinas (sucursal);
create index if not exists parque_stock_maquinas_marca_idx on public.parque_stock_maquinas (marca);
create index if not exists parque_stock_maquinas_tipo_idx on public.parque_stock_maquinas (tipo);
create index if not exists parque_stock_maquinas_estado_idx on public.parque_stock_maquinas (estado);
create index if not exists parque_stock_maquinas_chasis_idx on public.parque_stock_maquinas (chasis);
create index if not exists parque_stock_maquinas_carga_idx on public.parque_stock_maquinas (carga_id);

alter table public.parque_stock_maquinas enable row level security;

drop policy if exists "parque_stock_maquinas_select_modulo_parque" on public.parque_stock_maquinas;
create policy "parque_stock_maquinas_select_modulo_parque" on public.parque_stock_maquinas
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or exists (
      select 1 from public.user_modulo_acceso uma
      where uma.user_id = auth.uid() and uma.modulo_id = 'parque'
    )
  );

drop policy if exists "parque_stock_maquinas_write_admin" on public.parque_stock_maquinas;
create policy "parque_stock_maquinas_write_admin" on public.parque_stock_maquinas
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

grant select on public.parque_stock_maquinas to authenticated;
grant insert, update, delete on public.parque_stock_maquinas to authenticated;
