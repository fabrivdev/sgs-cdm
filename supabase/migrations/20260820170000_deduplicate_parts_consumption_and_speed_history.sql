-- Evita que una misma venta comercial se contabilice dos veces cuando fue
-- importada tanto desde GRID como desde el historico detallado. Los registros
-- fuente se conservan intactos; solamente se excluye la vinculacion duplicada
-- del historial consolidado y se deja una trazabilidad explicita.

CREATE TABLE IF NOT EXISTS public.repuestos_ventas_duplicadas (
  linea_id uuid PRIMARY KEY
    REFERENCES public.facturacion_lineas_importadas(id) ON DELETE CASCADE,
  linea_canonica_id uuid NOT NULL
    REFERENCES public.facturacion_lineas_importadas(id) ON DELETE CASCADE,
  clave_comercial text NOT NULL,
  origen_descartado text,
  origen_canonico text,
  detectado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS repuestos_ventas_duplicadas_canonica_idx
  ON public.repuestos_ventas_duplicadas(linea_canonica_id);

ALTER TABLE public.repuestos_ventas_duplicadas ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE VIEW public.repuestos_ventas_duplicados_detectados AS
WITH por_origen AS (
  SELECT
    v.linea_id,
    v.producto_codigo,
    v.fecha_efectiva,
    lower(ltrim(trim(coalesce(f.codigo_interno_factura, f.factura)), '0')) AS factura_norm,
    upper(trim(coalesce(f.entidad_nombre, ''))) AS cliente_norm,
    coalesce(v.cantidad, f.cantidad, 0)::numeric AS cantidad,
    coalesce(f.total_venta, 0)::numeric AS total_venta,
    coalesce(f.origen_sistema, 'sin_origen') AS origen_sistema,
    row_number() OVER (
      PARTITION BY
        v.producto_codigo,
        v.fecha_efectiva,
        lower(ltrim(trim(coalesce(f.codigo_interno_factura, f.factura)), '0')),
        upper(trim(coalesce(f.entidad_nombre, ''))),
        coalesce(v.cantidad, f.cantidad, 0)::numeric,
        coalesce(f.total_venta, 0)::numeric,
        coalesce(f.origen_sistema, 'sin_origen')
      ORDER BY v.linea_id
    ) AS ocurrencia_origen
  FROM public.repuestos_ventas_vinculacion v
  JOIN public.facturacion_lineas_importadas f ON f.id = v.linea_id
  WHERE v.estado_vinculo = 'CONFIRMADA'
    AND v.producto_codigo IS NOT NULL
    AND v.fecha_efectiva IS NOT NULL
    AND nullif(trim(coalesce(f.codigo_interno_factura, f.factura)), '') IS NOT NULL
), elegidas AS (
  SELECT
    po.*,
    first_value(po.linea_id) OVER (
      PARTITION BY
        po.producto_codigo, po.fecha_efectiva, po.factura_norm,
        po.cliente_norm, po.cantidad, po.total_venta, po.ocurrencia_origen
      ORDER BY
        CASE po.origen_sistema
          WHEN 'legacy_historico_detallado' THEN 0
          WHEN 'grid_campos' THEN 1
          ELSE 2
        END,
        po.linea_id
    ) AS linea_canonica_id,
    first_value(po.origen_sistema) OVER (
      PARTITION BY
        po.producto_codigo, po.fecha_efectiva, po.factura_norm,
        po.cliente_norm, po.cantidad, po.total_venta, po.ocurrencia_origen
      ORDER BY
        CASE po.origen_sistema
          WHEN 'legacy_historico_detallado' THEN 0
          WHEN 'grid_campos' THEN 1
          ELSE 2
        END,
        po.linea_id
    ) AS origen_canonico,
    row_number() OVER (
      PARTITION BY
        po.producto_codigo, po.fecha_efectiva, po.factura_norm,
        po.cliente_norm, po.cantidad, po.total_venta, po.ocurrencia_origen
      ORDER BY
        CASE po.origen_sistema
          WHEN 'legacy_historico_detallado' THEN 0
          WHEN 'grid_campos' THEN 1
          ELSE 2
        END,
        po.linea_id
    ) AS orden_canonico
  FROM por_origen po
)
SELECT
  e.linea_id,
  e.linea_canonica_id,
  md5(concat_ws('|',
    e.producto_codigo,
    e.fecha_efectiva::text,
    e.factura_norm,
    e.cliente_norm,
    e.cantidad::text,
    e.total_venta::text,
    e.ocurrencia_origen::text
  )) AS clave_comercial,
  e.origen_sistema AS origen_descartado,
  e.origen_canonico
FROM elegidas e
WHERE e.orden_canonico > 1
  AND e.linea_id <> e.linea_canonica_id;

CREATE OR REPLACE FUNCTION public.repuestos_excluir_ventas_duplicadas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_excluidas integer := 0;
BEGIN
  INSERT INTO public.repuestos_ventas_duplicadas(
    linea_id, linea_canonica_id, clave_comercial,
    origen_descartado, origen_canonico, detectado_en
  )
  SELECT
    d.linea_id, d.linea_canonica_id, d.clave_comercial,
    d.origen_descartado, d.origen_canonico, now()
  FROM public.repuestos_ventas_duplicados_detectados d
  ON CONFLICT (linea_id) DO UPDATE SET
    linea_canonica_id = EXCLUDED.linea_canonica_id,
    clave_comercial = EXCLUDED.clave_comercial,
    origen_descartado = EXCLUDED.origen_descartado,
    origen_canonico = EXCLUDED.origen_canonico,
    detectado_en = now();

  DELETE FROM public.repuestos_ventas_vinculacion v
  USING public.repuestos_ventas_duplicados_detectados d
  WHERE v.linea_id = d.linea_id;

  GET DIAGNOSTICS v_excluidas = ROW_COUNT;
  RETURN v_excluidas;
END;
$$;

-- La reconstruccion completa vuelve a insertar las vinculaciones. Este trigger
-- elimina los solapamientos antes de que la funcion agregue la demanda mensual.
CREATE OR REPLACE FUNCTION public.repuestos_excluir_duplicados_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() = 1 THEN
    PERFORM public.repuestos_excluir_ventas_duplicadas();
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS repuestos_excluir_duplicados_insert_trigger
  ON public.repuestos_ventas_vinculacion;
CREATE TRIGGER repuestos_excluir_duplicados_insert_trigger
AFTER INSERT ON public.repuestos_ventas_vinculacion
FOR EACH STATEMENT
EXECUTE FUNCTION public.repuestos_excluir_duplicados_trigger();

DROP TRIGGER IF EXISTS repuestos_excluir_duplicados_update_trigger
  ON public.repuestos_ventas_vinculacion;
CREATE TRIGGER repuestos_excluir_duplicados_update_trigger
AFTER UPDATE OF producto_codigo, estado_vinculo, fecha_efectiva, cantidad
ON public.repuestos_ventas_vinculacion
FOR EACH STATEMENT
EXECUTE FUNCTION public.repuestos_excluir_duplicados_trigger();

-- Aplica la correccion inmediatamente a lo ya publicado.
SELECT public.repuestos_excluir_ventas_duplicadas();

DELETE FROM public.repuestos_demanda_mensual
WHERE producto_codigo IS NOT NULL;

INSERT INTO public.repuestos_demanda_mensual(
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
  sum(CASE
    WHEN upper(coalesce(f.moneda, 'USD')) IN ('GS', 'GRS', 'PYG') THEN 0
    ELSE coalesce(f.total_venta, 0)
  END)::numeric
FROM public.repuestos_ventas_vinculacion v
JOIN public.facturacion_lineas_importadas f ON f.id = v.linea_id
WHERE v.estado_vinculo = 'CONFIRMADA'
  AND v.producto_codigo IS NOT NULL
  AND v.fecha_efectiva IS NOT NULL
GROUP BY v.producto_codigo, date_trunc('month', v.fecha_efectiva)::date;

-- Version rapida del detalle: fecha_efectiva ya fue consolidada durante la
-- preparacion del historial. Evita volver a recorrer toda la facturacion por
-- cada ficha abierta.
CREATE OR REPLACE FUNCTION public.repuesto_ventas_historial(p_producto_codigo text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
SET statement_timeout = '20s'
AS $$
  WITH ventas AS (
    SELECT
      f.id AS linea_id,
      p.codigo_interno AS producto_codigo,
      p.codigo_fabricante AS producto_codigo_fabricante,
      coalesce(f.fecha_factura::date, v.fecha_efectiva) AS fecha_factura,
      coalesce(f.cantidad, v.cantidad, 0)::numeric AS cantidad_original,
      (
        coalesce(f.cantidad, v.cantidad, 0)
        * coalesce(conv.factor_cantidad, 1)
      )::numeric AS cantidad,
      coalesce(f.total_venta, 0)::numeric AS total_venta_usd,
      f.entidad_nombre AS cliente,
      f.sucursal,
      coalesce(f.codigo_interno_factura, f.factura) AS factura,
      f.cod_mercaderia AS codigo_facturado,
      f.codigo_fabricante AS codigo_fabricante_facturado,
      f.mercaderia AS descripcion_facturada,
      coalesce(f.origen_sistema, 'historico') AS origen_sistema,
      coalesce(v.metodo_vinculo, 'vinculacion_confirmada') AS metodo_vinculo,
      coalesce(conv.factor_cantidad, 1)::numeric AS factor_conversion,
      conv.unidad_origen,
      conv.unidad_destino,
      conv.regla_clave
    FROM public.productos p
    JOIN public.repuestos_ventas_vinculacion v
      ON v.producto_codigo = p.codigo_interno
     AND v.estado_vinculo = 'CONFIRMADA'
    JOIN public.facturacion_lineas_importadas f ON f.id = v.linea_id
    LEFT JOIN LATERAL (
      SELECT regla.*
      FROM public.repuestos_conversiones_unidad_historica regla
      WHERE f.origen_sistema = 'legacy_historico_detallado'
        AND regla.activa
        AND regla.codigo_legacy_norm = public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia)
        AND (regla.fecha_desde IS NULL OR coalesce(f.fecha_factura::date, v.fecha_efectiva) >= regla.fecha_desde)
        AND (regla.fecha_hasta_exclusiva IS NULL OR coalesce(f.fecha_factura::date, v.fecha_efectiva) < regla.fecha_hasta_exclusiva)
        AND (
          regla.precio_unitario_min IS NULL
          OR abs(coalesce(f.total_venta, 0) / nullif(coalesce(f.cantidad, v.cantidad, 0), 0)) >= regla.precio_unitario_min
        )
        AND (
          regla.precio_unitario_max IS NULL
          OR abs(coalesce(f.total_venta, 0) / nullif(coalesce(f.cantidad, v.cantidad, 0), 0)) <= regla.precio_unitario_max
        )
      ORDER BY regla.id
      LIMIT 1
    ) conv ON true
    WHERE p.codigo_interno = p_producto_codigo
      AND p.codigo_interno ILIKE 'REP%'
      AND lower(trim(coalesce(f.grupo_normalizado, f.subgrupo_original, ''))) IN
        ('repuesto', 'repuestos', 'repuestos diversos')
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
  ) ORDER BY fecha_factura DESC NULLS LAST, factura DESC), '[]'::jsonb)
  FROM ventas;
$$;

COMMENT ON FUNCTION public.repuesto_ventas_historial(text) IS
  'Detalle indexado, canonico y sin duplicados entre fuentes del historial de repuestos.';

REVOKE ALL ON FUNCTION public.repuesto_ventas_historial(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repuesto_ventas_historial(text) TO authenticated;

REVOKE ALL ON FUNCTION public.repuestos_excluir_ventas_duplicadas() FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';
