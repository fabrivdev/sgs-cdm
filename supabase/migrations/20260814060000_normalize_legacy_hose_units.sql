-- Normaliza unidades historicas de mangueras sin alterar la fuente importada.
-- En el sistema anterior algunas ventas se registraron en milimetros, mientras
-- que el catalogo y el sistema actual administran esas mismas piezas en metros.
-- La regla combina codigo interno legacy + precio implicito para soportar los
-- periodos en los que ambas unidades convivieron bajo el mismo codigo.

CREATE TABLE IF NOT EXISTS public.repuestos_conversiones_unidad_historica (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  regla_clave text NOT NULL UNIQUE,
  codigo_legacy_norm text NOT NULL,
  fecha_desde date,
  fecha_hasta_exclusiva date,
  precio_unitario_min numeric,
  precio_unitario_max numeric,
  unidad_origen text NOT NULL,
  unidad_destino text NOT NULL,
  factor_cantidad numeric NOT NULL CHECK (factor_cantidad > 0),
  motivo text NOT NULL,
  fuente text,
  activa boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS repuestos_conversiones_unidad_codigo_idx
  ON public.repuestos_conversiones_unidad_historica(codigo_legacy_norm)
  WHERE activa;

ALTER TABLE public.repuestos_conversiones_unidad_historica ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS repuestos_conversiones_unidad_select
  ON public.repuestos_conversiones_unidad_historica;
CREATE POLICY repuestos_conversiones_unidad_select
  ON public.repuestos_conversiones_unidad_historica
  FOR SELECT TO authenticated
  USING (public.has_module_access(auth.uid(), 'repuestos'));

GRANT SELECT ON public.repuestos_conversiones_unidad_historica TO authenticated;

INSERT INTO public.repuestos_conversiones_unidad_historica(
  regla_clave, codigo_legacy_norm, precio_unitario_max,
  unidad_origen, unidad_destino, factor_cantidad, motivo, fuente
)
VALUES
  (
    'HORSCH-26029-MM-A-M', '26029', 1,
    'MM', 'M', 0.001,
    'El codigo legacy 26029 alterno metros y milimetros. Un precio por unidad menor o igual a 1 identifica las lineas valorizadas por milimetro.',
    'Lista Mercadoria.xls + FACTURACION HISTORICA.xlsx'
  ),
  (
    'HORSCH-26391-MM-A-M', '26391', 1,
    'MM', 'M', 0.001,
    'El codigo legacy 26391 fue valorizado por milimetro y el producto actual se administra en metros.',
    'Lista Mercadoria.xls + FACTURACION HISTORICA.xlsx'
  )
ON CONFLICT (regla_clave) DO UPDATE SET
  codigo_legacy_norm = EXCLUDED.codigo_legacy_norm,
  precio_unitario_max = EXCLUDED.precio_unitario_max,
  unidad_origen = EXCLUDED.unidad_origen,
  unidad_destino = EXCLUDED.unidad_destino,
  factor_cantidad = EXCLUDED.factor_cantidad,
  motivo = EXCLUDED.motivo,
  fuente = EXCLUDED.fuente,
  activa = true,
  actualizado_en = now();

CREATE OR REPLACE FUNCTION public.repuestos_aplicar_conversiones_unidad_historica()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '25s'
AS $$
DECLARE
  v_lineas integer := 0;
  v_productos integer := 0;
  v_meses integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND (
    NOT public.has_module_access(auth.uid(), 'repuestos')
    OR NOT (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
    )
  ) THEN
    RAISE EXCEPTION 'No tenes permiso para normalizar unidades historicas de repuestos'
      USING ERRCODE = '42501';
  END IF;

  CREATE TEMP TABLE tmp_conversion_linea ON COMMIT DROP AS
  SELECT
    f.id AS linea_id,
    r.factor_cantidad,
    r.unidad_origen,
    r.unidad_destino,
    r.regla_clave
  FROM public.facturacion_lineas_importadas f
  JOIN LATERAL (
    SELECT regla.*
    FROM public.repuestos_conversiones_unidad_historica regla
    WHERE regla.activa
      AND regla.codigo_legacy_norm = public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia)
      AND (regla.fecha_desde IS NULL OR f.fecha_factura::date >= regla.fecha_desde)
      AND (regla.fecha_hasta_exclusiva IS NULL OR f.fecha_factura::date < regla.fecha_hasta_exclusiva)
      AND (
        regla.precio_unitario_min IS NULL
        OR abs(coalesce(f.total_venta, 0) / nullif(f.cantidad, 0)) >= regla.precio_unitario_min
      )
      AND (
        regla.precio_unitario_max IS NULL
        OR abs(coalesce(f.total_venta, 0) / nullif(f.cantidad, 0)) <= regla.precio_unitario_max
      )
    ORDER BY regla.id
    LIMIT 1
  ) r ON true
  WHERE f.origen_sistema = 'legacy_historico_detallado';

  CREATE TEMP TABLE tmp_productos_conversion ON COMMIT DROP AS
  SELECT DISTINCT v.producto_codigo
  FROM public.repuestos_ventas_vinculacion v
  JOIN tmp_conversion_linea c ON c.linea_id = v.linea_id
  WHERE v.estado_vinculo = 'CONFIRMADA'
    AND v.producto_codigo IS NOT NULL;

  SELECT count(*), count(DISTINCT v.producto_codigo)
  INTO v_lineas, v_productos
  FROM tmp_conversion_linea c
  JOIN public.repuestos_ventas_vinculacion v ON v.linea_id = c.linea_id
  WHERE v.estado_vinculo = 'CONFIRMADA';

  DELETE FROM public.repuestos_demanda_mensual d
  WHERE d.producto_codigo IN (SELECT producto_codigo FROM tmp_productos_conversion)
    AND d.mes < DATE '2026-07-01';

  INSERT INTO public.repuestos_demanda_mensual(
    producto_codigo, mes, unidades_netas, unidades_positivas,
    devoluciones, pedidos, importe_comparable, actualizado_en
  )
  SELECT
    v.producto_codigo,
    date_trunc('month', v.fecha_efectiva)::date,
    sum(coalesce(f.cantidad, 0) * coalesce(c.factor_cantidad, 1))::numeric,
    sum(greatest(coalesce(f.cantidad, 0) * coalesce(c.factor_cantidad, 1), 0))::numeric,
    sum(abs(least(coalesce(f.cantidad, 0) * coalesce(c.factor_cantidad, 1), 0)))::numeric,
    count(DISTINCT coalesce(f.codigo_interno_factura, f.factura, f.id::text))::integer,
    sum(CASE
      WHEN upper(coalesce(f.moneda, 'USD')) IN ('GS', 'GRS', 'PYG') THEN 0
      ELSE coalesce(f.total_venta, 0)
    END)::numeric,
    now()
  FROM public.repuestos_ventas_vinculacion v
  JOIN public.facturacion_lineas_importadas f ON f.id = v.linea_id
  LEFT JOIN tmp_conversion_linea c ON c.linea_id = f.id
  WHERE f.origen_sistema = 'legacy_historico_detallado'
    AND v.estado_vinculo = 'CONFIRMADA'
    AND v.producto_codigo IN (SELECT producto_codigo FROM tmp_productos_conversion)
    AND v.fecha_efectiva < DATE '2026-07-01'
  GROUP BY v.producto_codigo, date_trunc('month', v.fecha_efectiva)::date
  ON CONFLICT (producto_codigo, mes) DO UPDATE SET
    unidades_netas = EXCLUDED.unidades_netas,
    unidades_positivas = EXCLUDED.unidades_positivas,
    devoluciones = EXCLUDED.devoluciones,
    pedidos = EXCLUDED.pedidos,
    importe_comparable = EXCLUDED.importe_comparable,
    actualizado_en = now();

  GET DIAGNOSTICS v_meses = ROW_COUNT;

  UPDATE public.repuestos_facturacion_historica_cargas
  SET publicado_en = now(), publicacion_estado = 'COMPLETADO'
  WHERE activo AND estado = 'COMPLETADO';

  RETURN jsonb_build_object(
    'lineas_convertidas', v_lineas,
    'productos_afectados', v_productos,
    'meses_recalculados', v_meses
  );
