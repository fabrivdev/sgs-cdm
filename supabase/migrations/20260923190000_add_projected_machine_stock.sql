-- Stock proyectado de maquinas nuevas desde la apertura validada del 31/08/2026.
-- A = stock fisico; B = ordenes de compra; D = ventas pendientes.
-- Una factura/NC mueve stock al emitirse; la entrega fisica no participa.

BEGIN;

CREATE TABLE IF NOT EXISTS public.parque_stock_proyectado_apertura (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_corte date NOT NULL,
  programa text NOT NULL,
  marca text NOT NULL,
  tipo text NOT NULL,
  modelo text NOT NULL,
  modelo_clave text GENERATED ALWAYS AS (public.parque_modelo_clave(modelo)) STORED,
  stock_inicial numeric NOT NULL DEFAULT 0,
  pedidos_compra_inicial numeric NOT NULL DEFAULT 0,
  ventas_pendientes_inicial numeric NOT NULL DEFAULT 0,
  fuente text NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parque_stock_proyectado_apertura_fecha CHECK (fecha_corte = date '2026-08-31'),
  CONSTRAINT parque_stock_proyectado_apertura_no_negativo CHECK (
    stock_inicial >= 0 AND pedidos_compra_inicial >= 0 AND ventas_pendientes_inicial >= 0
  ),
  UNIQUE (fecha_corte, programa, marca, modelo_clave)
);

CREATE TABLE IF NOT EXISTS public.parque_stock_proyectado_ajustes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha date NOT NULL CHECK (fecha >= date '2026-09-01'),
  marca text NOT NULL,
  tipo text NOT NULL,
  modelo text NOT NULL,
  stock_delta numeric NOT NULL DEFAULT 0,
  pedidos_compra_delta numeric NOT NULL DEFAULT 0,
  ventas_pendientes_delta numeric NOT NULL DEFAULT 0,
  motivo text NOT NULL CHECK (btrim(motivo) <> ''),
  referencia text,
  creado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parque_stock_proyectado_ajuste_util CHECK (
    stock_delta <> 0 OR pedidos_compra_delta <> 0 OR ventas_pendientes_delta <> 0
  )
);

ALTER TABLE public.parque_stock_proyectado_apertura ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parque_stock_proyectado_ajustes ENABLE ROW LEVEL SECURITY;

-- La apertura reproduce el informe CDM - Compras_Maquinas vs Vtas.xlsx.
-- El programa CLAAS conserva las dos referencias auxiliares incluidas en ese total.
INSERT INTO public.parque_stock_proyectado_apertura
  (fecha_corte, programa, marca, tipo, modelo, stock_inicial, pedidos_compra_inicial, ventas_pendientes_inicial, fuente)
