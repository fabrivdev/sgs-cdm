-- Compras (la pantalla) es especificamente de REPUESTOS: se excluyen del
-- todo (vista y total) las lineas que no son repuesto -- VEIC (maquinas) y
-- GAS (gastos varios, ej. honorarios de escribania, lavado de movil), que
-- TOTVS mezcla en el mismo archivo de pedidos de compra. Decision
-- explicita del usuario, revierte el criterio anterior de "nunca excluir
-- VEIC".
--
-- Efecto real medido: 11 de los 37 pedidos actuales quedan con cero lineas
-- de repuesto (son 100% VEIC/GAS) y por lo tanto desaparecen por completo
-- de esta vista -- no es un bug, es la consecuencia directa de filtrar por
-- REP.

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
  case
    when sp.estado_seguimiento is not null and sp.estado_seguimiento <> 'Sin gestionar'
      then sp.estado_seguimiento
    when sum(cp.cantidad_pendiente) <= 0 then 'Recibido'
    else 'Sin gestionar'
  end as estado_seguimiento,
  sp.fecha_estimada_llegada,
  sp.nro_seguimiento,
  sp.notas,
  sp.actualizado_en as seguimiento_actualizado_en
from public.compras_pedidos cp
left join public.seguimiento_pedidos sp
  on sp.sucursal = cp.sucursal and sp.nro_pedido = cp.nro_pedido
where cp.producto_codigo ilike 'REP%'
group by cp.sucursal, cp.nro_pedido, sp.estado_seguimiento, sp.fecha_estimada_llegada,
  sp.nro_seguimiento, sp.notas, sp.actualizado_en;

alter view public.v_compras_pedidos_resumen set (security_invoker = true);
