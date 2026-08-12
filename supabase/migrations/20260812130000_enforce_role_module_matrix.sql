-- SIG: matriz efectiva de autorizacion.
-- Modulo = donde entra; rol = que puede hacer; sucursal/asignacion = alcance.

create or replace function public.has_module_access(_user_id uuid, _modulo_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_modulo_acceso uma
    where uma.modulo_id = _modulo_id
      and (
        uma.user_id = _user_id
        or uma.user_id in (
          select p.id
          from public.profiles p
          where p.auth_user_id = _user_id
        )
      )
  )
$$;

grant execute on function public.has_module_access(uuid, text) to authenticated;

-- La cuenta tecnica conserva acceso global mediante grants normales y
-- auditables, no mediante un bypass oculto en las politicas.
insert into public.user_modulo_acceso (user_id, modulo_id)
select u.id, m.id
from auth.users u
cross join public.modulos m
where lower(coalesce(u.email, '')) = 'fabrizio.vega@cdm.com.py'
  and m.activo = true
on conflict (user_id, modulo_id) do nothing;

-- Las politicas RESTRICTIVE se combinan con las politicas historicas. Aunque
-- una politica anterior permita la fila por rol, sin modulo no hay acceso.
do $$
declare
  gate record;
begin
  for gate in
    select * from (values
      ('servicios', 'servicios'),
      ('trabajos', 'servicios'),
      ('programaciones', 'servicios'),
      ('jornadas', 'servicios'),
      ('servicio_jornadas', 'servicios'),
      ('trabajo_historial', 'servicios'),
      ('parque_maquinas', 'parque'),
      ('parque_modelos_catalogo', 'parque'),
      ('parque_modelos_alias', 'parque'),
      ('productos', 'repuestos'),
      ('repuestos_stock', 'repuestos'),
      ('compras_pedidos', 'repuestos'),
      ('compras_solicitudes', 'repuestos'),
      ('compras_solicitud_pedido_vinculo', 'repuestos'),
      ('seguimiento_pedidos', 'repuestos')
    ) as policies(tabla, modulo)
  loop
    if to_regclass('public.' || gate.tabla) is not null then
      execute format(
        'drop policy if exists %I on public.%I',
        'module_gate_' || gate.tabla,
        gate.tabla
      );
      execute format(
        'create policy %I on public.%I as restrictive for all to authenticated using (public.has_module_access(auth.uid(), %L)) with check (public.has_module_access(auth.uid(), %L))',
        'module_gate_' || gate.tabla,
        gate.tabla,
        gate.modulo,
        gate.modulo
      );
    end if;
  end loop;
end $$;

-- Gerencia: consulta transversal del modulo Servicios, sin permisos de
-- escritura. Estas politicas son permisivas, pero quedan sujetas al gate
-- restrictivo de modulo creado arriba.
drop policy if exists "Gerencia select servicios" on public.servicios;
create policy "Gerencia select servicios" on public.servicios
for select to authenticated
using (public.has_role(auth.uid(), 'gerencia'::public.app_role));

drop policy if exists "Gerencia select trabajos" on public.trabajos;
create policy "Gerencia select trabajos" on public.trabajos
for select to authenticated
using (public.has_role(auth.uid(), 'gerencia'::public.app_role));

drop policy if exists "Gerencia select programaciones" on public.programaciones;
create policy "Gerencia select programaciones" on public.programaciones
for select to authenticated
using (public.has_role(auth.uid(), 'gerencia'::public.app_role));

drop policy if exists "Gerencia select jornadas" on public.jornadas;
create policy "Gerencia select jornadas" on public.jornadas
for select to authenticated
using (public.has_role(auth.uid(), 'gerencia'::public.app_role));

drop policy if exists "Gerencia select servicio jornadas" on public.servicio_jornadas;
create policy "Gerencia select servicio jornadas" on public.servicio_jornadas
for select to authenticated
using (public.has_role(auth.uid(), 'gerencia'::public.app_role));

drop policy if exists "Gerencia select facturacion" on public.facturacion;
create policy "Gerencia select facturacion" on public.facturacion
for select to authenticated
using (
  public.has_module_access(auth.uid(), 'servicios')
  and public.has_role(auth.uid(), 'gerencia'::public.app_role)
);

drop policy if exists "Gerencia select facturacion lineas" on public.facturacion_lineas_importadas;
create policy "Gerencia select facturacion lineas" on public.facturacion_lineas_importadas
for select to authenticated
using (
  public.has_module_access(auth.uid(), 'servicios')
  and public.has_role(auth.uid(), 'gerencia'::public.app_role)
);