END;
$$;

-- Tambien integra la conversion en futuras reconstrucciones por lotes. La
-- cantidad vinculada permanece cruda; la normalizacion ocurre al materializar.
CREATE OR REPLACE FUNCTION public.repuestos_publicar_historial_lote(
  p_desde date,
  p_hasta_exclusiva date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '25s'
AS $$
DECLARE
  v_filas integer := 0;
  v_productos integer := 0;
BEGIN
  IF p_desde IS NULL OR p_hasta_exclusiva IS NULL OR p_hasta_exclusiva <= p_desde
    OR p_hasta_exclusiva > DATE '2026-07-01'
    OR p_hasta_exclusiva > (p_desde + interval '3 months')::date
  THEN
    RAISE EXCEPTION 'Rango de lote invalido';
  END IF;

  IF auth.uid() IS NOT NULL AND (
    NOT public.has_module_access(auth.uid(), 'repuestos')
    OR NOT (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
    )
  ) THEN
    RAISE EXCEPTION 'No tenes permiso para publicar el historial de repuestos'
      USING ERRCODE = '42501';
  END IF;

  CREATE TEMP TABLE tmp_demanda_lote ON COMMIT DROP AS
  SELECT
    v.producto_codigo,
    date_trunc('month', v.fecha_efectiva)::date AS mes,
    sum(coalesce(f.cantidad, 0) * coalesce(conv.factor_cantidad, 1))::numeric AS unidades_netas,
    sum(greatest(coalesce(f.cantidad, 0) * coalesce(conv.factor_cantidad, 1), 0))::numeric AS unidades_positivas,
    sum(abs(least(coalesce(f.cantidad, 0) * coalesce(conv.factor_cantidad, 1), 0)))::numeric AS devoluciones,
    count(DISTINCT coalesce(f.codigo_interno_factura, f.factura, f.id::text))::integer AS pedidos,
    sum(CASE
      WHEN upper(coalesce(f.moneda, 'USD')) IN ('GS', 'GRS', 'PYG') THEN 0
      ELSE coalesce(f.total_venta, 0)
    END)::numeric AS importe_comparable
  FROM public.facturacion_lineas_importadas f
  JOIN public.repuestos_ventas_vinculacion v ON v.linea_id = f.id
  LEFT JOIN LATERAL (
    SELECT regla.factor_cantidad
    FROM public.repuestos_conversiones_unidad_historica regla
    WHERE regla.activa
      AND regla.codigo_legacy_norm = public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia)
      AND (regla.fecha_desde IS NULL OR v.fecha_efectiva >= regla.fecha_desde)
      AND (regla.fecha_hasta_exclusiva IS NULL OR v.fecha_efectiva < regla.fecha_hasta_exclusiva)
      AND (regla.precio_unitario_min IS NULL OR abs(coalesce(f.total_venta, 0) / nullif(f.cantidad, 0)) >= regla.precio_unitario_min)
      AND (regla.precio_unitario_max IS NULL OR abs(coalesce(f.total_venta, 0) / nullif(f.cantidad, 0)) <= regla.precio_unitario_max)
    ORDER BY regla.id LIMIT 1
  ) conv ON true
  WHERE f.origen_sistema = 'legacy_historico_detallado'
    AND v.estado_vinculo = 'CONFIRMADA'
    AND v.producto_codigo IS NOT NULL
    AND v.fecha_efectiva >= p_desde
    AND v.fecha_efectiva < p_hasta_exclusiva
  GROUP BY v.producto_codigo, date_trunc('month', v.fecha_efectiva)::date;

  SELECT count(*)::integer, count(DISTINCT producto_codigo)::integer
  INTO v_filas, v_productos FROM tmp_demanda_lote;

  DELETE FROM public.repuestos_demanda_mensual
  WHERE mes >= p_desde AND mes < p_hasta_exclusiva;

  INSERT INTO public.repuestos_demanda_mensual(
    producto_codigo, mes, unidades_netas, unidades_positivas,
    devoluciones, pedidos, importe_comparable
  )
  SELECT producto_codigo, mes, unidades_netas, unidades_positivas,
    devoluciones, pedidos, importe_comparable
  FROM tmp_demanda_lote;

  UPDATE public.repuestos_facturacion_historica_cargas
  SET publicacion_hasta = greatest(coalesce(publicacion_hasta, p_desde), p_hasta_exclusiva)
  WHERE activo AND estado = 'COMPLETADO';

  RETURN jsonb_build_object(
    'desde', p_desde, 'hasta_exclusiva', p_hasta_exclusiva,
    'filas_mensuales', v_filas, 'productos', v_productos
  );
