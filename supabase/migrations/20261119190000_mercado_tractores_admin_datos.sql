begin;

drop policy administracion_mercado on public.mercado_tractores;
create policy administracion_mercado on public.mercado_tractores for all to authenticated
using (
  public.has_role(auth.uid(), 'superadmin') or
  (public.has_role(auth.uid(), 'admin') and public.has_section_access(auth.uid(), 'admin.importaciones'))
)
with check (
  public.has_role(auth.uid(), 'superadmin') or
  (public.has_role(auth.uid(), 'admin') and public.has_section_access(auth.uid(), 'admin.importaciones'))
);

commit;
