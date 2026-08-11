-- Parque deja de pertenecer a Servicios y pasa a ser un modulo transversal.
-- Los administradores conservan acceso por su bypass global. Para el resto,
-- el acceso se asigna de forma explicita desde Administracion.

insert into public.modulos (id, nombre, activo)
values ('parque', 'Parque', true)
on conflict (id) do update
set nombre = excluded.nombre,
    activo = true;