drop policy if exists "Gerencia select ordenes servicio" on public.ordenes_servicio_importadas;
create policy "Gerencia select ordenes servicio" on public.ordenes_servicio_importadas
for select to authenticated
using (
  public.has_module_access(auth.uid(), 'servicios')
  and public.has_role(auth.uid(), 'gerencia'::public.app_role)
);

-- Parque: Admin y Gerencia consultan transversalmente dentro del modulo.
-- Jefatura y Operativo quedan acotados a su sucursal.
drop policy if exists "Parque select" on public.parque_maquinas;
drop policy if exists "Parque select by role" on public.parque_maquinas;
create policy "Parque select by role" on public.parque_maquinas
for select to authenticated using (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  or public.has_role(auth.uid(), 'gerencia'::public.app_role)
  or (
    (
      public.has_role(auth.uid(), 'jefatura'::public.app_role)
      or public.has_role(auth.uid(), 'operativo'::public.app_role)
    )
    and (sucursal is null or sucursal = public.get_user_sucursal(auth.uid()))
  )
);

-- Clientes es compartida por Servicios y Parque. Se agregan lecturas para
-- Parque sin quitar las reglas existentes de Servicios.
drop policy if exists "Clientes select parque" on public.clientes;
create policy "Clientes select parque" on public.clientes
for select to authenticated using (
  public.has_module_access(auth.uid(), 'parque')
  and (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'gerencia'::public.app_role)
    or (
      (
        public.has_role(auth.uid(), 'jefatura'::public.app_role)
        or public.has_role(auth.uid(), 'operativo'::public.app_role)
      )
      and (sucursal is null or sucursal = public.get_user_sucursal(auth.uid()))
    )
  )
);

drop policy if exists "Contactos select parque" on public.contactos_cliente;
create policy "Contactos select parque" on public.contactos_cliente
for select to authenticated using (
  public.has_module_access(auth.uid(), 'parque')
  and exists (
    select 1
    from public.clientes c
    where c.id = contactos_cliente.cliente_id
  )
);

-- Jefatura puede mantener Parque en su sucursal; Gerencia y Operativo son
-- lectura. Solo Admin conserva eliminacion definitiva.
drop policy if exists "Parque insert" on public.parque_maquinas;
drop policy if exists "Parque insert by role" on public.parque_maquinas;
create policy "Parque insert by role" on public.parque_maquinas
for insert to authenticated with check (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  or (
    public.has_role(auth.uid(), 'jefatura'::public.app_role)
    and (sucursal is null or sucursal = public.get_user_sucursal(auth.uid()))
  )
);

drop policy if exists "Parque update" on public.parque_maquinas;
drop policy if exists "Parque update by role" on public.parque_maquinas;
create policy "Parque update by role" on public.parque_maquinas
for update to authenticated
using (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  or (
    public.has_role(auth.uid(), 'jefatura'::public.app_role)
    and (sucursal is null or sucursal = public.get_user_sucursal(auth.uid()))
  )
)
with check (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  or (
    public.has_role(auth.uid(), 'jefatura'::public.app_role)
    and (sucursal is null or sucursal = public.get_user_sucursal(auth.uid()))
  )
);

drop policy if exists "Parque delete" on public.parque_maquinas;
drop policy if exists "Parque delete by role" on public.parque_maquinas;
create policy "Parque delete by role" on public.parque_maquinas
for delete to authenticated using (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Repuestos: Jefatura puede actualizar el seguimiento y vincular solicitudes.
-- Los snapshots importados siguen reservados para Admin.
drop policy if exists "seguimiento_pedidos_write_admin" on public.seguimiento_pedidos;
drop policy if exists "seguimiento_pedidos_write_management" on public.seguimiento_pedidos;
create policy "seguimiento_pedidos_write_management" on public.seguimiento_pedidos
for all to authenticated
using (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  or public.has_role(auth.uid(), 'jefatura'::public.app_role)
)
with check (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  or public.has_role(auth.uid(), 'jefatura'::public.app_role)
);

drop policy if exists "compras_vinculo_write_management" on public.compras_solicitud_pedido_vinculo;
drop policy if exists "compras_solicitud_pedido_vinculo_write_admin" on public.compras_solicitud_pedido_vinculo;
create policy "compras_vinculo_write_management" on public.compras_solicitud_pedido_vinculo
for all to authenticated
using (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  or public.has_role(auth.uid(), 'jefatura'::public.app_role)
)
with check (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  or public.has_role(auth.uid(), 'jefatura'::public.app_role)
);

notify pgrst, 'reload schema';
