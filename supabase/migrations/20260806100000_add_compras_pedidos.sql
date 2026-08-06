-- Fase 1 del modulo de analisis de Compras: espejo de "Pedidos de Compra"
-- de TOTVS. Clave natural (nro_pedido, item) -- upsert sobre esa clave en
-- cada reimport, sin borrar filas viejas: a diferencia de repuestos_stock
-- (que es una foto del saldo actual), un pedido sigue siendo un dato
-- historico valido aunque deje de aparecer en un export mas nuevo.
--
-- producto_codigo cruza contra public.productos.codigo_interno sin FK dura
-- (mismo criterio que repuestos_stock: los exports de origen no siempre
-- estan sincronizados entre si, se prioriza resiliencia sobre integridad
-- referencial estricta). Verificado: 98.7% de match real contra el maestro.

create table if not exists public.compras_pedidos (
  nro_pedido text not null,
  item text not null,
  fecha_emision date,
  sucursal public.sucursal,
  proveedor_codigo text,
  proveedor_nombre text,
  moneda text,
  condicion_pago text,
  naturaleza text,
  producto_codigo text,
  descripcion text,
  unidad text,
  cantidad numeric,
  precio_unitario numeric,
  valor_total numeric,
  cantidad_entregada numeric,
  cantidad_pendiente numeric,
  tipo_entrega text,
  importado_en timestamptz not null default now(),
  primary key (nro_pedido, item)
);

create index if not exists compras_pedidos_producto_codigo_idx on public.compras_pedidos (producto_codigo);
create index if not exists compras_pedidos_proveedor_codigo_idx on public.compras_pedidos (proveedor_codigo);
create index if not exists compras_pedidos_fecha_emision_idx on public.compras_pedidos (fecha_emision);
create index if not exists compras_pedidos_moneda_idx on public.compras_pedidos (moneda);

alter table public.compras_pedidos enable row level security;

drop policy if exists "compras_pedidos_select_modulo_repuestos" on public.compras_pedidos;
create policy "compras_pedidos_select_modulo_repuestos" on public.compras_pedidos
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or exists (
      select 1 from public.user_modulo_acceso uma
      where uma.user_id = auth.uid() and uma.modulo_id = 'repuestos'
    )
  );

drop policy if exists "compras_pedidos_write_admin" on public.compras_pedidos;
create policy "compras_pedidos_write_admin" on public.compras_pedidos
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
