-- Corrige dos riesgos del historial de repuestos:
-- 1. Una coincidencia con varios SKU igualmente validos ya no puede elegirse
--    por stock, antiguedad o marca. Queda AMBIGUA hasta una decision manual.
-- 2. El solapamiento GRID / historico se reconoce aunque ambos origenes hayan
--    redondeado de forma distinta el importe de la misma operacion.
--
-- Las repeticiones dentro de un MISMO origen no se eliminan automaticamente:
-- pueden ser dos renglones reales de una factura. Se publican en una vista de
-- auditoria para revisarlas con la linea fuente antes de excluirlas.

CREATE OR REPLACE FUNCTION public.repuestos_impedir_vinculo_ambiguo_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF coalesce(NEW.cantidad_candidatos, 0) > 1
     AND coalesce(NEW.metodo_vinculo, '') <> 'CODIGO_ANTERIOR_MANUAL'
  THEN
    NEW.producto_codigo := NULL;
    NEW.estado_vinculo := 'AMBIGUA';
    NEW.metodo_vinculo := nullif(
      regexp_replace(coalesce(NEW.metodo_vinculo, ''), '_CANONICO$', ''),
      ''
    );
    NEW.confianza := 0;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS repuestos_impedir_vinculo_ambiguo
  ON public.repuestos_ventas_vinculacion;
CREATE TRIGGER repuestos_impedir_vinculo_ambiguo
BEFORE INSERT OR UPDATE ON public.repuestos_ventas_vinculacion
FOR EACH ROW
EXECUTE FUNCTION public.repuestos_impedir_vinculo_ambiguo_trigger();

-- Repara las elecciones canonicas que ya estaban publicadas.
UPDATE public.repuestos_ventas_vinculacion
SET
  producto_codigo = NULL,
  estado_vinculo = 'AMBIGUA',
  metodo_vinculo = nullif(
    regexp_replace(coalesce(metodo_vinculo, ''), '_CANONICO$', ''),
    ''
  ),
  confianza = 0,
  actualizado_en = now()
WHERE cantidad_candidatos > 1
  AND coalesce(metodo_vinculo, '') <> 'CODIGO_ANTERIOR_MANUAL'
  AND (
    estado_vinculo <> 'AMBIGUA'
    OR producto_codigo IS NOT NULL
    OR confianza <> 0
  );

CREATE OR REPLACE VIEW public.repuestos_ventas_duplicados_detectados
WITH (security_invoker = true)
AS
WITH por_origen AS (
  SELECT
    v.linea_id,
    v.producto_codigo,
    v.fecha_efectiva,
    lower(ltrim(trim(coalesce(f.codigo_interno_factura, f.factura)), '0')) AS factura_norm,
    upper(regexp_replace(trim(coalesce(f.entidad_nombre, '')), '\s+', ' ', 'g')) AS cliente_norm,
    coalesce(v.cantidad, f.cantidad, 0)::numeric AS cantidad,
    coalesce(f.total_venta, 0)::numeric AS total_venta,
    coalesce(f.origen_sistema, 'sin_origen') AS origen_sistema,
    row_number() OVER (
      PARTITION BY
        v.producto_codigo,
        v.fecha_efectiva,
        lower(ltrim(trim(coalesce(f.codigo_interno_factura, f.factura)), '0')),
        upper(regexp_replace(trim(coalesce(f.entidad_nombre, '')), '\s+', ' ', 'g')),
        coalesce(v.cantidad, f.cantidad, 0)::numeric,
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
        po.cliente_norm, po.cantidad, po.ocurrencia_origen
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
        po.cliente_norm, po.cantidad, po.ocurrencia_origen
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
        po.cliente_norm, po.cantidad, po.ocurrencia_origen
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
    e.ocurrencia_origen::text
  )) AS clave_comercial,
  e.origen_sistema AS origen_descartado,
  e.origen_canonico
FROM elegidas e
WHERE e.orden_canonico > 1
  AND e.linea_id <> e.linea_canonica_id;

-- Casos sospechosos dentro de un mismo origen. Es solo lectura: no se puede
-- saber sin la factura fuente si son duplicados o dos renglones genuinos.
CREATE OR REPLACE VIEW public.repuestos_ventas_posibles_duplicadas_mismo_origen
WITH (security_invoker = true)
AS
SELECT
  v.producto_codigo,
  v.fecha_efectiva,
  lower(ltrim(trim(coalesce(f.codigo_interno_factura, f.factura)), '0')) AS factura_norm,
  upper(regexp_replace(trim(coalesce(f.entidad_nombre, '')), '\s+', ' ', 'g')) AS cliente_norm,
  coalesce(f.origen_sistema, 'sin_origen') AS origen_sistema,
  coalesce(v.cantidad, f.cantidad, 0)::numeric AS cantidad,
  coalesce(f.total_venta, 0)::numeric AS total_venta,
  count(*)::integer AS repeticiones,
  array_agg(v.linea_id ORDER BY v.linea_id) AS lineas,
  array_agg(f.raw_data ->> 'linea_clave' ORDER BY v.linea_id)
    FILTER (WHERE nullif(f.raw_data ->> 'linea_clave', '') IS NOT NULL) AS lineas_fuente
