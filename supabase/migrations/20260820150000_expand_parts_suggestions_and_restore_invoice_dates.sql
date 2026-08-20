-- Amplia el motor de compra a todos los repuestos y restaura la fecha de
-- lineas de factura cuyo export de TOTVS solo informo EMISION en una linea
-- hermana. La vista TODAS se compone en el cliente con los tres modelos.

-- El CHECK original limitaba los modelos a CLAAS/HORSCH.
DO $$
DECLARE
  v_constraint record;
BEGIN
  FOR v_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.repuestos_modelo_versiones'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%CLAAS%'
      AND pg_get_constraintdef(oid) ILIKE '%HORSCH%'
      AND pg_get_constraintdef(oid) ILIKE '%marca%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.repuestos_modelo_versiones DROP CONSTRAINT %I',
      v_constraint.conname
    );
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.repuestos_modelo_versiones'::regclass
      AND conname = 'repuestos_modelo_versiones_marca_soportada_check'
  ) THEN
    ALTER TABLE public.repuestos_modelo_versiones
      ADD CONSTRAINT repuestos_modelo_versiones_marca_soportada_check
      CHECK (marca IN ('CLAAS'::public.marca, 'HORSCH'::public.marca, 'OTROS'::public.marca));
  END IF;
END;
$$;

-- OTROS parte de la politica CLAAS como configuracion inicial conservadora.
-- Luego puede versionarse de forma independiente desde Parametros.
WITH fuente AS (
  SELECT *
  FROM public.repuestos_modelo_versiones
  WHERE marca = 'CLAAS'::public.marca AND activa
  LIMIT 1
), siguiente AS (
  SELECT coalesce(max(version), 0) + 1 AS version
  FROM public.repuestos_modelo_versiones
  WHERE marca = 'OTROS'::public.marca
)
INSERT INTO public.repuestos_modelo_versiones (
  marca, version, nombre, activa,
  peso_reciente, peso_anterior, lead_time_meses, ciclo_planificacion_meses,
  origen_predeterminado, abc_limite_a, abc_limite_b,
  fsn_pedidos_f, fsn_dias_f, fsn_dias_n,
  xyz_cv_x, xyz_cv_y, xyz_meses_x, xyz_meses_y_min, xyz_meses_y_max,
  adi_intermitente_umbral, cv2_erratico_umbral,
  tendencia_caida_umbral, tendencia_caida_tope,
  stock_seguridad_tope, cobertura_margen_meses,
  pedido_unico_cobertura_meses, creado_por
)
SELECT
  'OTROS'::public.marca, siguiente.version, 'Modelo inicial OTROS', true,
  fuente.peso_reciente, fuente.peso_anterior,
  fuente.lead_time_meses, fuente.ciclo_planificacion_meses,
  fuente.origen_predeterminado, fuente.abc_limite_a, fuente.abc_limite_b,
  fuente.fsn_pedidos_f, fuente.fsn_dias_f, fuente.fsn_dias_n,
  fuente.xyz_cv_x, fuente.xyz_cv_y, fuente.xyz_meses_x,
  fuente.xyz_meses_y_min, fuente.xyz_meses_y_max,
  fuente.adi_intermitente_umbral, fuente.cv2_erratico_umbral,
  fuente.tendencia_caida_umbral, fuente.tendencia_caida_tope,
  fuente.stock_seguridad_tope, fuente.cobertura_margen_meses,
  fuente.pedido_unico_cobertura_meses, NULL
FROM fuente CROSS JOIN siguiente
WHERE NOT EXISTS (
  SELECT 1 FROM public.repuestos_modelo_versiones
  WHERE marca = 'OTROS'::public.marca AND activa
);

