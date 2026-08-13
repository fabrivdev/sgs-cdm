-- Motor vivo de sugerencia de compra.
-- Lee exclusivamente la demanda mensual de vinculaciones confirmadas y no
-- crea corridas ni snapshots. Los cambios de fecha, marca o modelo se reflejan
-- en la siguiente consulta.

CREATE OR REPLACE FUNCTION public.repuestos_sugerencia_viva(
  p_marca text,
  p_fecha_analisis date,
  p_buscar text DEFAULT NULL,
  p_segmento text DEFAULT NULL,
  p_estado text DEFAULT NULL,
  p_solo_sugeridos boolean DEFAULT false,
  p_limite integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '30s'
AS $$
DECLARE
  v_modelo public.repuestos_modelo_versiones%ROWTYPE;
  v_fecha date := coalesce(p_fecha_analisis, current_date);
  v_marca text := upper(trim(coalesce(p_marca, '')));
  v_resultado jsonb;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.has_module_access(auth.uid(), 'repuestos') THEN
    RAISE EXCEPTION 'No tenes acceso al modulo de repuestos' USING ERRCODE = '42501';
  END IF;

  IF v_marca NOT IN ('CLAAS', 'HORSCH') THEN
    RAISE EXCEPTION 'Marca no valida: %', p_marca;
  END IF;

  SELECT * INTO v_modelo
  FROM public.repuestos_modelo_versiones
  WHERE marca::text = v_marca AND activa
  LIMIT 1;

  IF v_modelo.id IS NULL THEN
    RAISE EXCEPTION 'No existe un modelo activo para %', v_marca;
  END IF;

  WITH
  productos_base AS MATERIALIZED (
    SELECT
      p.codigo_interno AS producto_codigo,
      p.codigo_fabricante,
      p.descripcion,
      p.familia,
      p.marca,
      p.incorporado_en,
      coalesce(ap.origen, v_modelo.origen_predeterminado) AS origen,
      coalesce(ap.stock_minimo_estrategico, 0)::numeric AS stock_minimo_estrategico
    FROM public.productos p
    LEFT JOIN public.repuestos_articulo_planificacion ap
      ON ap.producto_codigo = p.codigo_interno
    WHERE p.activo
      AND p.codigo_interno ILIKE 'REP%'
      AND p.marca::text = v_marca
  ),
  stock AS MATERIALIZED (
    SELECT s.producto_codigo, coalesce(sum(s.saldo_actual), 0)::numeric AS stock_global
    FROM public.repuestos_stock s
    JOIN productos_base p ON p.producto_codigo = s.producto_codigo
    GROUP BY s.producto_codigo
  ),
  demanda AS MATERIALIZED (
    SELECT
      p.producto_codigo,
      coalesce(sum(d.unidades_netas) FILTER (
        WHERE d.mes >= date_trunc('month', v_fecha)::date - interval '11 months'
          AND d.mes <= date_trunc('month', v_fecha)::date
      ), 0)::numeric AS unidades_12m,
      coalesce(sum(d.unidades_netas) FILTER (
        WHERE d.mes >= date_trunc('month', v_fecha)::date - interval '23 months'
          AND d.mes <= date_trunc('month', v_fecha)::date
      ), 0)::numeric AS unidades_24m,
      coalesce(sum(d.importe_comparable) FILTER (
        WHERE d.mes >= date_trunc('month', v_fecha)::date - interval '11 months'
          AND d.mes <= date_trunc('month', v_fecha)::date
      ), 0)::numeric AS total_vendido_12m,
      coalesce(sum(d.importe_comparable) FILTER (
        WHERE d.mes >= date_trunc('month', v_fecha)::date - interval '23 months'
          AND d.mes <= date_trunc('month', v_fecha)::date
      ), 0)::numeric AS total_vendido_24m,
      coalesce(sum(d.pedidos) FILTER (
        WHERE d.mes >= date_trunc('month', v_fecha)::date - interval '11 months'
          AND d.mes <= date_trunc('month', v_fecha)::date
      ), 0)::integer AS pedidos_12m,
      coalesce(sum(d.pedidos) FILTER (
        WHERE d.mes >= date_trunc('month', v_fecha)::date - interval '23 months'
          AND d.mes <= date_trunc('month', v_fecha)::date
      ), 0)::integer AS pedidos_24m,
      count(*) FILTER (
        WHERE d.mes >= date_trunc('month', v_fecha)::date - interval '11 months'
          AND d.mes <= date_trunc('month', v_fecha)::date
          AND d.unidades_positivas > 0
      )::integer AS meses_venta_12m,
      count(*) FILTER (
        WHERE d.mes >= date_trunc('month', v_fecha)::date - interval '23 months'
          AND d.mes <= date_trunc('month', v_fecha)::date
          AND d.unidades_positivas > 0
      )::integer AS meses_venta_24m,
      coalesce(sum(power(d.unidades_netas, 2)) FILTER (
        WHERE d.mes >= date_trunc('month', v_fecha)::date - interval '11 months'
          AND d.mes <= date_trunc('month', v_fecha)::date
      ), 0)::numeric AS suma_cuadrados_12m,
      coalesce(max(d.unidades_netas) FILTER (
        WHERE d.mes >= date_trunc('month', v_fecha)::date - interval '11 months'
          AND d.mes <= date_trunc('month', v_fecha)::date
      ), 0)::numeric AS max_mes_12m
    FROM productos_base p
    LEFT JOIN public.repuestos_demanda_mensual d
      ON d.producto_codigo = p.producto_codigo
     AND d.mes >= date_trunc('month', v_fecha)::date - interval '23 months'
     AND d.mes <= date_trunc('month', v_fecha)::date
    GROUP BY p.producto_codigo
  ),
  ultima_venta AS MATERIALIZED (
    SELECT v.producto_codigo, max(v.fecha_efectiva) AS ultima_venta
    FROM public.repuestos_ventas_vinculacion v
    JOIN productos_base p ON p.producto_codigo = v.producto_codigo
    WHERE v.estado_vinculo = 'CONFIRMADA'
      AND v.fecha_efectiva <= v_fecha
    GROUP BY v.producto_codigo
  ),
  metricas AS MATERIALIZED (
    SELECT
      p.*,
      coalesce(s.stock_global, 0)::numeric AS stock_global,
      d.unidades_12m,
      d.unidades_24m,
      d.total_vendido_12m,
      d.total_vendido_24m,
      d.pedidos_12m,
      d.pedidos_24m,
      d.meses_venta_12m,
      d.meses_venta_24m,
      d.suma_cuadrados_12m,
      d.max_mes_12m,
      (d.unidades_12m / 12.0)::numeric AS media_mensual_12m,
      sqrt(greatest(0, d.suma_cuadrados_12m / 12.0 - power(d.unidades_12m / 12.0, 2)))::numeric AS desviacion_mensual_12m,
      u.ultima_venta,
      CASE WHEN u.ultima_venta IS NULL THEN NULL ELSE v_fecha - u.ultima_venta END AS dias_ultima_venta
    FROM productos_base p
    JOIN demanda d ON d.producto_codigo = p.producto_codigo
    LEFT JOIN stock s ON s.producto_codigo = p.producto_codigo
    LEFT JOIN ultima_venta u ON u.producto_codigo = p.producto_codigo
  ),
  abc_base AS MATERIALIZED (
    SELECT
      m.*,
      coalesce(
        sum(greatest(m.total_vendido_12m, 0)) OVER (
          ORDER BY greatest(m.total_vendido_12m, 0) DESC, m.producto_codigo
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0
      ) / nullif(sum(greatest(m.total_vendido_12m, 0)) OVER (), 0) AS participacion_previa
    FROM metricas m
  ),
  clasificacion AS MATERIALIZED (
    SELECT
      a.*,
      CASE
        WHEN a.participacion_previa IS NULL THEN 'C'
        WHEN a.participacion_previa < v_modelo.abc_limite_a THEN 'A'
        WHEN a.participacion_previa < v_modelo.abc_limite_b THEN 'B'
        ELSE 'C'
      END AS abc,
      CASE
        WHEN a.pedidos_12m >= v_modelo.fsn_pedidos_f
          AND coalesce(a.dias_ultima_venta, 999999) <= v_modelo.fsn_dias_f THEN 'F'
        WHEN a.ultima_venta IS NULL OR a.dias_ultima_venta >= v_modelo.fsn_dias_n THEN 'N'
        ELSE 'S'
      END AS fsn,
      CASE
        WHEN a.meses_venta_12m >= v_modelo.xyz_meses_x
          AND CASE WHEN a.media_mensual_12m = 0 THEN 999999 ELSE abs(a.desviacion_mensual_12m / a.media_mensual_12m) END <= v_modelo.xyz_cv_x THEN 'X'
        WHEN a.meses_venta_12m BETWEEN v_modelo.xyz_meses_y_min AND v_modelo.xyz_meses_y_max
          AND CASE WHEN a.media_mensual_12m = 0 THEN 999999 ELSE abs(a.desviacion_mensual_12m / a.media_mensual_12m) END <= v_modelo.xyz_cv_y THEN 'Y'
        ELSE 'Z'
      END AS xyz
    FROM abc_base a
  ),
  segmento_base AS MATERIALIZED (
    SELECT
      c.*,
      CASE
        WHEN c.fsn = 'N' THEN 'BAJO PEDIDO'
        WHEN c.abc = 'A' AND c.fsn = 'F' AND c.xyz IN ('X', 'Y') THEN 'ESTRELLA'
        WHEN c.xyz = 'Z' OR c.abc IN ('A', 'B') THEN 'DEMANDA VOLATIL'
        WHEN c.abc = 'C' AND c.fsn = 'F' AND c.xyz IN ('X', 'Y') THEN 'FLUJO ESTABLE'
        ELSE 'SERVICIO ECONOMICO'
      END AS segmento_inicial
    FROM clasificacion c
  ),
  segmentos AS MATERIALIZED (
    SELECT
      s.*,
      CASE
        WHEN s.segmento_inicial = 'SERVICIO ECONOMICO' AND s.pedidos_12m < 2 THEN 'BAJO PEDIDO'
        WHEN s.segmento_inicial = 'SERVICIO ECONOMICO'
          AND s.fsn = 'F' AND s.pedidos_12m >= 10 AND s.meses_venta_12m >= 8
          THEN CASE WHEN s.xyz = 'Z' THEN 'SERVICIO ECONOMICO' ELSE 'FLUJO ESTABLE' END
        WHEN s.segmento_inicial = 'SERVICIO ECONOMICO'
          AND s.unidades_12m >= 50 AND s.pedidos_12m >= 3 AND s.meses_venta_12m >= 3
          THEN 'DEMANDA VOLATIL'
        ELSE s.segmento_inicial
      END AS segmento
    FROM segmento_base s
  ),
  politica AS MATERIALIZED (
    SELECT
      s.*,
      coalesce(pol.revision_meses, v_modelo.ciclo_planificacion_meses)::integer AS revision_meses,
      coalesce(pol.valor_z, 0)::numeric AS valor_z,
      (v_modelo.lead_time_meses + coalesce(pol.revision_meses, v_modelo.ciclo_planificacion_meses))::integer AS horizonte_meses,
      greatest(0,
        v_modelo.peso_reciente * (s.unidades_12m / 12.0)
        + v_modelo.peso_anterior * ((s.unidades_24m - s.unidades_12m) / 12.0)
      )::numeric AS demanda_ponderada_mensual,
      CASE
        WHEN s.unidades_12m > 0 THEN greatest(1, s.max_mes_12m / greatest(s.unidades_12m / 12.0, 0.000001))
        ELSE 1
      END::numeric AS factor_pico
    FROM segmentos s
    LEFT JOIN public.repuestos_modelo_segmentos pol
      ON pol.modelo_version_id = v_modelo.id AND pol.segmento = s.segmento
  ),
  demanda_horizonte AS MATERIALIZED (
    SELECT
      p.*,
      CASE
        WHEN p.segmento = 'BAJO PEDIDO' THEN 0
        WHEN p.pedidos_24m <= 2 AND p.meses_venta_24m <= 2
          AND p.xyz = 'Z' AND p.fsn <> 'F' AND p.abc <> 'A'
          THEN least(p.demanda_ponderada_mensual * p.horizonte_meses, greatest(p.unidades_24m, 0) / 4.0)
        WHEN p.factor_pico >= 3 AND p.xyz = 'Z' AND p.fsn <> 'F' AND p.abc <> 'A'
          THEN least(p.demanda_ponderada_mensual * p.horizonte_meses, greatest(p.unidades_24m, 0) / 6.0)
        ELSE p.demanda_ponderada_mensual * p.horizonte_meses
      END::numeric AS demanda_horizonte
    FROM politica p
  ),
  calculo AS MATERIALIZED (
    SELECT
      d.*,
      CASE
        WHEN d.demanda_horizonte <= 0 THEN 0
        WHEN d.segmento = 'SERVICIO ECONOMICO' THEN least(
          d.valor_z * greatest(1, d.desviacion_mensual_12m * sqrt(greatest(d.horizonte_meses, 0))),
          d.demanda_horizonte
        )
        WHEN d.segmento = 'DEMANDA VOLATIL' AND d.fsn = 'S' AND d.pedidos_24m <= 3 THEN least(
          d.valor_z * greatest(1, d.desviacion_mensual_12m * sqrt(greatest(d.horizonte_meses, 0))),
          d.demanda_horizonte + 2
        )
        ELSE d.valor_z * greatest(1, d.desviacion_mensual_12m * sqrt(greatest(d.horizonte_meses, 0)))
      END::numeric AS stock_seguridad
    FROM demanda_horizonte d
  ),
  finales_base AS MATERIALIZED (
    SELECT
      c.*,
      greatest(
        c.stock_minimo_estrategico,
        CASE
          WHEN c.segmento = 'BAJO PEDIDO' THEN 0
          WHEN c.segmento = 'SERVICIO ECONOMICO' THEN least(
            c.demanda_horizonte + c.stock_seguridad,
            greatest(0, 0.8 * c.unidades_12m)
          )
          ELSE c.demanda_horizonte + c.stock_seguridad
        END
      )::numeric AS stock_objetivo,
      CASE
        WHEN c.unidades_24m > 0 THEN 'LISTO'
        WHEN c.incorporado_en >= v_fecha::timestamp - interval '6 months' THEN 'CODIGO_NUEVO_SIN_HISTORIAL'
        ELSE 'SIN_VENTAS_RECIENTES'
      END AS estado_datos
    FROM calculo c
  ),
  finales AS MATERIALIZED (
    SELECT
      'VIVO'::text AS corrida_id,
      f.producto_codigo,
      f.codigo_fabricante,
      f.descripcion,
      f.familia,
      f.marca,
      f.origen,
      f.estado_datos,
      f.incorporado_en,
      f.stock_minimo_estrategico,
      f.stock_global,
      f.unidades_12m,
      f.unidades_24m,
      f.total_vendido_12m,
      f.total_vendido_24m,
      f.pedidos_12m,
      f.pedidos_24m,
      f.meses_venta_12m,
      f.media_mensual_12m,
      f.desviacion_mensual_12m,
      CASE WHEN f.media_mensual_12m = 0 THEN 0 ELSE abs(f.desviacion_mensual_12m / f.media_mensual_12m) END::numeric AS coeficiente_variacion,
      f.ultima_venta,
      f.dias_ultima_venta,
      f.abc,
      f.fsn,
      f.xyz,
      (f.abc || f.fsn || f.xyz)::text AS codigo_mix,
      f.segmento,
      f.horizonte_meses,
      f.demanda_ponderada_mensual,
      f.demanda_horizonte,
      f.stock_seguridad,
      f.stock_objetivo,
      (f.stock_objetivo - f.stock_global)::numeric AS necesidad_neta,
      greatest(0, ceil(f.stock_objetivo - f.stock_global))::integer AS sugerencia_unidades,
      jsonb_build_object(
        'formula', 'Demanda confirmada > ABC-FSN-XYZ > horizonte > seguridad > minimo estrategico > stock global',
        'motor', 'vivo_historial_auditable_v1',
        'transito', 0,
        'peso_reciente', v_modelo.peso_reciente,
        'peso_anterior', v_modelo.peso_anterior,
        'factor_pico', f.factor_pico,
        'valor_z', f.valor_z,
        'revision_meses', f.revision_meses,
        'motivo', CASE
          WHEN f.estado_datos = 'CODIGO_NUEVO_SIN_HISTORIAL' THEN 'Codigo nuevo sin historial suficiente'
          WHEN f.estado_datos = 'SIN_VENTAS_RECIENTES' THEN 'Codigo anterior sin ventas en los ultimos 24 meses'
          WHEN f.stock_minimo_estrategico > 0 AND f.stock_objetivo = f.stock_minimo_estrategico THEN 'Objetivo definido por minimo estrategico'
          WHEN f.stock_objetivo > f.stock_global THEN 'Stock global por debajo del objetivo vivo'
          ELSE 'Stock global suficiente'
        END
      ) AS explicacion
    FROM finales_base f
  ),
  resumen AS MATERIALIZED (
    SELECT
      count(*)::integer AS total_piezas,
      count(*) FILTER (WHERE sugerencia_unidades > 0)::integer AS piezas_sugeridas,
      coalesce(sum(sugerencia_unidades), 0)::numeric AS unidades_sugeridas,
      count(*) FILTER (WHERE estado_datos = 'CODIGO_NUEVO_SIN_HISTORIAL')::integer AS piezas_nuevas_sin_historial,
      count(*) FILTER (WHERE estado_datos = 'SIN_VENTAS_RECIENTES')::integer AS piezas_sin_ventas_recientes
    FROM finales
  ),
  filtrados AS MATERIALIZED (
    SELECT *
    FROM finales f
    WHERE (
      nullif(trim(coalesce(p_buscar, '')), '') IS NULL
      OR f.producto_codigo ILIKE '%' || trim(p_buscar) || '%'
      OR coalesce(f.codigo_fabricante, '') ILIKE '%' || trim(p_buscar) || '%'
      OR f.descripcion ILIKE '%' || trim(p_buscar) || '%'
    )
      AND (coalesce(p_segmento, 'TODOS') = 'TODOS' OR f.segmento = p_segmento)
      AND (coalesce(p_estado, 'TODOS') = 'TODOS' OR f.estado_datos = p_estado)
      AND (NOT coalesce(p_solo_sugeridos, false) OR f.sugerencia_unidades > 0)
  ),
  pagina AS MATERIALIZED (
    SELECT *
    FROM filtrados
    ORDER BY sugerencia_unidades DESC, total_vendido_12m DESC, producto_codigo
    LIMIT least(greatest(coalesce(p_limite, 50), 1), 20000)
    OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT jsonb_build_object(
    'modelo', jsonb_build_object(
      'id', v_modelo.id,
      'version', v_modelo.version,
      'nombre', v_modelo.nombre
    ),
    'fecha_analisis', v_fecha,
    'resumen', to_jsonb(r),
    'total_filtrado', (SELECT count(*) FROM filtrados),
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.sugerencia_unidades DESC, p.total_vendido_12m DESC, p.producto_codigo) FROM pagina p), '[]'::jsonb)
  ) INTO v_resultado
  FROM resumen r;

  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.repuestos_sugerencia_viva(text, date, text, text, text, boolean, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repuestos_sugerencia_viva(text, date, text, text, text, boolean, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.repuestos_sugerencia_viva(text, date, text, text, text, boolean, integer, integer) IS
  'Calcula la sugerencia global al momento sobre demanda mensual confirmada, sin crear corridas.';

NOTIFY pgrst, 'reload schema';
