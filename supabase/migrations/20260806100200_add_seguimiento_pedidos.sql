-- Capa de seguimiento propia sobre un pedido de compra: NUNCA la toca el
-- importador de TOTVS (no la referencia en ningun lado del codigo de
-- import), por diseno -- no es una convencion a recordar, es
-- estructuralmente imposible que un reimport la pise.
--
-- Clave por nro_pedido completo (no por item): se asume que el seguimiento
-- de "en que va este pedido" es a nivel de pedido, no por linea individual
-- -- un pedido suele viajar/entregarse como una unidad. Si en la practica
-- hace falta trackear items sueltos de un mismo pedido por separado, esto
-- se revisita.

create table if not exists public.seguimiento_pedidos (
  nro_pedido text primary key,
  estado_seguimiento text not null default 'Sin gestionar'
    check (estado_seguimiento in ('Sin gestionar', 'Solicitado a fabrica', 'En transito', 'Recibido')),
  fecha_estimada_llegada date,
  nro_seguimiento text,
  notas text,
  actualizado_por uuid references auth.users(id) on delete set null,
  actualizado_en timestamptz not null default now()
);

alter table public.seguimiento_pedidos enable row level security;

drop policy if exists "seguimiento_pedidos_select_modulo_repuestos" on public.seguimiento_pedidos;
create policy "seguimiento_pedidos_select_modulo_repuestos" on public.seguimiento_pedidos
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or exists (
      select 1 from public.user_modulo_acceso uma
      where uma.user_id = auth.uid() and uma.modulo_id = 'repuestos'
    )
  );

drop policy if exists "seguimiento_pedidos_write_admin" on public.seguimiento_pedidos;
create policy "seguimiento_pedidos_write_admin" on public.seguimiento_pedidos
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
