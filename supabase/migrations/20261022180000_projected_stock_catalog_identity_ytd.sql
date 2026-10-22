-- Draft replacement, not applied. Replaces the abandoned coverage-table draft.
-- YTD is read separately from the existing ventas_maquinas_dashboard_filtros_v2 RPC.
-- Source-specific reconciliation explicitly requested for Evolution 32; not a global alias.
-- Original source names and quantities remain untouched. Unknown/ambiguous names retain separate groups.
BEGIN;
DO $$ BEGIN
 IF md5(pg_get_functiondef('public.parque_stock_proyectado_v1(date)'::regprocedure))<>'b5666edb97fd5237315c395a4050199f'
 OR md5(pg_get_functiondef('public.parque_stock_proyectado_identidad(text,text,text)'::regprocedure))<>'a94071466c473e5499e2de1b4c1aa1e7'
 THEN RAISE EXCEPTION 'Backend changed since read-only preflight; review before applying'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.parque_modelos_catalogo WHERE id='05316101-3167-4f38-a609-33dbbd36b9d1' AND activo AND marca_nombre='HORSCH' AND nombre='MAESTRO EVOLUTION 32' AND subgrupo::text='SEMBRADORAS')
 OR NOT EXISTS(SELECT 1 FROM public.parque_stock_proyectado_apertura WHERE id='c0a681ee-8ff2-426d-932c-4338578531b1' AND fecha_corte='2026-08-31' AND marca='HORSCH' AND modelo='EVOLUTION 32' AND stock_inicial=0 AND pedidos_compra_inicial=1 AND ventas_pendientes_inicial=0)
 THEN RAISE EXCEPTION 'Reviewed source/catalog identity changed'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.parque_stock_proyectado_identidad(p_marca text,p_tipo text,p_modelo text)
