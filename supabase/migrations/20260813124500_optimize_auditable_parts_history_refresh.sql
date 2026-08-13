-- Corrige el refresco inicial del historial auditable.
-- La primera version calculaba los normalizadores dentro de siete joins
-- masivos. Esta version materializa e indexa las claves una sola vez.

CREATE OR REPLACE FUNCTION public.repuestos_refrescar_historial_unificado()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '180s'
AS $$
DECLARE
  v_actualizacion_id bigint;
  v_total integer := 0;
  v_confirmadas integer := 0;
  v_ambiguas integer := 0;
  v_sin_coincidencia integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND (
    NOT public.has_module_access(auth.uid(), 'repuestos')
    OR NOT (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
    )
  ) THEN
    RAISE EXCEPTION 'No tenes permiso para reconstruir el historial' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.repuestos_historial_actualizaciones(estado, ejecutado_por)
  VALUES ('PROCESANDO', auth.uid())
  RETURNING id INTO v_actualizacion_id;

  CREATE TEMP TABLE tmp_repuestos_productos ON COMMIT DROP AS
  SELECT
    p.codigo_interno,
    p.unidad,
    public.normalizar_codigo_repuesto_flexible(p.codigo_interno) AS interno_norm,
    public.normalizar_codigo_repuesto_flexible(p.codigo_fabricante) AS fabricante_norm,
    public.extraer_codigo_repuesto_descripcion(p.descripcion) AS descripcion_norm
  FROM public.productos p
  WHERE p.activo
    AND p.codigo_interno ILIKE 'REP%';

  CREATE UNIQUE INDEX tmp_repuestos_productos_codigo_idx
    ON tmp_repuestos_productos(codigo_interno);
  CREATE INDEX tmp_repuestos_productos_interno_idx
    ON tmp_repuestos_productos(interno_norm) WHERE interno_norm IS NOT NULL;
  CREATE INDEX tmp_repuestos_productos_fabricante_idx
    ON tmp_repuestos_productos(fabricante_norm) WHERE fabricante_norm IS NOT NULL;
  CREATE INDEX tmp_repuestos_productos_descripcion_idx
    ON tmp_repuestos_productos(descripcion_norm) WHERE descripcion_norm IS NOT NULL;

  CREATE TEMP TABLE tmp_repuestos_facturas_fecha ON COMMIT DROP AS
  SELECT
    coalesce(f.codigo_interno_factura, f.factura) AS factura_clave,
    min(f.fecha_factura)::date AS fecha_factura
  FROM public.facturacion_lineas_importadas f
  WHERE coalesce(f.codigo_interno_factura, f.factura) IS NOT NULL
    AND f.fecha_factura IS NOT NULL
  GROUP BY coalesce(f.codigo_interno_factura, f.factura);

  CREATE UNIQUE INDEX tmp_repuestos_facturas_fecha_idx
    ON tmp_repuestos_facturas_fecha(factura_clave);

  CREATE TEMP TABLE tmp_repuestos_lineas ON COMMIT DROP AS
  SELECT
    f.id,
    coalesce(f.fecha_factura::date, ff.fecha_factura) AS fecha_efectiva,
    coalesce(f.marca_normalizada, 'OTROS'::public.marca) AS marca_origen,
    f.moneda,
    coalesce(f.cantidad, 0)::numeric AS cantidad,
    public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia) AS mercaderia_norm,
    public.normalizar_codigo_repuesto_flexible(f.codigo_fabricante) AS fabricante_norm,
    public.extraer_codigo_repuesto_descripcion(f.mercaderia) AS descripcion_norm
  FROM public.facturacion_lineas_importadas f
  LEFT JOIN tmp_repuestos_facturas_fecha ff
    ON ff.factura_clave = coalesce(f.codigo_interno_factura, f.factura)
  WHERE lower(trim(coalesce(f.grupo_normalizado, f.subgrupo_original, ''))) IN (
    'repuesto', 'repuestos', 'repuestos diversos'
  );

  CREATE UNIQUE INDEX tmp_repuestos_lineas_id_idx ON tmp_repuestos_lineas(id);
  CREATE INDEX tmp_repuestos_lineas_mercaderia_idx
    ON tmp_repuestos_lineas(mercaderia_norm) WHERE mercaderia_norm IS NOT NULL;
  CREATE INDEX tmp_repuestos_lineas_fabricante_idx
    ON tmp_repuestos_lineas(fabricante_norm) WHERE fabricante_norm IS NOT NULL;
  CREATE INDEX tmp_repuestos_lineas_descripcion_idx
    ON tmp_repuestos_lineas(descripcion_norm) WHERE descripcion_norm IS NOT NULL;

  ANALYZE tmp_repuestos_productos;
  ANALYZE tmp_repuestos_lineas;

  CREATE TEMP TABLE tmp_repuestos_candidatos (
    linea_id uuid NOT NULL,
    producto_codigo text NOT NULL,
    prioridad integer NOT NULL,
    metodo text NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_repuestos_candidatos
  SELECT l.id, p.codigo_interno, 1, 'CODIGO_INTERNO'
  FROM tmp_repuestos_lineas l
  JOIN tmp_repuestos_productos p ON p.interno_norm = l.mercaderia_norm
  WHERE l.mercaderia_norm IS NOT NULL;

  INSERT INTO tmp_repuestos_candidatos
  SELECT l.id, p.codigo_interno, 2, 'FABRICANTE_EXPLICITO'
  FROM tmp_repuestos_lineas l
  JOIN tmp_repuestos_productos p ON p.fabricante_norm = l.fabricante_norm
  WHERE l.fabricante_norm IS NOT NULL;

  INSERT INTO tmp_repuestos_candidatos
  SELECT l.id, p.codigo_interno, 3, 'CODIGO_COMO_FABRICANTE'
  FROM tmp_repuestos_lineas l
  JOIN tmp_repuestos_productos p ON p.fabricante_norm = l.mercaderia_norm
  WHERE l.mercaderia_norm IS NOT NULL;

  INSERT INTO tmp_repuestos_candidatos
  SELECT l.id, p.codigo_interno, 4, 'DESCRIPCION_A_FABRICANTE'
  FROM tmp_repuestos_lineas l
  JOIN tmp_repuestos_productos p ON p.fabricante_norm = l.descripcion_norm
  WHERE l.descripcion_norm IS NOT NULL;

  INSERT INTO tmp_repuestos_candidatos
  SELECT l.id, p.codigo_interno, 5, 'DESCRIPCION_A_DESCRIPCION'
  FROM tmp_repuestos_lineas l
  JOIN tmp_repuestos_productos p ON p.descripcion_norm = l.descripcion_norm
  WHERE l.descripcion_norm IS NOT NULL;

  INSERT INTO tmp_repuestos_candidatos
  SELECT l.id, p.codigo_interno, 6, 'FABRICANTE_A_DESCRIPCION'
  FROM tmp_repuestos_lineas l
  JOIN tmp_repuestos_productos p ON p.descripcion_norm = l.fabricante_norm
  WHERE l.fabricante_norm IS NOT NULL;

  INSERT INTO tmp_repuestos_candidatos
  SELECT l.id, p.codigo_interno, 7, 'CODIGO_A_DESCRIPCION'
  FROM tmp_repuestos_lineas l
  JOIN tmp_repuestos_productos p ON p.descripcion_norm = l.mercaderia_norm
  WHERE l.mercaderia_norm IS NOT NULL;

  CREATE INDEX tmp_repuestos_candidatos_linea_idx
    ON tmp_repuestos_candidatos(linea_id, prioridad, producto_codigo);
  ANALYZE tmp_repuestos_candidatos;

  DELETE FROM public.repuestos_ventas_vinculacion;

  WITH mejor_prioridad AS MATERIALIZED (
    SELECT linea_id, min(prioridad) AS prioridad
    FROM tmp_repuestos_candidatos
    GROUP BY linea_id
  ),
  resumen AS MATERIALIZED (
    SELECT
      c.linea_id,
      c.prioridad,
      min(c.metodo) AS metodo,
      array_agg(DISTINCT c.producto_codigo ORDER BY c.producto_codigo) AS candidatos,
      count(DISTINCT c.producto_codigo)::integer AS cantidad_candidatos
    FROM tmp_repuestos_candidatos c
    JOIN mejor_prioridad mp
      ON mp.linea_id = c.linea_id
     AND mp.prioridad = c.prioridad
    GROUP BY c.linea_id, c.prioridad
  )
  INSERT INTO public.repuestos_ventas_vinculacion (
    linea_id, producto_codigo, estado_vinculo, metodo_vinculo, prioridad,
    confianza, candidatos, cantidad_candidatos, fecha_efectiva,
    marca_origen, moneda, cantidad, unidad_producto
  )
  SELECT
    l.id,
    CASE WHEN coalesce(r.cantidad_candidatos, 0) = 1 THEN r.candidatos[1] ELSE NULL END,
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
      WHEN r.prioridad = 4 THEN 0.80
      WHEN r.prioridad = 5 THEN 0.75
      ELSE 0.65
    END,
    coalesce(r.candidatos, '{}'::text[]),
    coalesce(r.cantidad_candidatos, 0),
    l.fecha_efectiva,
    l.marca_origen,
    l.moneda,
    l.cantidad,
    p.unidad
  FROM tmp_repuestos_lineas l
  LEFT JOIN resumen r ON r.linea_id = l.id
  LEFT JOIN tmp_repuestos_productos p
    ON p.codigo_interno = CASE
      WHEN coalesce(r.cantidad_candidatos, 0) = 1 THEN r.candidatos[1]
      ELSE NULL
    END;

  DELETE FROM public.repuestos_demanda_mensual;

  INSERT INTO public.repuestos_demanda_mensual (
    producto_codigo, mes, unidades_netas, unidades_positivas,
    devoluciones, pedidos, importe_comparable
  )
  SELECT
    v.producto_codigo,
    date_trunc('month', v.fecha_efectiva)::date,
    sum(v.cantidad)::numeric,
    sum(greatest(v.cantidad, 0))::numeric,
    sum(abs(least(v.cantidad, 0)))::numeric,
    count(DISTINCT coalesce(f.codigo_interno_factura, f.factura, f.id::text))::integer,
    sum(
      CASE
        WHEN upper(coalesce(f.moneda, 'USD')) IN ('GS', 'GRS', 'PYG') THEN 0
        ELSE coalesce(f.total_venta, 0)
      END
    )::numeric
  FROM public.repuestos_ventas_vinculacion v
  JOIN public.facturacion_lineas_importadas f ON f.id = v.linea_id
  WHERE v.estado_vinculo = 'CONFIRMADA'
    AND v.producto_codigo IS NOT NULL
    AND v.fecha_efectiva IS NOT NULL
  GROUP BY v.producto_codigo, date_trunc('month', v.fecha_efectiva)::date;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE estado_vinculo = 'CONFIRMADA')::integer,
    count(*) FILTER (WHERE estado_vinculo = 'AMBIGUA')::integer,
    count(*) FILTER (WHERE estado_vinculo = 'SIN_COINCIDENCIA')::integer
  INTO v_total, v_confirmadas, v_ambiguas, v_sin_coincidencia
  FROM public.repuestos_ventas_vinculacion;

  UPDATE public.repuestos_historial_actualizaciones
  SET
    estado = 'COMPLETADA',
    lineas_totales = v_total,
    confirmadas = v_confirmadas,
    ambiguas = v_ambiguas,
    sin_coincidencia = v_sin_coincidencia,
    completado_en = now(),
    detalle = jsonb_build_object(
      'productos_con_demanda', (SELECT count(DISTINCT producto_codigo) FROM public.repuestos_demanda_mensual),
      'mes_desde', (SELECT min(mes) FROM public.repuestos_demanda_mensual),
      'mes_hasta', (SELECT max(mes) FROM public.repuestos_demanda_mensual)
    )
  WHERE id = v_actualizacion_id;

  RETURN jsonb_build_object(
    'actualizacion_id', v_actualizacion_id,
    'lineas_totales', v_total,
    'confirmadas', v_confirmadas,
    'ambiguas', v_ambiguas,
    'sin_coincidencia', v_sin_coincidencia,
    'productos_con_demanda', (
      SELECT count(DISTINCT producto_codigo)
      FROM public.repuestos_demanda_mensual
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.repuestos_refrescar_historial_unificado() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repuestos_refrescar_historial_unificado() TO authenticated;

NOTIFY pgrst, 'reload schema';
