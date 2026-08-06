-- Vinculo manual entre una linea de solicitud y el pedido que la origino,
-- para los casos donde la heuristica automatica (mismo producto+sucursal+
-- fecha posterior+precio parecido) no alcanza a resolver un unico
-- candidato. Se completa a mano desde la UI, nunca automaticamente -- por
-- eso es tabla aparte, igual criterio que seguimiento_pedidos: nada del
-- importador la toca.

create table if not exists public.compras_solicitud_pedido_vinculo (
  sucursal public.sucursal not null,
  nro_solicitud text not null,
  item text not null,
  pedido_sucursal public.sucursal not null,
  pedido_nro_pedido text not null,
  vinculado_por uuid references auth.users(id) on delete set null,
  vinculado_en timestamptz not null default now(),
  primary key (sucursal, nro_solicitud, item)
);

alter table public.compras_solicitud_pedido_vinculo enable row level security;

drop policy if exists "compras_solicitud_pedido_vinculo_select_modulo_repuestos" on public.compras_solicitud_pedido_vinculo;
create policy "compras_solicitud_pedido_vinculo_select_modulo_repuestos" on public.compras_solicitud_pedido_vinculo
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or exists (
      select 1 from public.user_modulo_acceso uma
      where uma.user_id = auth.uid() and uma.modulo_id = 'repuestos'
    )
  );

drop policy if exists "compras_solicitud_pedido_vinculo_write_admin" on public.compras_solicitud_pedido_vinculo;
create policy "compras_solicitud_pedido_vinculo_write_admin" on public.compras_solicitud_pedido_vinculo
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
