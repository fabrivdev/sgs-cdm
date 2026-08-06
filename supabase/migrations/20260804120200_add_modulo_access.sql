-- Segundo eje de permisos, independiente del nivel jerarquico: que modulos
-- puede ENTRAR a ver un usuario (Servicios, Repuestos, los que vengan
-- despues). Existencia de la fila = tiene acceso; se revoca borrandola,
-- mismo patron delete/insert que ya usa la UI de Admin para user_roles.
--
-- "modulos" es una tabla lookup (no un enum) para que agregar un modulo
-- nuevo en el futuro sea un insert, no una migracion de esquema.

create table if not exists public.modulos (
  id text primary key,
  nombre text not null,
  activo boolean not null default true
);

insert into public.modulos (id, nombre) values
  ('servicios', 'Servicios'),
  ('repuestos', 'Repuestos')
on conflict (id) do nothing;

alter table public.modulos enable row level security;

drop policy if exists "Authenticated read modulos" on public.modulos;
create policy "Authenticated read modulos" on public.modulos
  for select to authenticated using (true);

drop policy if exists "Admins manage modulos" on public.modulos;
create policy "Admins manage modulos" on public.modulos
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create table if not exists public.user_modulo_acceso (
  user_id uuid not null references auth.users(id) on delete cascade,
  modulo_id text not null references public.modulos(id) on delete cascade,
  otorgado_en timestamptz not null default now(),
  primary key (user_id, modulo_id)
);

alter table public.user_modulo_acceso enable row level security;

-- Mismo patron de policies que public.user_roles: lectura propia + admin, escritura solo admin.
drop policy if exists "Users see own modulo access" on public.user_modulo_acceso;
create policy "Users see own modulo access" on public.user_modulo_acceso
  for select to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins manage modulo access" on public.user_modulo_acceso;
create policy "Admins manage modulo access" on public.user_modulo_acceso
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Backfill: quien ya tiene cualquier rol hoy conserva acceso a Servicios,
-- el unico modulo que existia antes de este cambio. Idempotente (on
-- conflict do nothing), seguro de re-ejecutar.
insert into public.user_modulo_acceso (user_id, modulo_id)
select distinct ur.user_id, 'servicios'
from public.user_roles ur
on conflict (user_id, modulo_id) do nothing;
