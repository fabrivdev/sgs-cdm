-- Si TOTVS ya no reporta cantidad pendiente en ningun item de un pedido,
-- se considera recibido automaticamente -- sin que nadie tenga que
-- marcarlo a mano pedido por pedido. Esto es solo un VALOR POR DEFECTO:
-- en cuanto alguien cargue un estado manual distinto de "Sin gestionar"
-- (Solicitado a fabrica / En transito / Recibido explicito), ese valor
-- manual manda siempre, sin importar lo que diga PENDIENTE. No se escribe
-- nada en seguimiento_pedidos por esto -- es una derivacion a nivel de
-- vista, no un dato que se guarda, asi que no interfiere con la garantia
-- de que la tabla de seguimiento nunca se pisa.

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
group by cp.sucursal, cp.nro_pedido, sp.estado_seguimiento, sp.fecha_estimada_llegada,
  sp.nro_seguimiento, sp.notas, sp.actualizado_en;

alter view public.v_compras_pedidos_resumen set (security_invoker = true);
