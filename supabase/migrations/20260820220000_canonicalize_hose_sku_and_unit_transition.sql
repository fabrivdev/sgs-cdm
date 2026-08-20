-- Consolida el articulo HORSCH 00180125 en su SKU operativo actual.
--
-- Evidencia de origen:
--   * legacy 26391: cantidades expresadas en milimetros (precio aprox. USD 0,06)
--   * legacy 31210: cantidades expresadas en metros (precio aprox. USD 75)
--   * REPIN007693: unico SKU actual con stock y movimientos
--   * REPIN007692: duplicado de maestro sin stock ni movimientos
--
-- La conversion de 26391 ya vive en repuestos_conversiones_unidad_historica.
-- Esta migracion fija la identidad del articulo: ambos codigos legacy terminan
-- en REPIN007693 despues de convertir las cantidades a metros.

CREATE TABLE IF NOT EXISTS public.repuestos_productos_alias (
  alias_codigo text PRIMARY KEY
    REFERENCES public.productos(codigo_interno) ON DELETE CASCADE,
  producto_canonico text NOT NULL
    REFERENCES public.productos(codigo_interno) ON DELETE RESTRICT,
  motivo text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT repuestos_productos_alias_distintos
    CHECK (alias_codigo <> producto_canonico)
);

CREATE INDEX IF NOT EXISTS repuestos_productos_alias_canonico_idx
  ON public.repuestos_productos_alias(producto_canonico)
  WHERE activo;

ALTER TABLE public.repuestos_productos_alias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS repuestos_productos_alias_select
  ON public.repuestos_productos_alias;
CREATE POLICY repuestos_productos_alias_select
ON public.repuestos_productos_alias FOR SELECT TO authenticated
USING (public.has_module_access(auth.uid(), 'repuestos'));

GRANT SELECT ON public.repuestos_productos_alias TO authenticated;

INSERT INTO public.repuestos_productos_alias(
  alias_codigo, producto_canonico, motivo, activo, actualizado_en
)
VALUES (
  'REPIN007692',
  'REPIN007693',
  'Mismo articulo HORSCH 00180125; REPIN007693 concentra stock y movimientos actuales',
  true,
  now()
)
ON CONFLICT (alias_codigo) DO UPDATE SET
  producto_canonico = EXCLUDED.producto_canonico,
  motivo = EXCLUDED.motivo,
  activo = true,
  actualizado_en = now();

-- Una nueva importacion del maestro no debe reactivar el alias descartado.
CREATE OR REPLACE FUNCTION public.repuestos_desactivar_producto_alias_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.repuestos_productos_alias a
    WHERE a.alias_codigo = NEW.codigo_interno
      AND a.activo
  ) THEN
    NEW.activo := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS repuestos_desactivar_producto_alias
  ON public.productos;
CREATE TRIGGER repuestos_desactivar_producto_alias
BEFORE INSERT OR UPDATE OF codigo_interno, activo ON public.productos
FOR EACH ROW EXECUTE FUNCTION public.repuestos_desactivar_producto_alias_trigger();

-- Conserva cualquier parametrizacion manual que hubiese quedado en el alias.
INSERT INTO public.repuestos_articulo_planificacion(
  producto_codigo, criticidad, origen, observaciones,
  criticidad_fuente, criticidad_confianza, stock_minimo_estrategico,
  actualizado_por, actualizado_en
)
SELECT
  'REPIN007693', criticidad, origen, observaciones,
  criticidad_fuente, criticidad_confianza, stock_minimo_estrategico,
  actualizado_por, actualizado_en
FROM public.repuestos_articulo_planificacion
WHERE producto_codigo = 'REPIN007692'
ON CONFLICT (producto_codigo) DO NOTHING;

DELETE FROM public.repuestos_articulo_planificacion
WHERE producto_codigo = 'REPIN007692';

-- Consolida stock por sucursal/deposito por si el alias recibe saldo en una
-- importacion anterior o futura. El SKU canonico mantiene una sola fila por
-- ubicacion gracias a la restriccion unique existente.
CREATE TEMP TABLE tmp_stock_manguera_canonica ON COMMIT DROP AS
SELECT
  sucursal,
  deposito,
  max(descripcion) AS descripcion,
  max(unidad) AS unidad,
  max(codigo_fabricante) AS codigo_fabricante,
  sum(saldo_actual)::numeric AS saldo_actual,
  max(importado_en) AS importado_en
FROM public.repuestos_stock
WHERE producto_codigo IN ('REPIN007692', 'REPIN007693')
GROUP BY sucursal, deposito;