WITH destino AS (
  SELECT id FROM public.repuestos_modelo_versiones
  WHERE marca = 'OTROS'::public.marca AND activa LIMIT 1
), fuente AS (
  SELECT id FROM public.repuestos_modelo_versiones
  WHERE marca = 'CLAAS'::public.marca AND activa LIMIT 1
)
INSERT INTO public.repuestos_modelo_segmentos (
  modelo_version_id, segmento, nivel_servicio, revision_meses, valor_z, descripcion
)
SELECT d.id, s.segmento, s.nivel_servicio, s.revision_meses, s.valor_z, s.descripcion
FROM destino d CROSS JOIN fuente f
JOIN public.repuestos_modelo_segmentos s ON s.modelo_version_id = f.id
ON CONFLICT (modelo_version_id, segmento) DO NOTHING;

WITH destino AS (
  SELECT id FROM public.repuestos_modelo_versiones
  WHERE marca = 'OTROS'::public.marca AND activa LIMIT 1
), fuente AS (
  SELECT id FROM public.repuestos_modelo_versiones
  WHERE marca = 'CLAAS'::public.marca AND activa LIMIT 1
)
INSERT INTO public.repuestos_modelo_reglas_mix (modelo_version_id, codigo_mix, segmento)
SELECT d.id, r.codigo_mix, r.segmento
FROM destino d CROSS JOIN fuente f
JOIN public.repuestos_modelo_reglas_mix r ON r.modelo_version_id = f.id
ON CONFLICT (modelo_version_id, codigo_mix) DO NOTHING;

-- Las funciones vigentes son extensas y ya fueron endurecidas en seguridad.
-- Se conserva exactamente esa version y solo se amplian sus validaciones y
-- el limite interno necesario para paginar correctamente la vista TODAS.
DO $$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_updated text;
BEGIN
  v_signature := 'public.repuestos_sugerencia_viva_base_v1(text,date,text,text,text,boolean,integer,integer)'::regprocedure;
  v_definition := pg_get_functiondef(v_signature);
  v_updated := replace(v_definition,
    'NOT IN (''CLAAS'', ''HORSCH'')',
    'NOT IN (''CLAAS'', ''HORSCH'', ''OTROS'')');
  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'No se pudo ampliar la validacion de marcas de repuestos_sugerencia_viva_base_v1';
  END IF;
  EXECUTE v_updated;

  v_signature := 'public.repuestos_crear_version_modelo(text,text,jsonb,jsonb)'::regprocedure;
  v_definition := pg_get_functiondef(v_signature);
  v_updated := replace(v_definition,
    'NOT IN (''CLAAS'',''HORSCH'')',
    'NOT IN (''CLAAS'',''HORSCH'',''OTROS'')');
  v_updated := replace(v_updated,
    'NOT IN (''CLAAS'', ''HORSCH'')',
    'NOT IN (''CLAAS'', ''HORSCH'', ''OTROS'')');
  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'No se pudo ampliar la validacion de marcas de repuestos_crear_version_modelo';
  END IF;
  EXECUTE v_updated;

  v_signature := 'public.repuestos_sugerencia_viva(text,date,text,text,text,boolean,integer,integer)'::regprocedure;
  v_definition := pg_get_functiondef(v_signature);
  v_updated := replace(v_definition,
    'least(coalesce(p_limite, 50), 1000)',
    'least(coalesce(p_limite, 50), 20000)');
  IF v_updated <> v_definition THEN
    EXECUTE v_updated;
  END IF;
END;
$$;

