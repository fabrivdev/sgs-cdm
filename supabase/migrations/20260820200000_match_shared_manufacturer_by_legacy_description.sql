-- Un mismo codigo de fabricante puede representar mas de una fila comercial
-- en ambos maestros. El codigo interno viejo + su descripcion identifica cual
-- fila actual debe recibir los movimientos.
--
-- No se usa fuzzy matching. Solamente se acepta una descripcion exactamente
-- igual despues de normalizar mayusculas, acentos, separadores y decimales
-- escritos como 10,5 / 10.5 / 105.

CREATE OR REPLACE FUNCTION public.normalizar_descripcion_repuesto_comparable(
  p_texto text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  WITH base AS (
    SELECT translate(
      upper(trim(coalesce(p_texto, ''))),
      'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
      'AAAAAEEEEIIIIOOOOOUUUUNC'
    ) AS valor
  ), decimales AS (
    SELECT regexp_replace(valor, '([0-9])[,.]([0-9])', '\1\2', 'g') AS valor
    FROM base
  )
  SELECT nullif(
    btrim(regexp_replace(valor, '[^A-Z0-9]+', ' ', 'g')),
    ''
  )
  FROM decimales;
$$;

REVOKE ALL ON FUNCTION public.normalizar_descripcion_repuesto_comparable(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalizar_descripcion_repuesto_comparable(text)
  TO authenticated;

-- Protege futuras reconciliaciones del maestro viejo. Si varios productos
-- comparten fabricante, la descripcion completa puede reducirlos a uno.
CREATE OR REPLACE FUNCTION public.repuestos_resolver_maestro_por_descripcion_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_producto text;
  v_cantidad integer := 0;
BEGIN
  IF cardinality(coalesce(NEW.candidatos, '{}'::text[])) <= 1
     OR public.normalizar_descripcion_repuesto_comparable(NEW.descripcion) IS NULL
  THEN
    RETURN NEW;
  END IF;

  SELECT min(p.codigo_interno), count(*)::integer
  INTO v_producto, v_cantidad
  FROM public.productos p
  WHERE p.activo
    AND p.codigo_interno = ANY(NEW.candidatos)
    AND public.normalizar_descripcion_repuesto_comparable(p.descripcion)
      = public.normalizar_descripcion_repuesto_comparable(NEW.descripcion);

  IF v_cantidad = 1 THEN
    NEW.producto_codigo := v_producto;
    NEW.estado_vinculo := 'CONFIRMADA';
    NEW.metodo_vinculo := 'FABRICANTE_Y_DESCRIPCION_COMPARABLE';
    NEW.candidatos := ARRAY[v_producto];
    NEW.actualizado_en := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS repuestos_resolver_maestro_por_descripcion
  ON public.repuestos_maestro_legacy;
CREATE TRIGGER repuestos_resolver_maestro_por_descripcion
BEFORE INSERT OR UPDATE ON public.repuestos_maestro_legacy
FOR EACH ROW
EXECUTE FUNCTION public.repuestos_resolver_maestro_por_descripcion_trigger();

-- Amplia la proteccion de la migracion anterior: primero intenta separar los
-- candidatos por la descripcion facturada. Solo si no obtiene uno unico deja
-- la linea como AMBIGUA.
CREATE OR REPLACE FUNCTION public.repuestos_impedir_vinculo_ambiguo_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_producto text;
  v_cantidad integer := 0;
  v_descripcion_facturada text;
BEGIN
  IF coalesce(NEW.cantidad_candidatos, 0) > 1
     AND coalesce(NEW.metodo_vinculo, '') <> 'CODIGO_ANTERIOR_MANUAL'
  THEN
    SELECT f.mercaderia
    INTO v_descripcion_facturada
    FROM public.facturacion_lineas_importadas f
    WHERE f.id = NEW.linea_id;

    IF public.normalizar_descripcion_repuesto_comparable(v_descripcion_facturada) IS NOT NULL THEN
      SELECT min(p.codigo_interno), count(*)::integer
      INTO v_producto, v_cantidad
      FROM public.productos p
      WHERE p.activo
        AND p.codigo_interno = ANY(NEW.candidatos)
        AND public.normalizar_descripcion_repuesto_comparable(p.descripcion)
          = public.normalizar_descripcion_repuesto_comparable(v_descripcion_facturada);
    END IF;

    IF v_cantidad = 1 THEN
      NEW.producto_codigo := v_producto;
      NEW.estado_vinculo := 'CONFIRMADA';
      NEW.metodo_vinculo := 'DESCRIPCION_COMPARABLE_UNICA';
      NEW.prioridad := 1;
      NEW.confianza := 0.97;
      NEW.candidatos := ARRAY[v_producto];
      NEW.cantidad_candidatos := 1;
    ELSE
      NEW.producto_codigo := NULL;
      NEW.estado_vinculo := 'AMBIGUA';
      NEW.metodo_vinculo := nullif(
        regexp_replace(coalesce(NEW.metodo_vinculo, ''), '_CANONICO$', ''),
        ''
      );
      NEW.confianza := 0;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Reevalua todas las filas ya cargadas. Los triggers anteriores resuelven
-- solamente los casos que tienen una unica descripcion comparable.
UPDATE public.repuestos_maestro_legacy
SET actualizado_en = now()
WHERE cardinality(candidatos) > 1;

UPDATE public.repuestos_ventas_vinculacion
SET actualizado_en = now()
WHERE cantidad_candidatos > 1
  AND coalesce(metodo_vinculo, '') <> 'CODIGO_ANTERIOR_MANUAL';

UPDATE public.repuestos_maestro_legacy_cargas c
SET
  vinculadas = stats.vinculadas,
  canonicas = 0,
  sin_coincidencia = stats.sin_coincidencia
FROM (
  SELECT
    m.carga_id,
    count(*) FILTER (WHERE m.estado_vinculo = 'CONFIRMADA')::integer AS vinculadas,
    count(*) FILTER (WHERE m.estado_vinculo = 'SIN_COINCIDENCIA')::integer AS sin_coincidencia
  FROM public.repuestos_maestro_legacy m
  GROUP BY m.carga_id
) stats
WHERE c.id = stats.carga_id;

-- Vuelve a excluir solapamientos entre fuentes una vez reasignados los SKU.
SELECT public.repuestos_excluir_ventas_duplicadas();

-- Reconstruye la demanda con los nuevos vinculos y conserva conversiones de
-- unidad historica ya configuradas.
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