DELETE FROM public.repuestos_stock
WHERE producto_codigo IN ('REPIN007692', 'REPIN007693');

INSERT INTO public.repuestos_stock(
  producto_codigo, descripcion, unidad, codigo_fabricante,
  sucursal, deposito, saldo_actual, importado_en
)
SELECT
  'REPIN007693', descripcion, unidad, codigo_fabricante,
  sucursal, deposito, saldo_actual, importado_en
FROM tmp_stock_manguera_canonica;

-- Fija el maestro legacy para que las reconstrucciones futuras sean
-- deterministas aun cuando ambos productos actuales compartan fabricante y
-- descripcion.
UPDATE public.repuestos_maestro_legacy
SET
  producto_codigo = 'REPIN007693',
  estado_vinculo = 'CONFIRMADA',
  metodo_vinculo = 'CODIGO_ANTERIOR_MANUAL',
  candidatos = ARRAY['REPIN007693']::text[],
  actualizado_en = now()
WHERE codigo_legacy_norm IN ('26391', '31210');

UPDATE public.repuestos_codigo_equivalencias
SET
  producto_codigo = 'REPIN007693',
  metodo = 'CODIGO_ANTERIOR_MANUAL',
  confianza = 1,
  requiere_revision = false,
  manual = true,
  actualizado_en = now()
WHERE codigo_legacy IN ('26391', '31210');

INSERT INTO public.repuestos_codigo_equivalencias(
  marca, codigo_legacy, codigo_fabricante_legacy, producto_codigo,
  metodo, confianza, requiere_revision, manual, actualizado_en
)
SELECT
  'HORSCH'::public.marca,
  codigo_legacy,
  fabricante,
  'REPIN007693',
  'CODIGO_ANTERIOR_MANUAL',
  1,
  false,
  true,
  now()
FROM (VALUES
  ('26391'::text, ''::text),
  ('26391'::text, '180125'::text),
  ('31210'::text, ''::text),
  ('31210'::text, '180125'::text)
) AS fuente(codigo_legacy, fabricante)
ON CONFLICT (marca, codigo_legacy, codigo_fabricante_legacy) DO UPDATE SET
  producto_codigo = EXCLUDED.producto_codigo,
  metodo = EXCLUDED.metodo,
  confianza = EXCLUDED.confianza,
  requiere_revision = false,
  manual = true,
  actualizado_en = now();

-- Reasigna toda linea ya publicada de ambos codigos viejos y cualquier linea
-- que hubiera caido en el SKU duplicado. El metodo manual evita que el trigger
-- de ambiguedad vuelva a separar una decision ya comprobada con el maestro.
UPDATE public.repuestos_ventas_vinculacion v
SET
  producto_codigo = 'REPIN007693',
  estado_vinculo = 'CONFIRMADA',
  metodo_vinculo = 'CODIGO_ANTERIOR_MANUAL',
  prioridad = 0,
  confianza = 1,
  candidatos = ARRAY['REPIN007693']::text[],
  cantidad_candidatos = 1,
  marca_origen = 'HORSCH'::public.marca,
  actualizado_en = now()
FROM public.facturacion_lineas_importadas f
WHERE f.id = v.linea_id
  AND (
    v.producto_codigo = 'REPIN007692'
    OR public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia)
       IN ('26391', '31210')
  );

-- Al converger en un solo SKU pueden aparecer solapamientos entre GRID y el
-- historico detallado. Se vuelve a ejecutar la deduplicacion antes de sumar.
SELECT public.repuestos_excluir_ventas_duplicadas();

DELETE FROM public.repuestos_demanda_mensual
WHERE producto_codigo IN ('REPIN007692', 'REPIN007693');

INSERT INTO public.repuestos_demanda_mensual(
  producto_codigo, mes, unidades_netas, unidades_positivas,
  devoluciones, pedidos, importe_comparable
)
SELECT
  'REPIN007693',
  date_trunc('month', v.fecha_efectiva)::date,
  sum(coalesce(f.cantidad, v.cantidad, 0) * coalesce(conv.factor_cantidad, 1))::numeric,
  sum(greatest(coalesce(f.cantidad, v.cantidad, 0) * coalesce(conv.factor_cantidad, 1), 0))::numeric,
  sum(abs(least(coalesce(f.cantidad, v.cantidad, 0) * coalesce(conv.factor_cantidad, 1), 0)))::numeric,
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
  WHERE regla.activa
    AND regla.codigo_legacy_norm = public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia)
    AND (regla.fecha_desde IS NULL OR v.fecha_efectiva >= regla.fecha_desde)
    AND (regla.fecha_hasta_exclusiva IS NULL OR v.fecha_efectiva < regla.fecha_hasta_exclusiva)
    AND (
      regla.precio_unitario_min IS NULL
      OR abs(coalesce(f.total_venta, 0) / nullif(coalesce(f.cantidad, v.cantidad, 0), 0))
         >= regla.precio_unitario_min
    )
    AND (
      regla.precio_unitario_max IS NULL
      OR abs(coalesce(f.total_venta, 0) / nullif(coalesce(f.cantidad, v.cantidad, 0), 0))
         <= regla.precio_unitario_max
    )
  ORDER BY regla.id
  LIMIT 1
) conv ON true
WHERE v.estado_vinculo = 'CONFIRMADA'
  AND v.producto_codigo = 'REPIN007693'
  AND v.fecha_efectiva IS NOT NULL