-- El importador TOTVS no repite EMISION en todas las lineas de una factura.
-- La optimizacion del detalle habia eliminado el fallback existente. Se
-- restaura sin volver a ejecutar el costoso motor de vinculacion.
CREATE OR REPLACE FUNCTION public.repuesto_ventas_historial(p_producto_codigo text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH producto AS MATERIALIZED (
    SELECT p.codigo_interno, p.codigo_fabricante
    FROM public.productos p
    WHERE p.codigo_interno = p_producto_codigo
      AND p.codigo_interno ILIKE 'REP%'
    LIMIT 1
  ),
  ventas AS (
    SELECT
      f.id AS linea_id,
      p.codigo_interno AS producto_codigo,
      p.codigo_fabricante AS producto_codigo_fabricante,
      coalesce(
        f.fecha_factura::date,
        v.fecha_efectiva,
        hermana.fecha_factura,
        cabecera.fecha_factura
      ) AS fecha_factura,
      coalesce(f.cantidad, v.cantidad, 0)::numeric AS cantidad_original,
      (coalesce(f.cantidad, v.cantidad, 0) * coalesce(conv.factor_cantidad, 1))::numeric AS cantidad,
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
    FROM producto p
    JOIN public.repuestos_ventas_vinculacion v
      ON v.producto_codigo = p.codigo_interno
     AND v.estado_vinculo = 'CONFIRMADA'
    JOIN public.facturacion_lineas_importadas f ON f.id = v.linea_id
    LEFT JOIN LATERAL (
      SELECT min(f2.fecha_factura::date) AS fecha_factura
      FROM public.facturacion_lineas_importadas f2
      WHERE f.fecha_factura IS NULL
        AND f2.fecha_factura IS NOT NULL
        AND (
          (f.codigo_interno_factura IS NOT NULL AND f2.codigo_interno_factura = f.codigo_interno_factura)
          OR (f.factura IS NOT NULL AND f2.factura = f.factura)
          OR (f.codigo_interno_factura IS NOT NULL AND f2.factura = f.codigo_interno_factura)
          OR (f.factura IS NOT NULL AND f2.codigo_interno_factura = f.factura)
        )
      HAVING count(DISTINCT f2.fecha_factura::date) = 1
    ) hermana ON true
    LEFT JOIN LATERAL (
      SELECT min(fc.fecha) AS fecha_factura
      FROM public.facturacion fc
      WHERE f.fecha_factura IS NULL
        AND (
          (f.codigo_interno_factura IS NOT NULL AND lower(fc.cod_factura) = lower(f.codigo_interno_factura))
          OR (f.factura IS NOT NULL AND lower(fc.cod_factura) = lower(f.factura))
        )
      HAVING count(DISTINCT fc.fecha) = 1
    ) cabecera ON true
    LEFT JOIN LATERAL (
      SELECT regla.*
      FROM public.repuestos_conversiones_unidad_historica regla
      WHERE f.origen_sistema = 'legacy_historico_detallado'
        AND regla.activa
        AND regla.codigo_legacy_norm = public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia)
        AND (regla.fecha_desde IS NULL OR coalesce(f.fecha_factura::date, v.fecha_efectiva, hermana.fecha_factura, cabecera.fecha_factura) >= regla.fecha_desde)
        AND (regla.fecha_hasta_exclusiva IS NULL OR coalesce(f.fecha_factura::date, v.fecha_efectiva, hermana.fecha_factura, cabecera.fecha_factura) < regla.fecha_hasta_exclusiva)
        AND (regla.precio_unitario_min IS NULL OR abs(coalesce(f.total_venta, 0) / nullif(coalesce(f.cantidad, v.cantidad), 0)) >= regla.precio_unitario_min)
        AND (regla.precio_unitario_max IS NULL OR abs(coalesce(f.total_venta, 0) / nullif(coalesce(f.cantidad, v.cantidad), 0)) <= regla.precio_unitario_max)
      ORDER BY regla.id
      LIMIT 1
    ) conv ON true
    WHERE lower(trim(coalesce(f.grupo_normalizado, f.subgrupo_original, ''))) IN
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
  'Detalle indexado de ventas confirmadas; recupera fechas omitidas por TOTVS desde lineas hermanas o la cabecera exacta de factura.';

REVOKE ALL ON FUNCTION public.repuesto_ventas_historial(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repuesto_ventas_historial(text) TO authenticated;

REVOKE ALL ON FUNCTION public.repuestos_sugerencia_viva_base_v1(text,date,text,text,text,boolean,integer,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.repuestos_sugerencia_viva(text,date,text,text,text,boolean,integer,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.repuestos_crear_version_modelo(text,text,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repuestos_sugerencia_viva(text,date,text,text,text,boolean,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_crear_version_modelo(text,text,jsonb,jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