RETURNS TABLE(marca text,tipo text,modelo text,modelo_clave text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
WITH entrada AS (
 SELECT nullif(public.maquinaria_normalizar_marca(p_marca),'OTROS') AS marca,
 upper(btrim(coalesce(p_tipo,'OTRO'))) AS tipo,public.parque_modelo_clave(p_modelo) AS clave
), candidatos AS (
 SELECT DISTINCT c.id,c.marca_nombre,c.subgrupo,c.nombre,
 CASE WHEN c.clave_normalizada=e.clave THEN 0 ELSE 1 END AS prioridad
 FROM entrada e JOIN public.parque_modelos_catalogo c ON c.activo
 AND (e.marca IS NULL OR public.maquinaria_normalizar_marca(c.marca_nombre)=e.marca)
 WHERE e.clave<>'' AND (c.clave_normalizada=e.clave OR EXISTS(
 SELECT 1 FROM public.parque_modelos_alias a WHERE a.modelo_catalogo_id=c.id AND a.clave_alias=e.clave
 AND a.marca=c.marca AND (a.revisado_manual OR regexp_replace(a.clave_alias,'[^0-9]','','g')=regexp_replace(c.clave_normalizada,'[^0-9]','','g'))))
), preferidos AS (
 SELECT * FROM candidatos WHERE prioridad=(SELECT min(prioridad) FROM candidatos)
), seleccion AS (
 SELECT c.* FROM preferidos c,entrada e WHERE c.subgrupo::text=e.tipo
 OR NOT EXISTS(SELECT 1 FROM preferidos p WHERE p.subgrupo::text=e.tipo)
), unico AS (SELECT * FROM seleccion WHERE (SELECT count(*) FROM seleccion)=1)
SELECT coalesce(c.marca_nombre,e.marca,'OTROS'),coalesce(c.subgrupo::text,e.tipo),
 coalesce(c.nombre,nullif(upper(btrim(p_modelo)),''),'MODELO NO INFORMADO'),
 coalesce(c.id::text,'sin_catalogo:'||jsonb_build_array(e.marca,e.tipo,coalesce(nullif(upper(btrim(p_modelo)),''),'MODELO NO INFORMADO'))::text)
FROM entrada e LEFT JOIN unico c ON true;
$$;

CREATE OR REPLACE FUNCTION public.parque_stock_proyectado_v1(p_corte date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '120s'
AS $$
DECLARE
  v_apertura constant date := date '2026-08-31';
  v_resultado jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(),'parque.stock_proyectado') THEN
    RAISE EXCEPTION 'Sin permiso para consultar stock de máquinas' USING ERRCODE='42501';
  END IF;
  IF p_corte IS NULL OR p_corte < v_apertura THEN
    RAISE EXCEPTION 'El stock proyectado está disponible desde el 31/08/2026' USING ERRCODE='22023';
  END IF;
  IF p_corte > current_date THEN
    RAISE EXCEPTION 'La fecha de corte no puede ser futura' USING ERRCODE='22023';
  END IF;

  WITH apertura AS MATERIALIZED (
    SELECT i.marca AS programa,i.marca,i.tipo,i.modelo,i.modelo_clave,
      sum(a.stock_inicial) AS stock_inicial,sum(a.pedidos_compra_inicial) AS pedidos_compra_inicial,
      sum(a.ventas_pendientes_inicial) AS ventas_pendientes_inicial
    FROM public.parque_stock_proyectado_apertura a
    CROSS JOIN LATERAL public.parque_stock_proyectado_identidad(a.marca,a.tipo,
      CASE WHEN a.id='c0a681ee-8ff2-426d-932c-4338578531b1'::uuid
        AND a.fecha_corte=date '2026-08-31' AND a.marca='HORSCH' AND a.modelo='EVOLUTION 32'
        THEN (SELECT nombre FROM public.parque_modelos_catalogo
          WHERE id='05316101-3167-4f38-a609-33dbbd36b9d1'::uuid AND activo)
        ELSE a.modelo END) i
    WHERE a.fecha_corte=v_apertura GROUP BY i.marca,i.tipo,i.modelo,i.modelo_clave
  ), importaciones_raw AS MATERIALIZED (
    SELECT v.id,v.fecha_pedido,v.ata,
      coalesce(nullif(upper(btrim(v.marca)),'OTROS'),nullif(upper(btrim(v.proveedor)),'OTROS')) AS marca,
      v.producto AS tipo,v.modelo
    FROM public.maquinaria_importacion_unidades_operativas v
    LEFT JOIN public.maquinaria_operacion_lineas l ON l.id=v.linea_id
    WHERE v.activa AND coalesce(l.condicion,'NUEVA')='NUEVA'
      AND ((v.fecha_pedido>v_apertura AND v.fecha_pedido<=p_corte)
        OR (v.ata>v_apertura AND v.ata<=p_corte))
  ), importaciones AS MATERIALIZED (
    SELECT coalesce(i.marca,nullif(upper(btrim(r.marca)),'OTROS')) AS marca,
      coalesce(i.tipo,upper(btrim(r.tipo))) AS tipo,
      coalesce(i.modelo,public.parque_modelo_nombre(r.modelo)) AS modelo,
      coalesce(i.modelo_clave,public.parque_modelo_clave(r.modelo)) AS modelo_clave,
      count(*) FILTER (WHERE r.fecha_pedido>v_apertura AND r.fecha_pedido<=p_corte)::numeric AS pedidos_nuevos,
      count(*) FILTER (WHERE r.ata>v_apertura AND r.ata<=p_corte)::numeric AS arribos
    FROM importaciones_raw r
    LEFT JOIN LATERAL public.parque_stock_proyectado_identidad(r.marca,r.tipo,r.modelo) i ON true
    WHERE coalesce(i.marca,nullif(upper(btrim(r.marca)),'OTROS')) IS NOT NULL
    GROUP BY 1,2,3,4
  ), ventas_fuente AS MATERIALIZED (
    SELECT m.*,
      pedido.marca AS pedido_marca,pedido.producto AS pedido_tipo,
      pedido.modelo AS pedido_modelo,pedido.condicion AS pedido_condicion,
      pedido.np_fecha AS pedido_fecha
    FROM public.ventas_maquinas_fuente_v2(v_apertura+1,p_corte,NULL) m
    LEFT JOIN LATERAL (
      SELECT p.marca,p.producto,p.modelo,p.condicion,p.np_fecha
      FROM public.maquinaria_pedidos_lineas_estado_actual p
      WHERE public.normalizar_chasis_notificacion(m.chasis) IS NOT NULL
        AND public.normalizar_chasis_notificacion(p.chasis)=public.normalizar_chasis_notificacion(m.chasis)
        AND p.np_fecha<=m.fecha
        AND (p.estado_operacion<>'CANCELADA' OR p.actualizado_en::date>m.fecha)
      ORDER BY p.np_fecha DESC NULLS LAST,p.actualizado_en DESC LIMIT 1
    ) pedido ON true
    WHERE m.metodologia='actual'
  ), ventas_raw AS MATERIALIZED (
    SELECT m.fecha,m.factura,coalesce(m.pedido_marca,m.marca) AS marca,
      coalesce(m.pedido_tipo,m.tipo_maquina) AS tipo,
      coalesce(m.pedido_modelo,m.modelo) AS modelo,m.chasis,m.es_nota_credito,
      (CASE WHEN m.es_nota_credito OR m.total_venta<0 THEN -1 ELSE 1 END
       * greatest(abs(coalesce(nullif(m.cantidad,0),1)),1))::numeric AS unidades
    FROM ventas_fuente m
    WHERE CASE
      WHEN upper(concat_ws(' ',m.pedido_condicion,m.condicion_fuente,m.descripcion)) LIKE '%USAD%' THEN false
      WHEN upper(concat_ws(' ',m.pedido_condicion,m.condicion_fuente,m.descripcion)) LIKE '%NUEV%' THEN true
      ELSE false
    END
  ), ventas_por_chasis AS MATERIALIZED (
    SELECT public.normalizar_chasis_notificacion(chasis) AS chasis_clave,
      sum(unidades)::numeric AS unidades_netas
    FROM ventas_raw
    WHERE public.normalizar_chasis_notificacion(chasis) IS NOT NULL
    GROUP BY 1
  ), pedidos_raw AS MATERIALIZED (
    SELECT coalesce(u.id,l.id) AS id,o.np_fecha,
      coalesce(l.marca_nombre,nullif(l.marca::text,'OTROS')) AS marca,
      l.subgrupo::text AS tipo,l.modelo,
      CASE WHEN u.id IS NULL THEN l.cantidad ELSE 1 END::numeric AS cantidad
    FROM public.maquinaria_operaciones o
    JOIN public.maquinaria_operacion_lineas l ON l.operacion_id=o.id
    LEFT JOIN public.maquinaria_unidades_operacion u ON u.linea_id=l.id
    WHERE l.condicion='NUEVA'
      AND (o.estado<>'CANCELADA' OR o.actualizado_en::date>p_corte)
      AND (u.id IS NULL OR u.estado<>'CANCELADA' OR u.actualizado_en::date>p_corte)
      AND o.np_fecha>v_apertura AND o.np_fecha<=p_corte
      AND NOT EXISTS (
        SELECT 1 FROM ventas_por_chasis venta
        WHERE venta.chasis_clave=public.normalizar_chasis_notificacion(u.chasis)
          AND venta.unidades_netas>0
      )
  ), pedidos AS MATERIALIZED (
    SELECT coalesce(i.marca,nullif(upper(btrim(r.marca)),'OTROS')) AS marca,
      coalesce(i.tipo,upper(btrim(r.tipo))) AS tipo,
      coalesce(i.modelo,public.parque_modelo_nombre(r.modelo)) AS modelo,
      coalesce(i.modelo_clave,public.parque_modelo_clave(r.modelo)) AS modelo_clave,
      sum(r.cantidad)::numeric AS pedidos_cliente_nuevos
    FROM pedidos_raw r
    LEFT JOIN LATERAL public.parque_stock_proyectado_identidad(r.marca,r.tipo,r.modelo) i ON true
    WHERE coalesce(i.marca,nullif(upper(btrim(r.marca)),'OTROS')) IS NOT NULL
    GROUP BY 1,2,3,4
  ), ventas AS MATERIALIZED (
    SELECT coalesce(i.marca,nullif(upper(btrim(r.marca)),'OTROS')) AS marca,
      coalesce(i.tipo,'OTRO') AS tipo,
      coalesce(i.modelo,public.parque_modelo_nombre(r.modelo)) AS modelo,
      coalesce(i.modelo_clave,public.parque_modelo_clave(r.modelo)) AS modelo_clave,
      sum(r.unidades)::numeric AS ventas_netas
    FROM ventas_raw r
    LEFT JOIN LATERAL public.parque_stock_proyectado_identidad(r.marca,r.tipo,r.modelo) i ON true
    WHERE coalesce(i.marca,nullif(upper(btrim(r.marca)),'OTROS')) IS NOT NULL
    GROUP BY 1,2,3,4
  ), ajustes AS MATERIALIZED (
    SELECT coalesce(i.marca,nullif(upper(btrim(a.marca)),'OTROS')) AS marca,
      coalesce(i.tipo,upper(btrim(a.tipo))) AS tipo,
      coalesce(i.modelo,public.parque_modelo_nombre(a.modelo)) AS modelo,
      coalesce(i.modelo_clave,public.parque_modelo_clave(a.modelo)) AS modelo_clave,
      sum(a.stock_delta)::numeric AS stock_delta,
      sum(a.pedidos_compra_delta)::numeric AS pedidos_compra_delta,
      sum(a.ventas_pendientes_delta)::numeric AS ventas_pendientes_delta
    FROM public.parque_stock_proyectado_ajustes a
    LEFT JOIN LATERAL public.parque_stock_proyectado_identidad(a.marca,a.tipo,a.modelo) i ON true
    WHERE a.fecha<=p_corte
      AND coalesce(i.marca,nullif(upper(btrim(a.marca)),'OTROS')) IS NOT NULL
    GROUP BY 1,2,3,4
  ), trazas AS (
    SELECT 'apertura' AS fuente,id::text AS referencia,marca,tipo,modelo FROM public.parque_stock_proyectado_apertura WHERE fecha_corte=v_apertura
    UNION ALL SELECT 'importacion',id::text,marca,tipo,modelo FROM importaciones_raw
    UNION ALL SELECT 'venta',factura,marca,tipo,modelo FROM ventas_raw
    UNION ALL SELECT 'pedido',id::text,marca,tipo,modelo FROM pedidos_raw
    UNION ALL SELECT 'ajuste',id::text,marca,tipo,modelo FROM public.parque_stock_proyectado_ajustes WHERE fecha<=p_corte
  ), llaves AS (
    SELECT marca,modelo_clave FROM apertura UNION
    SELECT marca,modelo_clave FROM importaciones UNION
    SELECT marca,modelo_clave FROM pedidos UNION
    SELECT marca,modelo_clave FROM ventas UNION
    SELECT marca,modelo_clave FROM ajustes
  ), calculo AS (
    SELECT CASE WHEN k.modelo_clave LIKE 'sin_catalogo:%' THEN 'sin_coincidencia_o_ambiguo' ELSE 'catalogo' END AS identidad_estado,
      CASE WHEN k.modelo_clave NOT LIKE 'sin_catalogo:%' THEN k.modelo_clave::uuid END AS modelo_catalogo_id,
      coalesce(a.programa,a.marca,im.marca,p.marca,v.marca,aj.marca) AS programa,
      coalesce(a.marca,im.marca,p.marca,v.marca,aj.marca) AS marca,
      coalesce(a.tipo,im.tipo,p.tipo,v.tipo,aj.tipo,'OTRO') AS tipo,
      coalesce(a.modelo,im.modelo,p.modelo,v.modelo,aj.modelo,'MODELO NO INFORMADO') AS modelo,
      coalesce(a.stock_inicial,0)+coalesce(im.arribos,0)-coalesce(v.ventas_netas,0)+coalesce(aj.stock_delta,0) AS stock,
      greatest(
        coalesce(a.pedidos_compra_inicial,0)+coalesce(im.pedidos_nuevos,0)
          -coalesce(im.arribos,0)+coalesce(aj.pedidos_compra_delta,0),
        0
      ) AS pedidos_compra,
      greatest(coalesce(a.ventas_pendientes_inicial,0)-coalesce(v.ventas_netas,0),0)
        +coalesce(p.pedidos_cliente_nuevos,0)+coalesce(aj.ventas_pendientes_delta,0) AS ventas_pendientes,
      coalesce(im.arribos,0) AS arribos_periodo,
      coalesce(v.ventas_netas,0) AS ventas_netas_periodo
    FROM llaves k
    LEFT JOIN apertura a ON a.marca=k.marca AND a.modelo_clave=k.modelo_clave
    LEFT JOIN importaciones im ON im.marca=k.marca AND im.modelo_clave=k.modelo_clave
    LEFT JOIN pedidos p ON p.marca=k.marca AND p.modelo_clave=k.modelo_clave
    LEFT JOIN ventas v ON v.marca=k.marca AND v.modelo_clave=k.modelo_clave
    LEFT JOIN ajustes aj ON aj.marca=k.marca AND aj.modelo_clave=k.modelo_clave
  ), filas AS (
    SELECT *,stock+pedidos_compra AS disponibilidad,
      stock+pedidos_compra-ventas_pendientes AS stock_proyectado
    FROM calculo
  )
  SELECT jsonb_build_object(
    'fecha_corte',p_corte,
    'disponible_desde',v_apertura,
    'solo_nuevas',true,
    'trazabilidad',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM trazas t),
    'filas',coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.programa,f.marca,f.tipo,f.modelo),'[]'::jsonb)
  ) INTO v_resultado FROM filas f;

  RETURN v_resultado;
END;
$$;


-- CREATE OR REPLACE preserves both functions owners and ACL; no RLS, grants or source writes.
COMMIT;
NOTIFY pgrst,'reload schema';
