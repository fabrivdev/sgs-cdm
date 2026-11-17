BEGIN;

-- Conserva las reglas de catálogo, arribos, facturación y OC de la RPC instalada.
DO $migration$
DECLARE
  definition text := pg_get_functiondef('public.parque_stock_proyectado_v1(date)'::regprocedure);
  original_pedidos text := $old$    WHERE l.condicion='NUEVA'
      AND (o.estado<>'CANCELADA' OR o.actualizado_en::date>p_corte)
      AND (u.id IS NULL OR u.estado<>'CANCELADA' OR u.actualizado_en::date>p_corte)
      AND o.np_fecha>v_apertura AND o.np_fecha<=p_corte$old$;
  new_pedidos text := $new$    WHERE l.condicion='NUEVA'
      AND nullif(btrim(o.np_numero),'') IS NOT NULL
      AND o.estado <> 'BORRADOR'
      AND o.np_fecha<=p_corte
      AND (o.estado NOT IN ('CANCELADA','CERRADA')
        OR (o.actualizado_en AT TIME ZONE 'America/Asuncion')::date>p_corte)
      AND (
        (u.id IS NULL AND (o.estado<>'FACTURADA'
          OR (o.actualizado_en AT TIME ZONE 'America/Asuncion')::date>p_corte))
        OR (u.id IS NOT NULL AND (u.estado NOT IN ('CANCELADA','FACTURADA','EN_PARQUE','TRANSFERIDA')
          OR (u.actualizado_en AT TIME ZONE 'America/Asuncion')::date>p_corte))
      )$new$;
  original_total text := $old$greatest(coalesce(a.ventas_pendientes_inicial,0)-coalesce(v.ventas_netas,0),0)
        +coalesce(p.pedidos_cliente_nuevos,0)+coalesce(aj.ventas_pendientes_delta,0) AS ventas_pendientes$old$;
  new_total text := $new$coalesce(p.pedidos_cliente_nuevos,0) AS ventas_pendientes$new$;
BEGIN
  IF strpos(definition,new_pedidos)>0 AND strpos(definition,new_total)>0 THEN
    RETURN;
  END IF;
  IF strpos(definition,original_pedidos)=0 OR strpos(definition,original_total)=0 THEN
    RAISE EXCEPTION 'La definición instalada de Stock proyectado no coincide con la versión esperada';
  END IF;
  EXECUTE replace(replace(definition,original_pedidos,new_pedidos),original_total,new_total);
END;
$migration$;

NOTIFY pgrst, 'reload schema';
COMMIT;
