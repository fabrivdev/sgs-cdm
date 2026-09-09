-- Permisos granulares por sección, preparados para módulos futuros.
-- Idempotente: se puede ejecutar más de una vez.

insert into public.modulos (id, nombre, activo)
values ('admin', 'Administración', true)
on conflict (id) do update set nombre = excluded.nombre, activo = true;

create table if not exists public.app_secciones (
  id text primary key,
  modulo_id text not null references public.modulos(id) on delete cascade,
  nombre text not null,
  orden integer not null default 0,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

insert into public.app_secciones (id, modulo_id, nombre, orden, activo) values
  ('servicios.planificador', 'servicios', 'Planificador', 10, true),
  ('servicios.trabajos', 'servicios', 'Trabajos', 20, true),
  ('servicios.calendario', 'servicios', 'Calendario', 30, true),
  ('servicios.dashboard', 'servicios', 'Dashboard', 40, true),
  ('servicios.comisiones', 'servicios', 'Comisiones', 50, true),
  ('servicios.historial', 'servicios', 'Historial', 60, true),
  ('servicios.agenda', 'servicios', 'Agenda', 70, true),
  ('parque.clientes', 'parque', 'Clientes', 10, true),
  ('parque.maquinas', 'parque', 'Máquinas', 20, true),
  ('parque.stock', 'parque', 'Stock', 30, true),
  ('parque.operaciones', 'parque', 'Operaciones', 40, true),
  ('parque.importaciones', 'parque', 'Importaciones', 50, true),
  ('repuestos.stock', 'repuestos', 'Catálogo y stock', 10, true),
  ('repuestos.compras', 'repuestos', 'Compras', 20, true),
  ('repuestos.sugerencias', 'repuestos', 'Sugerencias de compra', 30, true),
  ('admin.usuarios', 'admin', 'Usuarios y accesos', 10, true),
  ('admin.importaciones', 'admin', 'Importación de datos', 20, true),
  ('admin.parametros', 'admin', 'Parámetros', 30, true)
on conflict (id) do update
set modulo_id = excluded.modulo_id,
    nombre = excluded.nombre,
    orden = excluded.orden,
    activo = excluded.activo;

alter table public.app_secciones enable row level security;

drop policy if exists "Authenticated read app sections" on public.app_secciones;
create policy "Authenticated read app sections"
on public.app_secciones for select to authenticated
using (true);

drop policy if exists "Superadmin manage app sections" on public.app_secciones;
create policy "Superadmin manage app sections"
on public.app_secciones for all to authenticated
using (public.has_role(auth.uid(), 'superadmin'::public.app_role))
with check (public.has_role(auth.uid(), 'superadmin'::public.app_role));

create table if not exists public.user_seccion_acceso (
  user_id uuid not null references auth.users(id) on delete cascade,
  seccion_id text not null references public.app_secciones(id) on delete cascade,
  otorgado_en timestamptz not null default now(),
  otorgado_por uuid null references auth.users(id) on delete set null,
  primary key (user_id, seccion_id)
);

create index if not exists user_seccion_acceso_seccion_idx
on public.user_seccion_acceso (seccion_id, user_id);

alter table public.user_seccion_acceso enable row level security;

drop policy if exists "Users and admins read section access" on public.user_seccion_acceso;
create policy "Users and admins read section access"
on public.user_seccion_acceso for select to authenticated
using (
  auth.uid() = user_id
  or public.has_role(auth.uid(), 'admin'::public.app_role)
  or public.has_role(auth.uid(), 'superadmin'::public.app_role)
);

drop policy if exists "Superadmin manage section access" on public.user_seccion_acceso;
create policy "Superadmin manage section access"
on public.user_seccion_acceso for all to authenticated
using (public.has_role(auth.uid(), 'superadmin'::public.app_role))
with check (public.has_role(auth.uid(), 'superadmin'::public.app_role));

create or replace function public.has_section_access(_user_id uuid, _seccion_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_role(_user_id, 'superadmin'::public.app_role)
    or exists (
      select 1
      from public.user_seccion_acceso usa
      where usa.seccion_id = _seccion_id
        and (
          usa.user_id = _user_id
          or usa.user_id in (
            select p.id
            from public.profiles p
            where p.auth_user_id = _user_id
          )
        )
    )
$$;

grant execute on function public.has_section_access(uuid, text) to authenticated;

-- La administración granular queda reservada al superadministrador. Estas
-- políticas también mantienen sincronizado el acceso general del módulo.
drop policy if exists "Admins manage modulo access" on public.user_modulo_acceso;
create policy "Admins manage modulo access"
on public.user_modulo_acceso for all to authenticated
using (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  or public.has_role(auth.uid(), 'superadmin'::public.app_role)
)
with check (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  or public.has_role(auth.uid(), 'superadmin'::public.app_role)
);

-- Conserva exactamente los accesos actuales: cada módulo habilitado
-- se transforma inicialmente en acceso a todas sus secciones.
insert into public.user_seccion_acceso (user_id, seccion_id)
select distinct uma.user_id, s.id
from public.user_modulo_acceso uma
join public.app_secciones s on s.modulo_id = uma.modulo_id
where s.activo = true
on conflict (user_id, seccion_id) do nothing;

-- Los administradores actuales conservan las tres áreas administrativas.
insert into public.user_seccion_acceso (user_id, seccion_id)
select distinct ur.user_id, s.id
from public.user_roles ur
cross join public.app_secciones s
where ur.role in ('admin'::public.app_role, 'superadmin'::public.app_role)
  and s.modulo_id = 'admin'
  and s.activo = true
on conflict (user_id, seccion_id) do nothing;

grant select on public.app_secciones to authenticated;
grant select, insert, update, delete on public.user_seccion_acceso to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.user_seccion_acceso;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