VALUES
  ('2026-08-31','CLAAS','CLAAS','COSECHADORAS','LEXION 7600',2,4,1,'CDM - Compras_Maquinas vs Vtas.xlsx'),
  ('2026-08-31','CLAAS','CLAAS','COSECHADORAS','TRION 710',0,3,1,'CDM - Compras_Maquinas vs Vtas.xlsx'),
  ('2026-08-31','CLAAS','CLAAS','COSECHADORAS','TRION 740',1,0,1,'CDM - Compras_Maquinas vs Vtas.xlsx'),
  ('2026-08-31','CLAAS','CLAAS','COSECHADORAS','TRION 750',1,0,0,'CDM - Compras_Maquinas vs Vtas.xlsx'),
  ('2026-08-31','CLAAS','CLAAS','PICADORAS','JAGUAR 950',1,1,1,'CDM - Compras_Maquinas vs Vtas.xlsx'),
  ('2026-08-31','CLAAS','CLAAS','TRACTORES','AXION 870',0,8,0,'CDM - Compras_Maquinas vs Vtas.xlsx'),
  ('2026-08-31','CLAAS','CLAAS','TRACTORES','AXION 950 STAGE IIIA',1,0,0,'CDM - Compras_Maquinas vs Vtas.xlsx'),
  ('2026-08-31','CLAAS','CLAAS','PLATAFORMAS/CABEZALES','CONVIO FLEX 1080',0,3,2,'CDM - Compras_Maquinas vs Vtas.xlsx'),
  ('2026-08-31','CLAAS','CLAAS','PLATAFORMAS/CABEZALES','CONVIO FLEX 1230',2,0,1,'CDM - Compras_Maquinas vs Vtas.xlsx'),
  ('2026-08-31','CLAAS','CLAAS','PLATAFORMAS/CABEZALES','CONVIO FLEX 1380',1,1,0,'CDM - Compras_Maquinas vs Vtas.xlsx'),
  ('2026-08-31','CLAAS','CLAAS','PLATAFORMAS/CABEZALES','ARROCERA 7,50M',1,0,0,'CDM - Compras_Maquinas vs Vtas.xlsx'),
  ('2026-08-31','CLAAS','CLAAS','PLATAFORMAS/CABEZALES','MAXFLEX 1200',1,0,0,'CDM - Compras_Maquinas vs Vtas.xlsx'),
  ('2026-08-31','CLAAS','CLAAS','PLATAFORMAS/CABEZALES','DIRECT DISC 600',0,1,1,'CDM - Compras_Maquinas vs Vtas.xlsx'),
  ('2026-08-31','CLAAS','CLAAS','PICADORAS','ORBIS 750',2,0,0,'CDM - Compras_Maquinas vs Vtas.xlsx'),
  ('2026-08-31','CLAAS','CLAAS','PLATAFORMAS/CABEZALES','CONVIO FLEX 930',3,0,0,'CDM - Compras_Maquinas vs Vtas.xlsx'),
  ('2026-08-31','CLAAS','NB','PLATAFORMAS/CABEZALES','NB MAICERO 20L X 45CM',1,0,0,'CDM - Compras_Maquinas vs Vtas.xlsx'),
  ('2026-08-31','CLAAS','CLAAS','IMPLEMENTOS AGRICOLAS','CARRO TRANSPORTADOR PLATAFORMAS',1,0,0,'CDM - Compras_Maquinas vs Vtas.xlsx'),
  ('2026-08-31','HORSCH','HORSCH','SEMBRADORAS','MAESTRO 40 GV F E45',0,0,0,'CDM - Compras_Maquinas vs Vtas.xlsx'),
  ('2026-08-31','HORSCH','HORSCH','SEMBRADORAS','EVOLUTION 24.45',1,0,0,'CDM - Compras_Maquinas vs Vtas.xlsx'),
  ('2026-08-31','HORSCH','HORSCH','SEMBRADORAS','EVOLUTION 32',0,1,0,'CDM - Compras_Maquinas vs Vtas.xlsx'),
  ('2026-08-31','HORSCH','HORSCH','SEMBRADORAS','MAESTRO CF 18.50',5,0,0,'CDM - Compras_Maquinas vs Vtas.xlsx'),
  ('2026-08-31','HORSCH','HORSCH','SEMBRADORAS','MAESTRO CF 18.45',5,0,0,'CDM - Compras_Maquinas vs Vtas.xlsx'),
  ('2026-08-31','HORSCH','HORSCH','SEMBRADORAS','MAESTRO CF 16.45',0,2,0,'CDM - Compras_Maquinas vs Vtas.xlsx'),
  ('2026-08-31','HORSCH','HORSCH','SEMBRADORAS','MAESTRO CF 14.50',0,0,0,'CDM - Compras_Maquinas vs Vtas.xlsx'),
  ('2026-08-31','HORSCH','HORSCH','PULVERIZADORAS','LEEB 5.280 VL',2,0,1,'CDM - Compras_Maquinas vs Vtas.xlsx'),
  ('2026-08-31','HORSCH','HORSCH','PULVERIZADORAS','LEEB 6.280 VL',0,1,1,'CDM - Compras_Maquinas vs Vtas.xlsx'),
  ('2026-08-31','HORSCH','HORSCH','SUELO','JOKER 7 RT+',1,0,0,'CDM - Compras_Maquinas vs Vtas.xlsx'),
  ('2026-08-31','HORSCH','HORSCH','SUELO','JOKER 6 RT+',1,0,0,'CDM - Compras_Maquinas vs Vtas.xlsx'),
  ('2026-08-31','HORSCH','HORSCH','SUELO','JOKER 5 RT+',1,0,0,'CDM - Compras_Maquinas vs Vtas.xlsx'),
  ('2026-08-31','HORSCH','HORSCH','SUELO','KNIFER ROLLER CULTRO 9TC',2,0,0,'CDM - Compras_Maquinas vs Vtas.xlsx')
