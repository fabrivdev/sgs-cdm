begin;

create table public.mercado_market_share_cadam (
  like public.mercado_market_share including all,
  constraint market_share_cadam_year check (anio <= 2025)
);

alter table public.mercado_market_share_cadam alter column detalle set not null;
alter table public.mercado_market_share_cadam enable row level security;
revoke all on public.mercado_market_share_cadam from public, anon, authenticated;
grant select, insert, update on public.mercado_market_share_cadam to authenticated;

create policy lectura_market_share_cadam on public.mercado_market_share_cadam
for select to authenticated using (
  public.has_role(auth.uid(), 'superadmin')
  or (public.has_module_access(auth.uid(), 'mercado') and public.has_section_access(auth.uid(), 'mercado.market_share'))
);

create policy administracion_market_share_cadam on public.mercado_market_share_cadam
for all to authenticated using (
  public.has_role(auth.uid(), 'superadmin')
  or (public.has_role(auth.uid(), 'admin') and public.has_section_access(auth.uid(), 'admin.importaciones'))
) with check (
  public.has_role(auth.uid(), 'superadmin')
  or (public.has_role(auth.uid(), 'admin') and public.has_section_access(auth.uid(), 'admin.importaciones'))
);

commit;
