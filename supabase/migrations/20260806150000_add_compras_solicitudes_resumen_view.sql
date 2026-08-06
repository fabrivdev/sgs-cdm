-- Resumen de solicitudes de compra agrupado por (sucursal, nro_solicitud),
-- mismo criterio que v_compras_pedidos_resumen: solo lineas de repuesto
-- (REP%), VEIC/otros excluidos para mantener consistencia con Compras.

create or replace view public.v_compras_solicitudes_resumen as
select
  cs.sucursal,
  cs.nro_solicitud,
  min(cs.fecha_emision) as fecha_emision,
  max(cs.solicitante) as solicitante,
  max(cs.moneda) as moneda,
  count(*) as cantidad_items,
  sum(cs.valor_total) as valor_total
from public.compras_solicitudes cs
where cs.producto_codigo ilike 'REP%'
group by cs.sucursal, cs.nro_solicitud;

alter view public.v_compras_solicitudes_resumen set (security_invoker = true);