END;
$$;

REVOKE ALL ON FUNCTION public.repuestos_aplicar_conversiones_unidad_historica() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repuestos_aplicar_conversiones_unidad_historica() TO authenticated;

-- El detalle conserva y expone tanto la cantidad original como la normalizada.
CREATE OR REPLACE FUNCTION public.repuesto_ventas_historial(p_producto_codigo text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH producto AS MATERIALIZED (
    SELECT
      p.codigo_interno, p.codigo_fabricante, p.descripcion,
      public.normalizar_codigo_repuesto_flexible(p.codigo_interno) AS codigo_interno_norm,
      public.normalizar_codigo_repuesto_flexible(p.codigo_fabricante) AS codigo_fabricante_norm,
      public.extraer_codigo_repuesto_descripcion(p.descripcion) AS codigo_descripcion_norm
    FROM public.productos p
    WHERE p.codigo_interno = p_producto_codigo AND p.codigo_interno ILIKE 'REP%'
    LIMIT 1
  ),
  candidatos AS (
    SELECT v.linea_id, 0 AS prioridad, 'vinculacion_confirmada'::text AS metodo_vinculo
    FROM producto p
    JOIN public.repuestos_ventas_vinculacion v
      ON v.producto_codigo = p.codigo_interno
     AND v.estado_vinculo = 'CONFIRMADA'
    UNION ALL
    SELECT f.id AS linea_id, 1 AS prioridad, 'codigo_fabricante'::text AS metodo_vinculo
    FROM producto p JOIN public.facturacion_lineas_importadas f
      ON public.normalizar_codigo_repuesto_flexible(f.codigo_fabricante) = p.codigo_fabricante_norm
    WHERE p.codigo_fabricante_norm IS NOT NULL
    UNION ALL
    SELECT f.id, 2, 'codigo_interno' FROM producto p JOIN public.facturacion_lineas_importadas f
      ON public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia) = p.codigo_interno_norm
    WHERE p.codigo_interno_norm IS NOT NULL
    UNION ALL
    SELECT f.id, 3, 'codigo_facturado_fabricante' FROM producto p JOIN public.facturacion_lineas_importadas f
      ON public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia) = p.codigo_fabricante_norm
    WHERE p.codigo_fabricante_norm IS NOT NULL
    UNION ALL
    SELECT f.id, 4, 'descripcion_facturada_codigo_fabricante' FROM producto p JOIN public.facturacion_lineas_importadas f
      ON public.extraer_codigo_repuesto_descripcion(f.mercaderia) = p.codigo_fabricante_norm
    WHERE p.codigo_fabricante_norm IS NOT NULL
    UNION ALL
    SELECT f.id, 5, 'descripcion_descripcion' FROM producto p JOIN public.facturacion_lineas_importadas f
      ON public.extraer_codigo_repuesto_descripcion(f.mercaderia) = p.codigo_descripcion_norm
    WHERE p.codigo_descripcion_norm IS NOT NULL
    UNION ALL
    SELECT f.id, 6, 'descripcion_codigo_fabricante' FROM producto p JOIN public.facturacion_lineas_importadas f
      ON public.normalizar_codigo_repuesto_flexible(f.codigo_fabricante) = p.codigo_descripcion_norm
    WHERE p.codigo_descripcion_norm IS NOT NULL
    UNION ALL
    SELECT f.id, 7, 'descripcion_codigo_facturado' FROM producto p JOIN public.facturacion_lineas_importadas f
      ON public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia) = p.codigo_descripcion_norm
    WHERE p.codigo_descripcion_norm IS NOT NULL
  ),
  unicos AS (
    SELECT DISTINCT ON (linea_id) linea_id, metodo_vinculo
    FROM candidatos ORDER BY linea_id, prioridad
  ),
  ventas AS (
    SELECT
      f.id AS linea_id,
      p.codigo_interno AS producto_codigo,
      p.codigo_fabricante AS producto_codigo_fabricante,
      coalesce(f.fecha_factura, hermana.fecha_factura) AS fecha_factura,
      coalesce(f.cantidad, 0)::numeric AS cantidad_original,
      (coalesce(f.cantidad, 0) * coalesce(conv.factor_cantidad, 1))::numeric AS cantidad,
      coalesce(f.total_venta, 0)::numeric AS total_venta_usd,
      f.entidad_nombre AS cliente, f.sucursal,
      coalesce(f.codigo_interno_factura, f.factura) AS factura,
      f.cod_mercaderia AS codigo_facturado,
      f.codigo_fabricante AS codigo_fabricante_facturado,
      f.mercaderia AS descripcion_facturada,
      coalesce(f.origen_sistema, 'historico') AS origen_sistema,
      u.metodo_vinculo,
      coalesce(conv.factor_cantidad, 1)::numeric AS factor_conversion,
      conv.unidad_origen,
      conv.unidad_destino,
      conv.regla_clave
    FROM unicos u
    JOIN public.facturacion_lineas_importadas f ON f.id = u.linea_id
    CROSS JOIN producto p
    LEFT JOIN LATERAL (
      SELECT f2.fecha_factura
      FROM public.facturacion_lineas_importadas f2
      WHERE f.fecha_factura IS NULL
        AND coalesce(f.codigo_interno_factura, f.factura) IS NOT NULL
        AND coalesce(f2.codigo_interno_factura, f2.factura) = coalesce(f.codigo_interno_factura, f.factura)
        AND f2.fecha_factura IS NOT NULL
      ORDER BY f2.fecha_factura LIMIT 1
    ) hermana ON true
    LEFT JOIN LATERAL (
      SELECT regla.*
      FROM public.repuestos_conversiones_unidad_historica regla
      WHERE f.origen_sistema = 'legacy_historico_detallado'
        AND regla.activa
        AND regla.codigo_legacy_norm = public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia)
        AND (regla.fecha_desde IS NULL OR coalesce(f.fecha_factura, hermana.fecha_factura)::date >= regla.fecha_desde)
        AND (regla.fecha_hasta_exclusiva IS NULL OR coalesce(f.fecha_factura, hermana.fecha_factura)::date < regla.fecha_hasta_exclusiva)
        AND (regla.precio_unitario_min IS NULL OR abs(coalesce(f.total_venta, 0) / nullif(f.cantidad, 0)) >= regla.precio_unitario_min)
        AND (regla.precio_unitario_max IS NULL OR abs(coalesce(f.total_venta, 0) / nullif(f.cantidad, 0)) <= regla.precio_unitario_max)
      ORDER BY regla.id LIMIT 1
    ) conv ON true
    WHERE lower(trim(coalesce(f.grupo_normalizado, f.subgrupo_original, ''))) IN ('repuesto', 'repuestos', 'repuestos diversos')
      AND upper(coalesce(f.moneda, 'USD')) <> 'GS'
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'linea_id', linea_id,
    'producto_codigo', producto_codigo,
    'producto_codigo_fabricante', producto_codigo_fabricante,
    'fecha_factura', fecha_factura,
    'cantidad', cantidad,
    'cantidad_original', cantidad_original,
    'total_venta_usd', total_venta_usd,
    'cliente', cliente,
    'sucursal', sucursal,
    'factura', factura,
    'codigo_facturado', codigo_facturado,
    'codigo_fabricante_facturado', codigo_fabricante_facturado,
    'descripcion_facturada', descripcion_facturada,
    'origen_sistema', origen_sistema,
    'metodo_vinculo', metodo_vinculo,
    'factor_conversion', factor_conversion,
    'unidad_original', unidad_origen,
    'unidad_destino', unidad_destino,
    'regla_conversion', regla_clave,
    'conversion_aplicada', regla_clave IS NOT NULL
  ) ORDER BY fecha_factura DESC, factura DESC), '[]'::jsonb)
  FROM ventas;
$$;

COMMENT ON TABLE public.repuestos_conversiones_unidad_historica IS
  'Reglas auditables para normalizar cantidades historicas sin modificar las lineas importadas.';
COMMENT ON FUNCTION public.repuestos_aplicar_conversiones_unidad_historica() IS
  'Aplica reglas de unidad desde la fuente cruda y recalcula solamente los productos afectados.';
COMMENT ON FUNCTION public.repuesto_ventas_historial(text) IS
  'Historial de ventas con cantidad original y cantidad normalizada por reglas auditables de unidad.';

REVOKE ALL ON FUNCTION public.repuesto_ventas_historial(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repuesto_ventas_historial(text) TO authenticated;

-- Aplica la correccion a los datos ya publicados. Es acotada a dos codigos.
SELECT public.repuestos_aplicar_conversiones_unidad_historica();

NOTIFY pgrst, 'reload schema';
