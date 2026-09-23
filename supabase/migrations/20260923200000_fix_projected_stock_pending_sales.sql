-- Corrige Ventas pendientes: una NP ya facturada no vuelve a sumarse y las
-- facturas posteriores al corte inicial consumen primero el saldo de apertura
-- del mismo modelo. Esto evita dejar, por ejemplo, una TRION 740 pendiente
-- cuando la unidad ya salio de stock por factura.

BEGIN;

INSERT INTO public.app_secciones (id, modulo_id, nombre, orden, activo)
VALUES ('parque.stock_proyectado','parque','Stock proyectado',35,true)
ON CONFLICT (id) DO UPDATE
SET modulo_id=EXCLUDED.modulo_id,
    nombre=EXCLUDED.nombre,
    orden=EXCLUDED.orden,
    activo=EXCLUDED.activo;

-- Mantiene el acceso actual al separar la pantalla. Desde Administración puede
-- retirarse luego sin afectar el permiso de Stock físico.
INSERT INTO public.user_seccion_acceso (user_id,seccion_id)
SELECT acceso.user_id,'parque.stock_proyectado'
FROM public.user_seccion_acceso acceso
WHERE acceso.seccion_id='parque.stock'
ON CONFLICT (user_id,seccion_id) DO NOTHING;

-- OTROS es el valor técnico del enum histórico, no una marca comercial. Cuando
-- aparece, resolver la marca real por el modelo canónico solo si es inequívoca.
CREATE OR REPLACE FUNCTION public.parque_stock_proyectado_identidad(
  p_marca text,
  p_tipo text,
  p_modelo text
)
RETURNS TABLE (marca text, tipo text, modelo text, modelo_clave text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH entrada AS (
    SELECT CASE
        WHEN public.maquinaria_normalizar_marca(coalesce(p_marca,''))='OTROS' THEN ''
        ELSE upper(btrim(coalesce(p_marca,'')))
      END AS marca,
      upper(btrim(coalesce(p_tipo,''))) AS tipo,
      public.parque_modelo_clave(p_modelo) AS modelo_clave
  ), resuelto AS (
    SELECT c.marca_nombre AS marca, c.subgrupo::text AS tipo,
      c.nombre AS modelo, c.clave_normalizada AS modelo_clave,
      e.marca AS marca_entrada, 0 AS prioridad
    FROM entrada e
    JOIN public.parque_modelos_catalogo c
      ON c.clave_normalizada=e.modelo_clave
     AND (e.marca='' OR public.maquinaria_normalizar_marca(c.marca_nombre)=public.maquinaria_normalizar_marca(e.marca))
    UNION ALL
    SELECT c.marca_nombre, c.subgrupo::text, c.nombre, c.clave_normalizada,
      e.marca, 1
    FROM entrada e
    JOIN public.parque_modelos_alias a ON a.clave_alias=e.modelo_clave
    JOIN public.parque_modelos_catalogo c ON c.id=a.modelo_catalogo_id
    WHERE e.marca='' OR public.maquinaria_normalizar_marca(c.marca_nombre)=public.maquinaria_normalizar_marca(e.marca)
  )
  SELECT r.marca,r.tipo,r.modelo,r.modelo_clave
  FROM resuelto r
  WHERE r.marca_entrada<>'' OR (
    SELECT count(DISTINCT public.maquinaria_normalizar_marca(x.marca)) FROM resuelto x
  )=1
  ORDER BY r.prioridad LIMIT 1
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
    SELECT programa,marca,tipo,modelo,modelo_clave,
      stock_inicial,pedidos_compra_inicial,ventas_pendientes_inicial
    FROM public.parque_stock_proyectado_apertura WHERE fecha_corte=v_apertura
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
    WHERE public.parque_modelo_clave(r.modelo)<>''
      AND coalesce(i.marca,nullif(upper(btrim(r.marca)),'OTROS')) IS NOT NULL
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
  ), llaves AS (
    SELECT marca,modelo_clave FROM apertura UNION
    SELECT marca,modelo_clave FROM importaciones UNION
    SELECT marca,modelo_clave FROM pedidos UNION
    SELECT marca,modelo_clave FROM ventas UNION
    SELECT marca,modelo_clave FROM ajustes
  ), calculo AS (
    SELECT coalesce(a.programa,a.marca,im.marca,p.marca,v.marca,aj.marca) AS programa,
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
    'filas',coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.programa,f.marca,f.tipo,f.modelo),'[]'::jsonb)
  ) INTO v_resultado FROM filas f;

  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.parque_stock_proyectado_v1(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parque_stock_proyectado_v1(date) TO authenticated;

COMMENT ON FUNCTION public.parque_stock_proyectado_v1(date) IS
  'Reconstruye maquinas nuevas desde 31/08/2026. Ventas posteriores consumen primero pendientes de apertura (FIFO por modelo); NP facturadas por chasis no vuelven a sumarse, OC pendientes nunca es negativa y OTROS no se expone como marca. Entrega no interviene.';

COMMIT;

NOTIFY pgrst, 'reload schema';
