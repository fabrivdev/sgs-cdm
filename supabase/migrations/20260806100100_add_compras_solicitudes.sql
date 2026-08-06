-- Fase 1 del modulo de analisis de Compras: espejo de "Solicitudes de
-- Compra" de TOTVS. Mismo criterio que compras_pedidos: clave natural
-- (nro_solicitud, item), upsert sin borrar en cada reimport, sin FK dura
-- contra productos (verificado: 99.7% de match real contra el maestro).
--
-- A diferencia del pedido, la solicitud trae MARCA propia en el archivo de
-- origen (no hace falta pasar por productos para saber la marca pedida) --
-- se guarda igual, puede diferir de la marca del producto que finalmente
-- se compre.

create table if not exists public.compras_solicitudes (
  nro_solicitud text not null,
  item text not null,
  fecha_emision date,
  sucursal public.sucursal,
  solicitante text,
  moneda text,
  producto_codigo text,
  codigo_fabricante text,
  marca_solicitada text,
  descripcion text,
  unidad text,
  cantidad numeric,
  precio_unitario numeric,
  valor_total numeric,
  observacion text,
  importado_en timestamptz not null default now(),
  primary key (nro_solicitud, item)
);

create index if not exists compras_solicitudes_producto_codigo_idx on public.compras_solicitudes (producto_codigo);
create index if not exists compras_solicitudes_fecha_emision_idx on public.compras_solicitudes (fecha_emision);
create index if not exists compras_solicitudes_moneda_idx on public.compras_solicitudes (moneda);

alter table public.compras_solicitudes enable row level security;

drop policy if exists "compras_solicitudes_select_modulo_repuestos" on public.compras_solicitudes;
create policy "compras_solicitudes_select_modulo_repuestos" on public.compras_solicitudes
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or exists (
      select 1 from public.user_modulo_acceso uma
      where uma.user_id = auth.uid() and uma.modulo_id = 'repuestos'
    )
  );

drop policy if exists "compras_solicitudes_write_admin" on public.compras_solicitudes;
create policy "compras_solicitudes_write_admin" on public.compras_solicitudes
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
