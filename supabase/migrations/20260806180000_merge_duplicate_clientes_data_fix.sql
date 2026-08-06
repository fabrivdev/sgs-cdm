-- REGISTRO DE UNA CORRECCION DE DATOS YA EJECUTADA A MANO (2026-08-06), NO
-- UN CAMBIO DE ESQUEMA. Se deja este archivo como auditoria de lo que se
-- hizo y por que, y porque el script es idempotente (correrlo de nuevo no
-- hace nada si ya no hay nada que corregir).
--
-- CAUSA: el importador de clientes (Fase Clientes/TOTVS) comparaba un
-- cliente nuevo contra los existentes SOLO por cod_entidad. Los clientes
-- cargados por el sistema viejo tienen cod_entidad = codigo interno corto
-- (ej. "3116"), mientras que el importador nuevo usa el RUC de TOTVS (ej.
-- "4620512-8") como cod_entidad. Nunca coincidian, asi que el importador
-- penso que casi toda la base de clientes (1.458 de 1.511 activos) era
-- nueva y la duplico -- 1.473 filas de mas.
--
-- Verificado antes de tocar nada: la fila duplicada (la importada de
-- nuevo, creada 2026-08-06) tenia 0 vinculos en las 5 tablas que
-- referencian clientes.id (parque_maquinas, facturacion, contactos_cliente,
-- servicios, seguimiento_comercial) en el 100% de una muestra revisada
-- manualmente antes de ejecutar la fusion.
--
-- QUE SE HIZO, EN ORDEN (los 3 pasos de abajo son exactamente lo que se
-- corrio en produccion via SQL Editor, en session con el usuario):
--
-- 1) Por cada grupo de clientes con el mismo nombre (normalizado), se
--    eligio como "conservada" la fila con mas vinculos reales en las 5
--    tablas (y si empataban, la mas vieja por creado_en, y como ultimo
--    desempate el id). Se reasignaron todos los vinculos de las filas
--    "perdedoras" hacia la conservada, y las perdedoras se desactivaron
--    (activo = false) -- NUNCA se borraron filas.
--    Resultado: 1.460 desactivadas en la primera pasada + 13 mas en una
--    segunda pasada para grupos que habian empatado exactamente (mismo
--    creado_en al microsegundo, duplicados viejos del lote original del
--    22 de abril, no relacionados con el bug de este importador).
--    Total: 1.473 filas desactivadas -- coincide exacto con las filas de
--    mas calculadas antes de tocar nada.
--
-- 2) Las filas desactivadas podian tener datos (telefono, correo, ruc,
--    direccion, localidad, region, sucursal) que la fila conservada nunca
--    tuvo cargados (ej. telefono, que ni existia como columna hasta esta
--    misma sesion). Se completaron esos huecos en la fila conservada
--    tomando el valor del duplicado desactivado, solo cuando el campo de
--    la conservada estaba vacio (coalesce, nunca se piso un valor ya
--    cargado). Resultado: 1.461 clientes completados.
--
-- 3) El telefono/correo del cliente solo se mostraba en "Datos generales"
--    de la ficha -- el resto de la app (listado del parque, seccion
--    Contactos) muestra datos a traves de un contacto en
--    contactos_cliente, no del campo propio del cliente. Se creo un
--    contacto principal (es_principal = true) para los clientes activos
--    que tenian telefono/correo pero ningun contacto cargado todavia.
--    Resultado: 2.071 contactos principales creados.
--
-- Los 3 pasos son re-ejecutables sin riesgo: el paso 1 no encuentra mas
-- duplicados activos (ya se corrigieron), el paso 2 y 3 solo actuan sobre
-- huecos vacios / ausencia de contacto, asi que si ya se completaron no
-- hacen nada de nuevo.

-- Paso 1: fusion de duplicados (reasignar vinculos + desactivar perdedoras)
create temporary table cliente_merge_plan as
with grupos as (
  select
    c.id,
    lower(trim(c.nombre)) as clave,
    c.creado_en,
    (select count(*) from public.parque_maquinas m where m.cliente_id = c.id) as maquinas,
    (select count(*) from public.facturacion f where f.cliente_id = c.id) as facturas,
    (select count(*) from public.contactos_cliente cc where cc.cliente_id = c.id) as contactos,
    (select count(*) from public.servicios s where s.cliente_id = c.id) as servicios,
    (select count(*) from public.seguimiento_comercial sc where sc.cliente_id = c.id) as seguimientos
  from public.clientes c
  where c.activo = true
),
rankeados as (
  select *,
    rank() over (
      partition by clave
      order by (maquinas+facturas+contactos+servicios+seguimientos) desc, creado_en asc, id::text asc
    ) as prioridad
  from grupos
),
duplicados as (
  select clave from rankeados group by clave having count(*) > 1
)
select r.id, r.prioridad,
  first_value(r.id) over (partition by r.clave order by r.prioridad) as keeper_id
from rankeados r
join duplicados d on d.clave = r.clave;

update public.parque_maquinas m set cliente_id = p.keeper_id
  from cliente_merge_plan p where m.cliente_id = p.id and p.prioridad > 1;
update public.facturacion f set cliente_id = p.keeper_id
  from cliente_merge_plan p where f.cliente_id = p.id and p.prioridad > 1;
update public.contactos_cliente cc set cliente_id = p.keeper_id
  from cliente_merge_plan p where cc.cliente_id = p.id and p.prioridad > 1;
update public.servicios s set cliente_id = p.keeper_id
  from cliente_merge_plan p where s.cliente_id = p.id and p.prioridad > 1;
update public.seguimiento_comercial sc set cliente_id = p.keeper_id
  from cliente_merge_plan p where sc.cliente_id = p.id and p.prioridad > 1;

update public.clientes
set activo = false
where id in (select id from cliente_merge_plan where prioridad > 1);

drop table cliente_merge_plan;

-- Paso 2: completar huecos en la fila conservada con datos del duplicado
update public.clientes keeper
set
  telefono = coalesce(keeper.telefono, dup.telefono),
  correo_principal = coalesce(keeper.correo_principal, dup.correo_principal),
  ruc = coalesce(keeper.ruc, dup.ruc),
  direccion = coalesce(keeper.direccion, dup.direccion),
  localidad = coalesce(keeper.localidad, dup.localidad),
  region = coalesce(keeper.region, dup.region),
  sucursal = coalesce(keeper.sucursal, dup.sucursal)
from public.clientes dup
where keeper.activo = true
  and dup.activo = false
  and lower(trim(dup.nombre)) = lower(trim(keeper.nombre))
  and (
    (keeper.telefono is null and dup.telefono is not null) or
    (keeper.correo_principal is null and dup.correo_principal is not null) or
    (keeper.ruc is null and dup.ruc is not null) or
    (keeper.direccion is null and dup.direccion is not null) or
    (keeper.localidad is null and dup.localidad is not null) or
    (keeper.region is null and dup.region is not null) or
    (keeper.sucursal is null and dup.sucursal is not null)
  );

-- Paso 3: crear contacto principal para clientes con telefono/correo sin ningun contacto
insert into public.contactos_cliente (cliente_id, nombre, telefono, correo, es_principal)
select c.id, c.nombre, c.telefono, c.correo_principal, true
from public.clientes c
where c.activo = true
  and (c.telefono is not null or c.correo_principal is not null)
  and not exists (select 1 from public.contactos_cliente cc where cc.cliente_id = c.id);
