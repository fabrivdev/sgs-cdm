-- Fase 1 del modulo Repuestos: catalogo de productos persistido (hoy el
-- maestro de productos se parsea en memoria durante el import de
-- facturacion/OS y se descarta, ver src/lib/imports/newSystemBundle.ts) y
-- stock por sucursal/deposito (reporte_de_stock, sin pipeline hasta ahora).
--
-- Ambas tablas son snapshots de un export TOTVS sin historico propio: cada
-- import reemplaza el contenido anterior (delete + insert), no acumula.
-- No hay FK dura entre repuestos_stock.producto_codigo y productos.codigo_
-- interno a proposito: los exports no siempre estan perfectamente
-- sincronizados entre si, y el resto del esquema (facturacion_lineas_
-- importadas.cod_mercaderia, etc.) ya sigue el mismo patron de texto suelto
-- en vez de referencia estricta, por resiliencia ante datos de origen
-- inconsistentes.

create table if not exists public.productos (
  codigo_interno text primary key,
  codigo_fabricante text,
  descripcion text not null,
  unidad text,
  grupo text,
  familia text,
  marca public.marca not null default 'OTROS',
  activo boolean not null default true,
  actualizado_en timestamptz not null default now()
);

alter table public.productos enable row level security;

drop policy if exists "productos_select_modulo_repuestos" on public.productos;
create policy "productos_select_modulo_repuestos" on public.productos
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or exists (
      select 1 from public.user_modulo_acceso uma
      where uma.user_id = auth.uid() and uma.modulo_id = 'repuestos'
    )
  );

drop policy if exists "productos_write_admin" on public.productos;
create policy "productos_write_admin" on public.productos
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create table if not exists public.repuestos_stock (
  id uuid primary key default gen_random_uuid(),
  producto_codigo text not null,
  descripcion text,
  unidad text,
  codigo_fabricante text,
  sucursal public.sucursal,
  deposito text,
  saldo_actual numeric not null default 0,
  importado_en timestamptz not null default now(),
  unique (producto_codigo, sucursal, deposito)
);

create index if not exists repuestos_stock_producto_codigo_idx on public.repuestos_stock (producto_codigo);

alter table public.repuestos_stock enable row level security;

drop policy if exists "repuestos_stock_select_modulo_repuestos" on public.repuestos_stock;
create policy "repuestos_stock_select_modulo_repuestos" on public.repuestos_stock
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or exists (
      select 1 from public.user_modulo_acceso uma
      where uma.user_id = auth.uid() and uma.modulo_id = 'repuestos'
    )
  );

drop policy if exists "repuestos_stock_write_admin" on public.repuestos_stock;
create policy "repuestos_stock_write_admin" on public.repuestos_stock
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