GROUP BY date_trunc('month', v.fecha_efectiva)::date;

UPDATE public.productos
SET activo = false
WHERE codigo_interno = 'REPIN007692';

-- El catalogo no debe mostrar productos inactivos ni aliases persistentes.
CREATE OR REPLACE VIEW public.v_repuestos_stock_matriz AS
SELECT
  p.codigo_interno,
  p.descripcion,
  p.codigo_fabricante,
  p.marca,
  p.familia,
  p.unidad,
  coalesce(sum(rs.saldo_actual) FILTER (WHERE rs.sucursal = 'Santa Rita'), 0) AS santa_rita,
  coalesce(sum(rs.saldo_actual) FILTER (WHERE rs.sucursal = 'Santa Rosa'), 0) AS santa_rosa,
  coalesce(sum(rs.saldo_actual) FILTER (WHERE rs.sucursal = 'Campo 9'), 0) AS campo_9,
  coalesce(sum(rs.saldo_actual) FILTER (WHERE rs.sucursal = 'Misiones'), 0) AS misiones,
  coalesce(sum(rs.saldo_actual) FILTER (WHERE rs.sucursal = 'Loma Plata'), 0) AS loma_plata,
  coalesce(sum(rs.saldo_actual) FILTER (WHERE rs.sucursal = 'Katuete'), 0) AS katuete,
  coalesce(sum(rs.saldo_actual), 0) AS total
FROM public.productos p
LEFT JOIN public.repuestos_stock rs ON rs.producto_codigo = p.codigo_interno
WHERE p.codigo_interno ILIKE 'REP%'
  AND p.activo
  AND NOT EXISTS (
    SELECT 1
    FROM public.repuestos_productos_alias a
    WHERE a.alias_codigo = p.codigo_interno
      AND a.activo
  )
GROUP BY p.codigo_interno, p.descripcion, p.codigo_fabricante,
  p.marca, p.familia, p.unidad;

ALTER VIEW public.v_repuestos_stock_matriz SET (security_invoker = true);

CREATE OR REPLACE FUNCTION public.repuesto_hermanos(p_producto_codigo text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH producto AS MATERIALIZED (
    SELECT
      p.codigo_interno,
      public.normalizar_codigo_repuesto_flexible(p.codigo_fabricante) AS codigo_fabricante_norm,
      public.extraer_codigo_repuesto_descripcion(p.descripcion) AS codigo_descripcion_norm
    FROM public.productos p
    WHERE p.codigo_interno = p_producto_codigo
      AND p.codigo_interno ILIKE 'REP%'
      AND p.activo
    LIMIT 1
  ),
  hermanos AS (
    SELECT DISTINCT p2.codigo_interno, p2.descripcion
    FROM producto p
    JOIN public.productos p2
      ON p2.codigo_interno <> p.codigo_interno
     AND p2.codigo_interno ILIKE 'REP%'
     AND p2.activo
     AND NOT EXISTS (
       SELECT 1 FROM public.repuestos_productos_alias a
       WHERE a.alias_codigo = p2.codigo_interno AND a.activo
     )
     AND (
       (p.codigo_fabricante_norm IS NOT NULL
        AND public.normalizar_codigo_repuesto_flexible(p2.codigo_fabricante) = p.codigo_fabricante_norm)
       OR
       (p.codigo_descripcion_norm IS NOT NULL
        AND public.extraer_codigo_repuesto_descripcion(p2.descripcion) = p.codigo_descripcion_norm)
     )
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object('codigo_interno', codigo_interno, 'descripcion', descripcion)
      ORDER BY codigo_interno
    ),
    '[]'::jsonb
  )
  FROM hermanos;
$$;

REVOKE ALL ON FUNCTION public.repuesto_hermanos(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repuesto_hermanos(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
