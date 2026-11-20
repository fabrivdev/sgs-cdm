begin;

insert into public.app_secciones(id, modulo_id, nombre, orden, activo)
values ('mercado.market_share', 'mercado', 'Market Share', 50, true)
on conflict (id) do nothing;

create table public.mercado_market_share (
  familia text not null check (familia in ('tractores', 'cosechadoras', 'pulverizadores')),
  anio smallint not null check (anio between 2000 and 2100),
  mes smallint not null check (mes between 1 and 12),
  total integer not null check (total >= 0),
  detalle jsonb check (jsonb_typeof(detalle) = 'array'),
  primary key (familia, anio, mes)
);

alter table public.mercado_market_share enable row level security;
revoke all on public.mercado_market_share from public, anon, authenticated;
grant select, insert, update on public.mercado_market_share to authenticated;

create policy lectura_market_share on public.mercado_market_share
for select to authenticated using (
  public.has_role(auth.uid(), 'superadmin')
  or (public.has_module_access(auth.uid(), 'mercado') and public.has_section_access(auth.uid(), 'mercado.market_share'))
);

create policy administracion_market_share on public.mercado_market_share
for all to authenticated using (
  public.has_role(auth.uid(), 'superadmin')
  or (public.has_role(auth.uid(), 'admin') and public.has_section_access(auth.uid(), 'admin.importaciones'))
) with check (
  public.has_role(auth.uid(), 'superadmin')
  or (public.has_role(auth.uid(), 'admin') and public.has_section_access(auth.uid(), 'admin.importaciones'))
);

create function public.guardar_mercado_market_share(p_periodos jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not coalesce(
    public.has_role(auth.uid(), 'superadmin')
    or (public.has_role(auth.uid(), 'admin') and public.has_section_access(auth.uid(), 'admin.importaciones')),
    false
  ) then
    raise exception 'Se requiere acceso a Administración → Datos.' using errcode = '42501';
  end if;

  insert into public.mercado_market_share as actual (familia, anio, mes, total, detalle)
  select familia, anio, mes, total, detalle
  from jsonb_to_recordset(p_periodos) as entrada(familia text, anio smallint, mes smallint, total integer, detalle jsonb)
  on conflict (familia, anio, mes) do update
    set total = excluded.total, detalle = excluded.detalle
    where excluded.detalle is not null or actual.detalle is null;
end;
$$;

revoke all on function public.guardar_mercado_market_share(jsonb) from public, anon;
grant execute on function public.guardar_mercado_market_share(jsonb) to authenticated;

commit;
