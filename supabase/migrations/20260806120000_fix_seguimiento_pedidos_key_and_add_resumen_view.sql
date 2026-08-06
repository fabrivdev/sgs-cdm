-- Correccion del mismo bug de clave que ya arreglamos en compras_pedidos:
-- seguimiento_pedidos tenia nro_pedido como clave unica, pero ese numero
-- se numera POR SUCURSAL en TOTVS (no globalmente) -- sin sucursal en la
-- clave, dos pedidos de distinta sucursal con el mismo numero pisarian el
-- mismo seguimiento. Tabla confirmada sin uso todavia (recien se va a
-- construir su UI), asi que no hay datos que migrar.

alter table public.seguimiento_pedidos add column if not exists sucursal public.sucursal;

alter table public.seguimiento_pedidos drop constraint if exists seguimiento_pedidos_pkey;
alter table public.seguimiento_pedidos add primary key (sucursal, nro_pedido);

-- Vista de apoyo: un pedido agrupado (no por linea) con su gasto total,
-- proveedor y cantidad de items, mas el seguimiento manual si existe.
-- Evita repetir esta agregacion en cada consulta del frontend.
create or replace view public.v_compras_pedidos_resumen as
select
  cp.sucursal,
  cp.nro_pedido,
  min(cp.fecha_emision) as fecha_emision,
  max(cp.proveedor_codigo) as proveedor_codigo,
  max(cp.proveedor_nombre) as proveedor_nombre,
  max(cp.moneda) as moneda,
  count(*) as cantidad_items,
  sum(cp.valor_total) as valor_total,
  sum(cp.cantidad_pendiente) as cantidad_pendiente_total,
  coalesce(sp.estado_seguimiento, 'Sin gestionar') as estado_seguimiento,
  sp.fecha_estimada_llegada,
  sp.nro_seguimiento,
  sp.notas,
  sp.actualizado_en as seguimiento_actualizado_en
from public.compras_pedidos cp
left join public.seguimiento_pedidos sp
  on sp.sucursal = cp.sucursal and sp.nro_pedido = cp.nro_pedido
group by cp.sucursal, cp.nro_pedido, sp.estado_seguimiento, sp.fecha_estimada_llegada,
  sp.nro_seguimiento, sp.notas, sp.actualizado_en;

-- Sin esto, la vista corre con los permisos del dueno de la vista (el rol
-- de migracion, que no esta sujeto a RLS) en vez de los del usuario que
-- consulta -- efectivamente saltandose las policies de compras_pedidos y
-- seguimiento_pedidos. Mismo ajuste que ya hizo falta antes para
-- trabajos_horas.
alter view public.v_compras_pedidos_resumen set (security_invoker = true);
