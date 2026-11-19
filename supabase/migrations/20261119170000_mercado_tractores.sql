begin;
insert into public.modulos(id,nombre) values ('mercado','Mercado') on conflict (id) do nothing;
insert into public.app_secciones(id,modulo_id,nombre,orden,activo)
values ('mercado.tractores','mercado','Tractores',10,true) on conflict (id) do nothing;
create table public.mercado_tractores (
  id smallint primary key check (id=1),
  datos jsonb not null check (jsonb_typeof(datos)='array' and jsonb_array_length(datos)>0)
);
alter table public.mercado_tractores enable row level security;
revoke all on public.mercado_tractores from public,anon,authenticated;
grant select,insert,update on public.mercado_tractores to authenticated;
create policy lectura_mercado on public.mercado_tractores for select to authenticated using (
  public.has_role(auth.uid(),'superadmin') or
  (public.has_module_access(auth.uid(),'mercado') and public.has_section_access(auth.uid(),'mercado.tractores'))
);
create policy administracion_mercado on public.mercado_tractores for all to authenticated
using (public.has_role(auth.uid(),'superadmin') or
  (public.has_role(auth.uid(),'admin') and public.has_module_access(auth.uid(),'mercado') and public.has_section_access(auth.uid(),'mercado.tractores')))
with check (public.has_role(auth.uid(),'superadmin') or
  (public.has_role(auth.uid(),'admin') and public.has_module_access(auth.uid(),'mercado') and public.has_section_access(auth.uid(),'mercado.tractores')));
commit;
