-- Mantiene vivo el historial de ventas de repuestos después de cada
-- importación. Trabaja solamente sobre el período importado para evitar el
-- recálculo completo que anteriormente provocaba timeouts.

CREATE OR REPLACE FUNCTION public.repuestos_actualizar_ventas_periodo(
  p_desde date,
  p_hasta date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '45s'
AS $function$
DECLARE
  v_mes_desde date;
  v_mes_hasta date;
  v_lineas integer := 0;
  v_confirmadas integer := 0;
  v_ambiguas integer := 0;
  v_sin_coincidencia integer := 0;
  v_meses integer := 0;
BEGIN
  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde THEN
    RAISE EXCEPTION 'El período de facturación es inválido';
  END IF;

  IF p_hasta > p_desde + 366 THEN
    RAISE EXCEPTION 'La actualización incremental no admite períodos mayores a 367 días';
  END IF;

  -- Durante la migración auth.uid() es nulo. Las llamadas desde la aplicación
  -- siguen exigiendo acceso administrativo al módulo de repuestos.
  IF auth.uid() IS NOT NULL AND (
    NOT public.has_module_access(auth.uid(), 'repuestos')
    OR NOT (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
    )
  ) THEN
    RAISE EXCEPTION 'No tenés permiso para actualizar el historial de repuestos'
      USING ERRCODE = '42501';
  END IF;

  v_mes_desde := date_trunc('month', p_desde)::date;
  v_mes_hasta := date_trunc('month', p_hasta)::date;

  CREATE TEMP TABLE tmp_repuestos_periodo_productos ON COMMIT DROP AS
  SELECT
    p.codigo_interno,
    p.unidad,
    public.normalizar_codigo_repuesto_flexible(p.codigo_interno) AS interno_norm,
    public.normalizar_codigo_repuesto_flexible(p.codigo_fabricante) AS fabricante_norm,
    public.extraer_codigo_repuesto_descripcion(p.descripcion) AS descripcion_norm
  FROM public.productos p
  WHERE p.activo
    AND p.codigo_interno ILIKE 'REP%';

  CREATE UNIQUE INDEX ON tmp_repuestos_periodo_productos(codigo_interno);
  CREATE INDEX ON tmp_repuestos_periodo_productos(interno_norm) WHERE interno_norm IS NOT NULL;
  CREATE INDEX ON tmp_repuestos_periodo_productos(fabricante_norm) WHERE fabricante_norm IS NOT NULL;
  CREATE INDEX ON tmp_repuestos_periodo_productos(descripcion_norm) WHERE descripcion_norm IS NOT NULL;

  CREATE TEMP TABLE tmp_repuestos_periodo_lineas ON COMMIT DROP AS
  SELECT
    f.id,
    f.fecha_factura::date AS fecha_efectiva,
    coalesce(f.marca_normalizada, 'OTROS'::public.marca) AS marca_origen,
    f.moneda,
    coalesce(f.cantidad, 0)::numeric AS cantidad,
    public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia) AS mercaderia_norm,
    public.normalizar_codigo_repuesto_flexible(f.codigo_fabricante) AS fabricante_norm,
    public.extraer_codigo_repuesto_descripcion(f.mercaderia) AS descripcion_norm
  FROM public.facturacion_lineas_importadas f
  WHERE f.fecha_factura::date BETWEEN p_desde AND p_hasta
    AND public.es_linea_facturacion_repuesto(
      f.tipo_facturacion,
      f.grupo_normalizado,
      f.subgrupo_original
    );

  CREATE UNIQUE INDEX ON tmp_repuestos_periodo_lineas(id);
  CREATE INDEX ON tmp_repuestos_periodo_lineas(mercaderia_norm) WHERE mercaderia_norm IS NOT NULL;
  CREATE INDEX ON tmp_repuestos_periodo_lineas(fabricante_norm) WHERE fabricante_norm IS NOT NULL;
  CREATE INDEX ON tmp_repuestos_periodo_lineas(descripcion_norm) WHERE descripcion_norm IS NOT NULL;

  ANALYZE tmp_repuestos_periodo_productos;
  ANALYZE tmp_repuestos_periodo_lineas;

  -- Si una línea dejó de ser repuesto, elimina su vínculo automático. Las
  -- decisiones manuales se conservan siempre.
  DELETE FROM public.repuestos_ventas_vinculacion v
  USING public.facturacion_lineas_importadas f
  WHERE v.linea_id = f.id
    AND f.fecha_factura::date BETWEEN p_desde AND p_hasta
    AND coalesce(v.metodo_vinculo, '') <> 'CODIGO_ANTERIOR_MANUAL'
    AND NOT public.es_linea_facturacion_repuesto(
      f.tipo_facturacion,
      f.grupo_normalizado,
      f.subgrupo_original
    );

  CREATE TEMP TABLE tmp_repuestos_periodo_candidatos(
    linea_id uuid NOT NULL,
    producto_codigo text NOT NULL,
    prioridad integer NOT NULL,
    metodo text NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_repuestos_periodo_candidatos
  SELECT l.id, m.producto_codigo, 0, 'MAESTRO_LEGACY'
  FROM tmp_repuestos_periodo_lineas l
  JOIN public.repuestos_maestro_legacy_cargas c
    ON c.activo AND c.estado = 'COMPLETADO'
  JOIN public.repuestos_maestro_legacy m
    ON m.carga_id = c.id
   AND m.codigo_legacy_norm = l.mercaderia_norm
  WHERE m.producto_codigo IS NOT NULL
    AND m.estado_vinculo IN ('CONFIRMADA', 'CONFIRMADA_CANONICA');

  INSERT INTO tmp_repuestos_periodo_candidatos
  SELECT l.id, p.codigo_interno, 1, 'CODIGO_INTERNO'
  FROM tmp_repuestos_periodo_lineas l
  JOIN tmp_repuestos_periodo_productos p ON p.interno_norm = l.mercaderia_norm
  WHERE l.mercaderia_norm IS NOT NULL;

  INSERT INTO tmp_repuestos_periodo_candidatos
  SELECT l.id, p.codigo_interno, 2, 'FABRICANTE_EXPLICITO'
  FROM tmp_repuestos_periodo_lineas l
  JOIN tmp_repuestos_periodo_productos p ON p.fabricante_norm = l.fabricante_norm
  WHERE l.fabricante_norm IS NOT NULL;

  INSERT INTO tmp_repuestos_periodo_candidatos
  SELECT l.id, p.codigo_interno, 3, 'CODIGO_COMO_FABRICANTE'
  FROM tmp_repuestos_periodo_lineas l
  JOIN tmp_repuestos_periodo_productos p ON p.fabricante_norm = l.mercaderia_norm
  WHERE l.mercaderia_norm IS NOT NULL;

  INSERT INTO tmp_repuestos_periodo_candidatos
  SELECT l.id, p.codigo_interno, 4, 'DESCRIPCION_A_FABRICANTE'
  FROM tmp_repuestos_periodo_lineas l
  JOIN tmp_repuestos_periodo_productos p ON p.fabricante_norm = l.descripcion_norm
  WHERE l.descripcion_norm IS NOT NULL;

  INSERT INTO tmp_repuestos_periodo_candidatos
  SELECT l.id, p.codigo_interno, 5, 'DESCRIPCION_A_DESCRIPCION'
  FROM tmp_repuestos_periodo_lineas l
  JOIN tmp_repuestos_periodo_productos p ON p.descripcion_norm = l.descripcion_norm
  WHERE l.descripcion_norm IS NOT NULL;

  INSERT INTO tmp_repuestos_periodo_candidatos
  SELECT l.id, p.codigo_interno, 6, 'FABRICANTE_A_DESCRIPCION'
  FROM tmp_repuestos_periodo_lineas l
  JOIN tmp_repuestos_periodo_productos p ON p.descripcion_norm = l.fabricante_norm
  WHERE l.fabricante_norm IS NOT NULL;

  INSERT INTO tmp_repuestos_periodo_candidatos
  SELECT l.id, p.codigo_interno, 7, 'CODIGO_A_DESCRIPCION'
  FROM tmp_repuestos_periodo_lineas l
  JOIN tmp_repuestos_periodo_productos p ON p.descripcion_norm = l.mercaderia_norm
  WHERE l.mercaderia_norm IS NOT NULL;

  CREATE INDEX ON tmp_repuestos_periodo_candidatos(linea_id, prioridad, producto_codigo);
  ANALYZE tmp_repuestos_periodo_candidatos;

  WITH mejor_prioridad AS MATERIALIZED (
    SELECT linea_id, min(prioridad) AS prioridad
    FROM tmp_repuestos_periodo_candidatos
    GROUP BY linea_id
  ),
  resumen AS MATERIALIZED (
    SELECT
      c.linea_id,
      c.prioridad,
      min(c.metodo) AS metodo,
      array_agg(DISTINCT c.producto_codigo ORDER BY c.producto_codigo) AS candidatos,
      count(DISTINCT c.producto_codigo)::integer AS cantidad_candidatos
    FROM tmp_repuestos_periodo_candidatos c
    JOIN mejor_prioridad mp
      ON mp.linea_id = c.linea_id AND mp.prioridad = c.prioridad
    GROUP BY c.linea_id, c.prioridad
  ),
  elegido AS MATERIALIZED (
    SELECT DISTINCT ON (c.linea_id)
      c.linea_id,
      c.producto_codigo
    FROM tmp_repuestos_periodo_candidatos c
    JOIN mejor_prioridad mp
      ON mp.linea_id = c.linea_id AND mp.prioridad = c.prioridad
    ORDER BY c.linea_id, c.producto_codigo
  )
  INSERT INTO public.repuestos_ventas_vinculacion(
    linea_id, producto_codigo, estado_vinculo, metodo_vinculo, prioridad,
    confianza, candidatos, cantidad_candidatos, fecha_efectiva,
    marca_origen, moneda, cantidad, unidad_producto, actualizado_en
  )
  SELECT
    l.id,
    CASE WHEN coalesce(r.cantidad_candidatos, 0) = 1 THEN e.producto_codigo ELSE NULL END,
    CASE
      WHEN coalesce(r.cantidad_candidatos, 0) = 0 THEN 'SIN_COINCIDENCIA'
      WHEN r.cantidad_candidatos = 1 THEN 'CONFIRMADA'
      ELSE 'AMBIGUA'
    END,
    r.metodo,
    r.prioridad,
    CASE
      WHEN coalesce(r.cantidad_candidatos, 0) <> 1 THEN 0
      WHEN r.prioridad = 1 THEN 1.00
      WHEN r.prioridad = 2 THEN 0.95
      WHEN r.prioridad = 3 THEN 0.90
      WHEN r.prioridad IN (4, 5) THEN 0.80
      ELSE 0.70
    END,
    coalesce(r.candidatos, '{}'::text[]),
    coalesce(r.cantidad_candidatos, 0),
    l.fecha_efectiva,
    l.marca_origen,
    l.moneda,
    l.cantidad,
    CASE WHEN coalesce(r.cantidad_candidatos, 0) = 1 THEN p.unidad ELSE NULL END,
    now()
  FROM tmp_repuestos_periodo_lineas l
  LEFT JOIN resumen r ON r.linea_id = l.id
  LEFT JOIN elegido e ON e.linea_id = l.id
  LEFT JOIN tmp_repuestos_periodo_productos p ON p.codigo_interno = e.producto_codigo
  ON CONFLICT (linea_id) DO UPDATE SET
    producto_codigo = EXCLUDED.producto_codigo,
    estado_vinculo = EXCLUDED.estado_vinculo,
    metodo_vinculo = EXCLUDED.metodo_vinculo,
    prioridad = EXCLUDED.prioridad,
    confianza = EXCLUDED.confianza,
    candidatos = EXCLUDED.candidatos,
    cantidad_candidatos = EXCLUDED.cantidad_candidatos,
    fecha_efectiva = EXCLUDED.fecha_efectiva,
    marca_origen = EXCLUDED.marca_origen,
    moneda = EXCLUDED.moneda,
    cantidad = EXCLUDED.cantidad,
    unidad_producto = EXCLUDED.unidad_producto,
    actualizado_en = now()
  WHERE coalesce(public.repuestos_ventas_vinculacion.metodo_vinculo, '')
    <> 'CODIGO_ANTERIOR_MANUAL';

  -- El trigger de deduplicación se ejecuta al terminar el INSERT anterior.
  -- Recién después se reconstruyen los meses afectados.
  DELETE FROM public.repuestos_demanda_mensual
  WHERE mes BETWEEN v_mes_desde AND v_mes_hasta;

  INSERT INTO public.repuestos_demanda_mensual(
    producto_codigo, mes, unidades_netas, unidades_positivas,
    devoluciones, pedidos, importe_comparable, actualizado_en
  )
  SELECT
    v.producto_codigo,
    date_trunc('month', v.fecha_efectiva)::date AS mes,
    sum(coalesce(v.cantidad, f.cantidad, 0) * coalesce(conv.factor_cantidad, 1))::numeric,
    sum(greatest(coalesce(v.cantidad, f.cantidad, 0) * coalesce(conv.factor_cantidad, 1), 0))::numeric,
    sum(abs(least(coalesce(v.cantidad, f.cantidad, 0) * coalesce(conv.factor_cantidad, 1), 0)))::numeric,
    count(DISTINCT coalesce(f.codigo_interno_factura, f.factura, f.id::text))::integer,
    sum(CASE
      WHEN upper(coalesce(f.moneda, 'USD')) IN ('GS', 'GRS', 'PYG') THEN 0
      ELSE coalesce(f.total_venta, 0)
    END)::numeric,
    now()
  FROM public.repuestos_ventas_vinculacion v
  JOIN public.facturacion_lineas_importadas f ON f.id = v.linea_id
  LEFT JOIN LATERAL (
    SELECT regla.factor_cantidad
    FROM public.repuestos_conversiones_unidad_historica regla
    WHERE regla.activa
      AND regla.codigo_legacy_norm = public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia)
      AND (regla.fecha_desde IS NULL OR v.fecha_efectiva >= regla.fecha_desde)
      AND (regla.fecha_hasta_exclusiva IS NULL OR v.fecha_efectiva < regla.fecha_hasta_exclusiva)
      AND (regla.precio_unitario_min IS NULL OR abs(coalesce(f.total_venta, 0) / nullif(coalesce(v.cantidad, f.cantidad, 0), 0)) >= regla.precio_unitario_min)
      AND (regla.precio_unitario_max IS NULL OR abs(coalesce(f.total_venta, 0) / nullif(coalesce(v.cantidad, f.cantidad, 0), 0)) <= regla.precio_unitario_max)
    ORDER BY regla.id
    LIMIT 1
  ) conv ON true
  WHERE v.estado_vinculo = 'CONFIRMADA'
    AND v.producto_codigo IS NOT NULL
    AND v.fecha_efectiva BETWEEN v_mes_desde AND (v_mes_hasta + interval '1 month - 1 day')::date
  GROUP BY v.producto_codigo, date_trunc('month', v.fecha_efectiva)::date;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE v.estado_vinculo = 'CONFIRMADA')::integer,
    count(*) FILTER (WHERE v.estado_vinculo = 'AMBIGUA')::integer,
    count(*) FILTER (WHERE v.estado_vinculo = 'SIN_COINCIDENCIA')::integer
  INTO v_lineas, v_confirmadas, v_ambiguas, v_sin_coincidencia
  FROM public.repuestos_ventas_vinculacion v
  JOIN tmp_repuestos_periodo_lineas l ON l.id = v.linea_id;

  SELECT count(*)::integer
  INTO v_meses
  FROM public.repuestos_demanda_mensual
  WHERE mes BETWEEN v_mes_desde AND v_mes_hasta;

  RETURN jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,
    'lineas', v_lineas,
    'confirmadas', v_confirmadas,
    'ambiguas', v_ambiguas,
    'sin_coincidencia', v_sin_coincidencia,
    'filas_mensuales', v_meses
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.repuestos_actualizar_ventas_periodo(date, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repuestos_actualizar_ventas_periodo(date, date)
  TO authenticated;

-- Recupera las importaciones del sistema nuevo que ya fueron cargadas y no
-- llegaron a la tabla de vinculaciones.
SELECT public.repuestos_actualizar_ventas_periodo(DATE '2026-07-01', current_date);

NOTIFY pgrst, 'reload schema';
