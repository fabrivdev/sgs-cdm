begin;

insert into public.app_secciones(id, modulo_id, nombre, orden, activo)
values ('mercado.cosechadoras', 'mercado', 'Cosechadoras', 20, true)
on conflict (id) do nothing;

create table public.mercado_cosechadoras (
  id smallint primary key check (id = 1),
  datos jsonb not null check (jsonb_typeof(datos) = 'array' and jsonb_array_length(datos) > 0)
);

alter table public.mercado_cosechadoras enable row level security;
revoke all on public.mercado_cosechadoras from public, anon, authenticated;
grant select, insert, update on public.mercado_cosechadoras to authenticated;

create policy lectura_cosechadoras on public.mercado_cosechadoras
for select to authenticated using (
  public.has_role(auth.uid(), 'superadmin')
  or (public.has_module_access(auth.uid(), 'mercado') and public.has_section_access(auth.uid(), 'mercado.cosechadoras'))
);

create policy administracion_cosechadoras on public.mercado_cosechadoras
for all to authenticated using (
  public.has_role(auth.uid(), 'superadmin')
  or (public.has_role(auth.uid(), 'admin') and public.has_section_access(auth.uid(), 'admin.importaciones'))
) with check (
  public.has_role(auth.uid(), 'superadmin')
  or (public.has_role(auth.uid(), 'admin') and public.has_section_access(auth.uid(), 'admin.importaciones'))
);

commit;