ON CONFLICT (fecha_corte, programa, marca, modelo_clave) DO UPDATE
SET tipo = EXCLUDED.tipo,
    modelo = EXCLUDED.modelo,
    stock_inicial = EXCLUDED.stock_inicial,
    pedidos_compra_inicial = EXCLUDED.pedidos_compra_inicial,
    ventas_pendientes_inicial = EXCLUDED.ventas_pendientes_inicial,
    fuente = EXCLUDED.fuente;

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
    SELECT upper(btrim(coalesce(p_marca,''))) AS marca,
      upper(btrim(coalesce(p_tipo,''))) AS tipo,
      public.parque_modelo_clave(p_modelo) AS modelo_clave
  ), resuelto AS (
    SELECT c.marca_nombre AS marca, c.subgrupo::text AS tipo,
      c.nombre AS modelo, c.clave_normalizada AS modelo_clave, 0 AS prioridad
    FROM entrada e
    JOIN public.parque_modelos_catalogo c
      ON c.clave_normalizada=e.modelo_clave
     AND (e.marca='' OR public.maquinaria_normalizar_marca(c.marca_nombre)=public.maquinaria_normalizar_marca(e.marca))
    UNION ALL
    SELECT c.marca_nombre, c.subgrupo::text, c.nombre, c.clave_normalizada, 1
    FROM entrada e
    JOIN public.parque_modelos_alias a ON a.clave_alias=e.modelo_clave
    JOIN public.parque_modelos_catalogo c ON c.id=a.modelo_catalogo_id
    WHERE e.marca='' OR public.maquinaria_normalizar_marca(c.marca_nombre)=public.maquinaria_normalizar_marca(e.marca)
  )
  SELECT r.marca,r.tipo,r.modelo,r.modelo_clave FROM resuelto r
  ORDER BY r.prioridad LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.parque_stock_proyectado_identidad(text,text,text) FROM PUBLIC, anon, authenticated;

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
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(),'parque.stock') THEN
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
      coalesce(v.marca,v.proveedor) AS marca,
      v.producto AS tipo,v.modelo
    FROM public.maquinaria_importacion_unidades_operativas v
    LEFT JOIN public.maquinaria_operacion_lineas l ON l.id=v.linea_id
    WHERE v.activa AND coalesce(l.condicion,'NUEVA')='NUEVA'
      AND ((v.fecha_pedido>v_apertura AND v.fecha_pedido<=p_corte)
        OR (v.ata>v_apertura AND v.ata<=p_corte))
  ), importaciones AS MATERIALIZED (
    SELECT coalesce(i.marca,upper(btrim(r.marca))) AS marca,
      coalesce(i.tipo,upper(btrim(r.tipo))) AS tipo,
      coalesce(i.modelo,public.parque_modelo_nombre(r.modelo)) AS modelo,
      coalesce(i.modelo_clave,public.parque_modelo_clave(r.modelo)) AS modelo_clave,
      count(*) FILTER (WHERE r.fecha_pedido>v_apertura AND r.fecha_pedido<=p_corte)::numeric AS pedidos_nuevos,
      count(*) FILTER (WHERE r.ata>v_apertura AND r.ata<=p_corte)::numeric AS arribos
    FROM importaciones_raw r
    LEFT JOIN LATERAL public.parque_stock_proyectado_identidad(r.marca,r.tipo,r.modelo) i ON true
    GROUP BY 1,2,3,4
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
  ), pedidos AS MATERIALIZED (
    SELECT coalesce(i.marca,upper(btrim(r.marca))) AS marca,
      coalesce(i.tipo,upper(btrim(r.tipo))) AS tipo,
      coalesce(i.modelo,public.parque_modelo_nombre(r.modelo)) AS modelo,
      coalesce(i.modelo_clave,public.parque_modelo_clave(r.modelo)) AS modelo_clave,
      sum(r.cantidad)::numeric AS pedidos_cliente_nuevos
    FROM pedidos_raw r
    LEFT JOIN LATERAL public.parque_stock_proyectado_identidad(r.marca,r.tipo,r.modelo) i ON true
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
       * greatest(abs(coalesce(nullif(m.cantidad,0),1)),1))::numeric AS unidades,
      (m.pedido_condicion='NUEVA') AS vinculada_pedido
    FROM ventas_fuente m
    WHERE CASE
      WHEN upper(concat_ws(' ',m.pedido_condicion,m.condicion_fuente,m.descripcion)) LIKE '%USAD%' THEN false
      WHEN upper(concat_ws(' ',m.pedido_condicion,m.condicion_fuente,m.descripcion)) LIKE '%NUEV%' THEN true
      ELSE false
    END
  ), ventas AS MATERIALIZED (
    SELECT coalesce(i.marca,upper(btrim(r.marca))) AS marca,
      coalesce(i.tipo,'OTRO') AS tipo,
      coalesce(i.modelo,public.parque_modelo_nombre(r.modelo)) AS modelo,
      coalesce(i.modelo_clave,public.parque_modelo_clave(r.modelo)) AS modelo_clave,
      sum(r.unidades)::numeric AS ventas_netas,
      sum(r.unidades) FILTER (WHERE r.vinculada_pedido)::numeric AS ventas_pedido_netas
    FROM ventas_raw r
    LEFT JOIN LATERAL public.parque_stock_proyectado_identidad(r.marca,r.tipo,r.modelo) i ON true
    WHERE public.parque_modelo_clave(r.modelo)<>''
    GROUP BY 1,2,3,4
  ), ajustes AS MATERIALIZED (
    SELECT coalesce(i.marca,upper(btrim(a.marca))) AS marca,
      coalesce(i.tipo,upper(btrim(a.tipo))) AS tipo,
      coalesce(i.modelo,public.parque_modelo_nombre(a.modelo)) AS modelo,
      coalesce(i.modelo_clave,public.parque_modelo_clave(a.modelo)) AS modelo_clave,
      sum(a.stock_delta)::numeric AS stock_delta,
      sum(a.pedidos_compra_delta)::numeric AS pedidos_compra_delta,
      sum(a.ventas_pendientes_delta)::numeric AS ventas_pendientes_delta
    FROM public.parque_stock_proyectado_ajustes a
    LEFT JOIN LATERAL public.parque_stock_proyectado_identidad(a.marca,a.tipo,a.modelo) i ON true
    WHERE a.fecha<=p_corte
    GROUP BY 1,2,3,4
  ), llaves AS (
    SELECT marca,modelo_clave FROM apertura UNION
    SELECT marca,modelo_clave FROM importaciones UNION
    SELECT marca,modelo_clave FROM pedidos UNION
    SELECT marca,modelo_clave FROM ventas UNION
    SELECT marca,modelo_clave FROM ajustes
  ), calculo AS (
    SELECT coalesce(a.programa,a.marca,im.marca,p.marca,v.marca,aj.marca,'OTROS') AS programa,
      coalesce(a.marca,im.marca,p.marca,v.marca,aj.marca,'OTROS') AS marca,
      coalesce(a.tipo,im.tipo,p.tipo,v.tipo,aj.tipo,'OTRO') AS tipo,
      coalesce(a.modelo,im.modelo,p.modelo,v.modelo,aj.modelo,'MODELO NO INFORMADO') AS modelo,
      coalesce(a.stock_inicial,0)+coalesce(im.arribos,0)-coalesce(v.ventas_netas,0)+coalesce(aj.stock_delta,0) AS stock,
      coalesce(a.pedidos_compra_inicial,0)+coalesce(im.pedidos_nuevos,0)-coalesce(im.arribos,0)+coalesce(aj.pedidos_compra_delta,0) AS pedidos_compra,
      coalesce(a.ventas_pendientes_inicial,0)+coalesce(p.pedidos_cliente_nuevos,0)-coalesce(v.ventas_pedido_netas,0)+coalesce(aj.ventas_pendientes_delta,0) AS ventas_pendientes,
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

REVOKE ALL ON TABLE public.parque_stock_proyectado_apertura FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.parque_stock_proyectado_ajustes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parque_stock_proyectado_v1(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parque_stock_proyectado_v1(date) TO authenticated;

COMMENT ON FUNCTION public.parque_stock_proyectado_v1(date) IS
  'Reconstruye maquinas nuevas desde 31/08/2026: A stock + arribos - facturas + NC; B OC - arribos; D pedidos cliente - facturas vinculadas por chasis; proyectado=A+B-D. No usa entrega.';

COMMIT;

NOTIFY pgrst, 'reload schema';
