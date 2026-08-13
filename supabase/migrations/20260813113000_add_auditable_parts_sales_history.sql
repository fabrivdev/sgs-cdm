-- Fase 1 del motor vivo: fuente unica y auditable del historial de repuestos.
-- Una linea ambigua nunca se asigna silenciosamente a un producto.

CREATE TABLE IF NOT EXISTS public.repuestos_ventas_vinculacion (
  linea_id uuid PRIMARY KEY REFERENCES public.facturacion_lineas_importadas(id) ON DELETE CASCADE,
  producto_codigo text REFERENCES public.productos(codigo_interno) ON DELETE SET NULL,
  estado_vinculo text NOT NULL CHECK (estado_vinculo IN ('CONFIRMADA', 'AMBIGUA', 'SIN_COINCIDENCIA')),
  metodo_vinculo text,
  prioridad integer,
  confianza numeric NOT NULL DEFAULT 0 CHECK (confianza BETWEEN 0 AND 1),
  candidatos text[] NOT NULL DEFAULT '{}'::text[],
  cantidad_candidatos integer NOT NULL DEFAULT 0 CHECK (cantidad_candidatos >= 0),
  fecha_efectiva date,
  marca_origen public.marca NOT NULL DEFAULT 'OTROS',
  moneda text,
  cantidad numeric NOT NULL DEFAULT 0,
  unidad_producto text,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS repuestos_ventas_vinculacion_producto_idx
  ON public.repuestos_ventas_vinculacion(producto_codigo, fecha_efectiva DESC)
  WHERE estado_vinculo = 'CONFIRMADA';
CREATE INDEX IF NOT EXISTS repuestos_ventas_vinculacion_estado_idx
  ON public.repuestos_ventas_vinculacion(estado_vinculo, marca_origen);

CREATE TABLE IF NOT EXISTS public.repuestos_demanda_mensual (
  producto_codigo text NOT NULL REFERENCES public.productos(codigo_interno) ON DELETE CASCADE,
  mes date NOT NULL,
  unidades_netas numeric NOT NULL DEFAULT 0,
  unidades_positivas numeric NOT NULL DEFAULT 0,
  devoluciones numeric NOT NULL DEFAULT 0,
  pedidos integer NOT NULL DEFAULT 0,
  importe_comparable numeric NOT NULL DEFAULT 0,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (producto_codigo, mes)
);

CREATE INDEX IF NOT EXISTS repuestos_demanda_mensual_mes_idx
  ON public.repuestos_demanda_mensual(mes DESC, producto_codigo);

CREATE TABLE IF NOT EXISTS public.repuestos_historial_actualizaciones (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  estado text NOT NULL CHECK (estado IN ('PROCESANDO', 'COMPLETADA', 'FALLIDA')),
  lineas_totales integer NOT NULL DEFAULT 0,
  confirmadas integer NOT NULL DEFAULT 0,
  ambiguas integer NOT NULL DEFAULT 0,
  sin_coincidencia integer NOT NULL DEFAULT 0,
  iniciado_en timestamptz NOT NULL DEFAULT now(),
  completado_en timestamptz,
  ejecutado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.repuestos_ventas_vinculacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repuestos_demanda_mensual ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repuestos_historial_actualizaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS repuestos_ventas_vinculacion_select ON public.repuestos_ventas_vinculacion;
CREATE POLICY repuestos_ventas_vinculacion_select ON public.repuestos_ventas_vinculacion
FOR SELECT TO authenticated USING (public.has_module_access(auth.uid(), 'repuestos'));

DROP POLICY IF EXISTS repuestos_demanda_mensual_select ON public.repuestos_demanda_mensual;
CREATE POLICY repuestos_demanda_mensual_select ON public.repuestos_demanda_mensual
FOR SELECT TO authenticated USING (public.has_module_access(auth.uid(), 'repuestos'));

DROP POLICY IF EXISTS repuestos_historial_actualizaciones_select ON public.repuestos_historial_actualizaciones;
CREATE POLICY repuestos_historial_actualizaciones_select ON public.repuestos_historial_actualizaciones
FOR SELECT TO authenticated USING (public.has_module_access(auth.uid(), 'repuestos'));

GRANT SELECT ON public.repuestos_ventas_vinculacion TO authenticated;
GRANT SELECT ON public.repuestos_demanda_mensual TO authenticated;
GRANT SELECT ON public.repuestos_historial_actualizaciones TO authenticated;

CREATE OR REPLACE FUNCTION public.repuestos_refrescar_historial_unificado()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

  DELETE FROM public.repuestos_ventas_vinculacion;

  WITH
  lineas AS MATERIALIZED (
    SELECT
      f.*,
      coalesce(
        f.fecha_factura,
        CASE
          WHEN coalesce(f.codigo_interno_factura, f.factura) IS NOT NULL THEN
            min(f.fecha_factura) OVER (
              PARTITION BY coalesce(f.codigo_interno_factura, f.factura)
            )
          ELSE NULL
        END
      )::date AS fecha_calculada
    FROM public.facturacion_lineas_importadas f
    WHERE lower(trim(coalesce(f.grupo_normalizado, f.subgrupo_original, ''))) IN (
      'repuesto', 'repuestos', 'repuestos diversos'
    )
  ),
  productos_base AS MATERIALIZED (
    SELECT
      p.codigo_interno,
      p.unidad,
      public.normalizar_codigo_repuesto_flexible(p.codigo_interno) AS codigo_interno_norm,
      public.normalizar_codigo_repuesto_flexible(p.codigo_fabricante) AS codigo_fabricante_norm,
      public.extraer_codigo_repuesto_descripcion(p.descripcion) AS codigo_descripcion_norm
    FROM public.productos p
    WHERE p.activo AND p.codigo_interno ILIKE 'REP%'
  ),
  candidatos AS MATERIALIZED (
    SELECT l.id AS linea_id, p.codigo_interno AS producto_codigo, 1 AS prioridad, 'CODIGO_INTERNO'::text AS metodo
    FROM lineas l
    JOIN productos_base p
      ON public.normalizar_codigo_repuesto_flexible(l.cod_mercaderia) = p.codigo_interno_norm
    WHERE p.codigo_interno_norm IS NOT NULL

    UNION ALL
    SELECT l.id, p.codigo_interno, 2, 'FABRICANTE_EXPLICITO'
    FROM lineas l
    JOIN productos_base p
      ON public.normalizar_codigo_repuesto_flexible(l.codigo_fabricante) = p.codigo_fabricante_norm
    WHERE p.codigo_fabricante_norm IS NOT NULL

    UNION ALL
    SELECT l.id, p.codigo_interno, 3, 'CODIGO_COMO_FABRICANTE'
    FROM lineas l
    JOIN productos_base p
      ON public.normalizar_codigo_repuesto_flexible(l.cod_mercaderia) = p.codigo_fabricante_norm
    WHERE p.codigo_fabricante_norm IS NOT NULL

    UNION ALL
    SELECT l.id, p.codigo_interno, 4, 'DESCRIPCION_A_FABRICANTE'
    FROM lineas l
    JOIN productos_base p
      ON public.extraer_codigo_repuesto_descripcion(l.mercaderia) = p.codigo_fabricante_norm
    WHERE p.codigo_fabricante_norm IS NOT NULL

    UNION ALL
    SELECT l.id, p.codigo_interno, 5, 'DESCRIPCION_A_DESCRIPCION'
    FROM lineas l
    JOIN productos_base p
      ON public.extraer_codigo_repuesto_descripcion(l.mercaderia) = p.codigo_descripcion_norm
    WHERE p.codigo_descripcion_norm IS NOT NULL

    UNION ALL
    SELECT l.id, p.codigo_interno, 6, 'FABRICANTE_A_DESCRIPCION'
    FROM lineas l
    JOIN productos_base p
      ON public.normalizar_codigo_repuesto_flexible(l.codigo_fabricante) = p.codigo_descripcion_norm
    WHERE p.codigo_descripcion_norm IS NOT NULL

    UNION ALL
    SELECT l.id, p.codigo_interno, 7, 'CODIGO_A_DESCRIPCION'
    FROM lineas l
    JOIN productos_base p
      ON public.normalizar_codigo_repuesto_flexible(l.cod_mercaderia) = p.codigo_descripcion_norm
    WHERE p.codigo_descripcion_norm IS NOT NULL
  ),
  mejor_prioridad AS MATERIALIZED (
    SELECT linea_id, min(prioridad) AS prioridad
    FROM candidatos
    GROUP BY linea_id
  ),
  mejores AS MATERIALIZED (
    SELECT DISTINCT c.linea_id, c.producto_codigo, c.prioridad, c.metodo
    FROM candidatos c
    JOIN mejor_prioridad mp
      ON mp.linea_id = c.linea_id AND mp.prioridad = c.prioridad
  ),
  resumen AS MATERIALIZED (
    SELECT
      linea_id,
      min(prioridad) AS prioridad,
      min(metodo) AS metodo,
      array_agg(DISTINCT producto_codigo ORDER BY producto_codigo) AS candidatos,
      count(DISTINCT producto_codigo)::integer AS cantidad_candidatos
    FROM mejores
    GROUP BY linea_id
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
    l.fecha_calculada,
    coalesce(l.marca_normalizada, 'OTROS'::public.marca),
    l.moneda,
    coalesce(l.cantidad, 0),
    p.unidad
  FROM lineas l
  LEFT JOIN resumen r ON r.linea_id = l.id
  LEFT JOIN public.productos p
    ON p.codigo_interno = CASE WHEN coalesce(r.cantidad_candidatos, 0) = 1 THEN r.candidatos[1] ELSE NULL END;

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
    'productos_con_demanda', (SELECT count(DISTINCT producto_codigo) FROM public.repuestos_demanda_mensual)
  );
EXCEPTION WHEN OTHERS THEN
  -- Si la llamada forma parte de una transaccion fallida, el cliente recibe
  -- igualmente el error original. El estado detallado se incorporara cuando
  -- el refresco pase a un worker asincrono en la fase siguiente.
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.repuestos_resumen_calidad_historial(p_marca text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH base AS (
    SELECT v.*
    FROM public.repuestos_ventas_vinculacion v
    LEFT JOIN public.productos p ON p.codigo_interno = v.producto_codigo
    WHERE p_marca IS NULL
       OR upper(trim(p_marca)) = coalesce(p.marca::text, v.marca_origen::text)
  ),
  ultima AS (
    SELECT *
    FROM public.repuestos_historial_actualizaciones
    WHERE estado = 'COMPLETADA'
    ORDER BY completado_en DESC
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'preparado', EXISTS (SELECT 1 FROM ultima),
    'lineas_totales', count(*)::integer,
    'confirmadas', count(*) FILTER (WHERE estado_vinculo = 'CONFIRMADA')::integer,
    'ambiguas', count(*) FILTER (WHERE estado_vinculo = 'AMBIGUA')::integer,
    'sin_coincidencia', count(*) FILTER (WHERE estado_vinculo = 'SIN_COINCIDENCIA')::integer,
    'productos_confirmados', count(DISTINCT producto_codigo) FILTER (WHERE estado_vinculo = 'CONFIRMADA')::integer,
    'fecha_desde', min(fecha_efectiva),
    'fecha_hasta', max(fecha_efectiva),
    'actualizado_en', (SELECT completado_en FROM ultima)
  )
  FROM base;
$$;

REVOKE ALL ON FUNCTION public.repuestos_refrescar_historial_unificado() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repuestos_resumen_calidad_historial(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repuestos_refrescar_historial_unificado() TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_resumen_calidad_historial(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