FROM public.repuestos_ventas_vinculacion v
JOIN public.facturacion_lineas_importadas f ON f.id = v.linea_id
WHERE v.estado_vinculo = 'CONFIRMADA'
  AND v.producto_codigo IS NOT NULL
  AND v.fecha_efectiva IS NOT NULL
  AND nullif(trim(coalesce(f.codigo_interno_factura, f.factura)), '') IS NOT NULL
GROUP BY
  v.producto_codigo,
  v.fecha_efectiva,
  lower(ltrim(trim(coalesce(f.codigo_interno_factura, f.factura)), '0')),
  upper(regexp_replace(trim(coalesce(f.entidad_nombre, '')), '\s+', ' ', 'g')),
  coalesce(f.origen_sistema, 'sin_origen'),
  coalesce(v.cantidad, f.cantidad, 0)::numeric,
  coalesce(f.total_venta, 0)::numeric
HAVING count(*) > 1;

REVOKE ALL ON TABLE public.repuestos_ventas_posibles_duplicadas_mismo_origen
  FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.repuestos_ventas_posibles_duplicadas_mismo_origen
  TO authenticated;

-- Excluye nuevamente los solapamientos entre origenes con la clave corregida.
SELECT public.repuestos_excluir_ventas_duplicadas();

-- Reconstruye la demanda solo con lineas confirmadas e incorpora las reglas de
-- conversion de unidad historica que ya utiliza el detalle del producto.
DELETE FROM public.repuestos_demanda_mensual
WHERE producto_codigo IS NOT NULL;

INSERT INTO public.repuestos_demanda_mensual(
  producto_codigo, mes, unidades_netas, unidades_positivas,
  devoluciones, pedidos, importe_comparable
)
SELECT
  v.producto_codigo,
  date_trunc('month', v.fecha_efectiva)::date,
  sum(
    coalesce(f.cantidad, v.cantidad, 0) * coalesce(conv.factor_cantidad, 1)
  )::numeric,
  sum(greatest(
    coalesce(f.cantidad, v.cantidad, 0) * coalesce(conv.factor_cantidad, 1),
    0
  ))::numeric,
  sum(abs(least(
    coalesce(f.cantidad, v.cantidad, 0) * coalesce(conv.factor_cantidad, 1),
    0
  )))::numeric,
  count(DISTINCT coalesce(f.codigo_interno_factura, f.factura, f.id::text))::integer,
  sum(CASE
    WHEN upper(coalesce(f.moneda, 'USD')) IN ('GS', 'GRS', 'PYG') THEN 0
    ELSE coalesce(f.total_venta, 0)
  END)::numeric
FROM public.repuestos_ventas_vinculacion v
JOIN public.facturacion_lineas_importadas f ON f.id = v.linea_id
LEFT JOIN LATERAL (
  SELECT regla.factor_cantidad
  FROM public.repuestos_conversiones_unidad_historica regla
  WHERE f.origen_sistema = 'legacy_historico_detallado'
    AND regla.activa
    AND regla.codigo_legacy_norm = public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia)
    AND (regla.fecha_desde IS NULL OR v.fecha_efectiva >= regla.fecha_desde)
    AND (regla.fecha_hasta_exclusiva IS NULL OR v.fecha_efectiva < regla.fecha_hasta_exclusiva)
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
WHERE v.estado_vinculo = 'CONFIRMADA'
  AND v.producto_codigo IS NOT NULL
  AND v.fecha_efectiva IS NOT NULL
GROUP BY v.producto_codigo, date_trunc('month', v.fecha_efectiva)::date;

UPDATE public.repuestos_facturacion_historica_cargas c
SET
  lineas_vinculadas = stats.lineas,
  productos_vinculados = stats.productos
FROM (
  SELECT
    count(*) FILTER (WHERE estado_vinculo = 'CONFIRMADA')::integer AS lineas,
    count(DISTINCT producto_codigo)
      FILTER (WHERE estado_vinculo = 'CONFIRMADA')::integer AS productos
  FROM public.repuestos_ventas_vinculacion
) stats
WHERE c.activo AND c.estado = 'COMPLETADO';

NOTIFY pgrst, 'reload schema';
