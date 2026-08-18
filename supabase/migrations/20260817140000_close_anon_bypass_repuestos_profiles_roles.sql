-- Auditoria de seguridad (2026-08-17): cierra el frente de acceso indebido
-- confirmado en produccion. Alcance de ESTA migracion (aislada a proposito):
--
--   1. 16 funciones SECURITY DEFINER/INVOKER del motor de repuestos (+ parque)
--      con el guard `IF auth.uid() IS NOT NULL AND NOT X THEN RAISE EXCEPTION`
--      invertido: por short-circuit de AND, un caller anonimo (auth.uid() IS
--      NULL) salta el RAISE EXCEPTION por completo. Confirmado explotable en
--      vivo: las 16 tenian ademas EXECUTE otorgado a anon/PUBLIC (Supabase
--      otorga EXECUTE a anon de forma directa al crear la funcion, via
--      ALTER DEFAULT PRIVILEGES; un REVOKE ALL ... FROM PUBLIC por si solo
--      NUNCA cierra ese grant directo, hace falta FROM PUBLIC, anon).
--   2. profiles: DROP de "Allow read profiles" (rol {public}, USING true) --
--      no existe en ninguna migracion anterior, se creo fuera de git
--      directamente en produccion. Anon podia leer perfiles reales.
--   3. user_roles: DROP de "user_roles_read_authenticated" (USING true) --
--      mismo origen fuera de git. Cualquier authenticated podia leer la
--      tabla completa y saber quien es admin.
--   4. jornadas / programaciones: DROP de las policies *_authenticated
--      (USING/WITH CHECK true) -- mismo origen fuera de git, reemplazaron a
--      las policies finas originales de 20260519115133_...sql. Confirmado
--      por codigo que ninguna de las dos tablas se usa en el frontend actual
--      (todo el flujo activo corre sobre servicio_jornadas/servicios), asi
--      que no hace falta reponer ninguna policy fina: quedan sin policies
--      para authenticated, es decir denegadas por RLS por default.
--
-- Para CADA una de las 16 funciones se aplica el mismo doble arreglo:
--   (a) el guard se corrige a `IF auth.uid() IS NULL OR NOT X THEN`
--   (b) REVOKE ALL ... FROM PUBLIC, anon explicito (no solo PUBLIC)
-- Verificado antes de este cambio que las 16 se llaman siempre desde
-- pantallas detras de ProtectedRoute (useSugerenciasCompra.ts,
-- ImportarTab.tsx, newSystemPersist.ts) -- ninguna se invoca sin sesion, asi
-- que revocar anon no rompe ningun flujo legitimo.
--
-- trabajos/trabajo_historial (mismo bug, pero requieren reconstruir la
-- policy fina con el modelo de datos actual, no restaurar la original que
-- ya quedo obsoleta) y clientes (pendiente de decision de producto) van en
-- una migracion aparte.

-- =====================================================================
-- 1a. Familia repuestos_sugerencia_viva (lectura -- HIGH)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.repuestos_sugerencia_viva_base_v1(
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
  IF auth.uid() IS NULL OR NOT public.has_module_access(auth.uid(), 'repuestos') THEN
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
    RAISE EXCEPTION 'No existe una configuracion activa para %', v_marca;
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

CREATE OR REPLACE FUNCTION public.repuestos_sugerencia_viva_base_v2(
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
  v_base jsonb;
  v_resultado jsonb;
  v_fecha date := coalesce(p_fecha_analisis, current_date);
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_module_access(auth.uid(), 'repuestos') THEN
    RAISE EXCEPTION 'No tenes acceso al modulo de repuestos' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_modelo FROM public.repuestos_modelo_versiones
  WHERE marca::text = upper(trim(p_marca)) AND activa LIMIT 1;
  IF v_modelo.id IS NULL THEN RAISE EXCEPTION 'No existe un modelo activo para %', p_marca; END IF;

  v_base := public.repuestos_sugerencia_viva_base_v1(
    p_marca, v_fecha, NULL, 'TODOS', 'TODOS', false, 20000, 0
  );

  WITH filas AS MATERIALIZED (
    SELECT value AS r FROM jsonb_array_elements(v_base->'rows')
  ),
  codigos AS MATERIALIZED (
    SELECT r, r->>'producto_codigo' AS codigo FROM filas
  ),
  estadistica AS MATERIALIZED (
    SELECT
      c.codigo,
      count(*) FILTER (WHERE d.unidades_positivas > 0)::numeric AS meses_activos,
      coalesce(sum(d.unidades_netas) FILTER (WHERE d.unidades_positivas > 0), 0)::numeric AS unidades_activas,
      coalesce(sum(power(d.unidades_netas, 2)) FILTER (WHERE d.unidades_positivas > 0), 0)::numeric AS cuadrados_activos
    FROM codigos c
    LEFT JOIN public.repuestos_demanda_mensual d
      ON d.producto_codigo = c.codigo
     AND d.mes >= date_trunc('month', v_fecha)::date - interval '11 months'
     AND d.mes <= date_trunc('month', v_fecha)::date
    GROUP BY c.codigo
  ),
  metricas AS MATERIALIZED (
    SELECT
      c.r, c.codigo,
      coalesce(e.meses_activos, 0) AS meses_activos,
      CASE WHEN coalesce(e.meses_activos, 0) = 0 THEN 999 ELSE 12.0 / e.meses_activos END::numeric AS adi,
      CASE
        WHEN coalesce(e.meses_activos, 0) = 0 OR coalesce(e.unidades_activas, 0) = 0 THEN 999
        ELSE power(
          sqrt(greatest(0, e.cuadrados_activos / e.meses_activos - power(e.unidades_activas / e.meses_activos, 2)))
          / greatest(abs(e.unidades_activas / e.meses_activos), 0.000001), 2
        )
      END::numeric AS cv2,
      greatest(0, coalesce((c.r->>'unidades_12m')::numeric, 0)) / 12.0 AS ritmo_reciente,
      greatest(0, coalesce((c.r->>'unidades_24m')::numeric, 0) - coalesce((c.r->>'unidades_12m')::numeric, 0)) / 12.0 AS ritmo_anterior
    FROM codigos c LEFT JOIN estadistica e ON e.codigo = c.codigo
  ),
  clasificados AS MATERIALIZED (
    SELECT m.*,
      CASE
        WHEN m.meses_activos = 0 THEN 'Z'
        WHEN m.adi < v_modelo.adi_intermitente_umbral AND m.cv2 < v_modelo.cv2_erratico_umbral THEN 'X'
        WHEN m.adi >= v_modelo.adi_intermitente_umbral AND m.cv2 >= v_modelo.cv2_erratico_umbral THEN 'Z'
        ELSE 'Y'
      END AS xyz_nuevo,
      CASE
        WHEN m.meses_activos = 0 THEN 'SIN DEMANDA'
        WHEN m.adi < v_modelo.adi_intermitente_umbral AND m.cv2 < v_modelo.cv2_erratico_umbral THEN 'SUAVE'
        WHEN m.adi < v_modelo.adi_intermitente_umbral THEN 'ERRATICA'
        WHEN m.cv2 < v_modelo.cv2_erratico_umbral THEN 'INTERMITENTE'
        ELSE 'GRUMOSA'
      END AS tipo_demanda
    FROM metricas m
  ),
  segmentados AS MATERIALIZED (
    SELECT c.*,
      CASE
        WHEN c.r->>'fsn' = 'N' THEN 'BAJO PEDIDO'
        WHEN c.r->>'abc' = 'A' AND c.r->>'fsn' = 'F' AND c.xyz_nuevo IN ('X','Y') THEN 'ESTRELLA'
        WHEN c.xyz_nuevo = 'Z' OR c.r->>'abc' IN ('A','B') THEN 'DEMANDA VOLATIL'
        WHEN c.r->>'abc' = 'C' AND c.r->>'fsn' = 'F' AND c.xyz_nuevo IN ('X','Y') THEN 'FLUJO ESTABLE'
        ELSE 'SERVICIO ECONOMICO'
      END AS segmento_nuevo
    FROM clasificados c
  ),
  politica AS MATERIALIZED (
    SELECT s.*,
      (v_modelo.lead_time_meses + coalesce(p.revision_meses, v_modelo.ciclo_planificacion_meses))::numeric AS horizonte,
      coalesce(p.valor_z, 0)::numeric AS z,
      CASE
        WHEN s.ritmo_anterior > 0 AND s.ritmo_reciente < s.ritmo_anterior * v_modelo.tendencia_caida_umbral
          THEN least(
            v_modelo.peso_reciente * s.ritmo_reciente + v_modelo.peso_anterior * s.ritmo_anterior,
            s.ritmo_reciente * v_modelo.tendencia_caida_tope
          )
        WHEN s.xyz_nuevo IN ('Y','Z')
          THEN greatest(
            v_modelo.peso_reciente * s.ritmo_reciente + v_modelo.peso_anterior * s.ritmo_anterior,
            0.95 * s.ritmo_reciente
          )
        ELSE v_modelo.peso_reciente * s.ritmo_reciente + v_modelo.peso_anterior * s.ritmo_anterior
      END::numeric AS pronostico_mensual
    FROM segmentados s
    LEFT JOIN public.repuestos_modelo_segmentos p
      ON p.modelo_version_id = v_modelo.id AND p.segmento = s.segmento_nuevo
  ),
  calculados AS MATERIALIZED (
    SELECT p.*,
      CASE WHEN p.segmento_nuevo = 'BAJO PEDIDO' THEN 0 ELSE greatest(0, p.pronostico_mensual * p.horizonte) END::numeric AS demanda_horizonte_nueva,
      CASE
        WHEN p.meses_activos <= 1 THEN 0
        ELSE sqrt(greatest(0, p.cv2)) * greatest(0, p.pronostico_mensual) * sqrt(greatest(p.horizonte, 0))
      END::numeric AS dispersion_horizonte
    FROM politica p
  ),
  objetivos AS MATERIALIZED (
    SELECT c.*,
      least(c.z * c.dispersion_horizonte, c.demanda_horizonte_nueva * v_modelo.stock_seguridad_tope)::numeric AS seguridad_nueva,
      greatest(
        coalesce((c.r->>'stock_minimo_estrategico')::numeric, 0),
        CASE
          WHEN c.segmento_nuevo = 'BAJO PEDIDO' THEN 0
          WHEN coalesce((c.r->>'pedidos_12m')::integer, 0) <= 1 THEN least(
            c.demanda_horizonte_nueva + least(c.z * c.dispersion_horizonte, c.demanda_horizonte_nueva * v_modelo.stock_seguridad_tope),
            c.ritmo_reciente * v_modelo.pedido_unico_cobertura_meses
          )
          WHEN c.segmento_nuevo = 'SERVICIO ECONOMICO' THEN least(
            c.demanda_horizonte_nueva + least(c.z * c.dispersion_horizonte, c.demanda_horizonte_nueva * v_modelo.stock_seguridad_tope),
            0.8 * greatest(0, coalesce((c.r->>'unidades_12m')::numeric, 0))
          )
          ELSE c.demanda_horizonte_nueva + least(c.z * c.dispersion_horizonte, c.demanda_horizonte_nueva * v_modelo.stock_seguridad_tope)
        END
      )::numeric AS objetivo_nuevo
    FROM calculados c
  ),
  finales AS MATERIALIZED (
    SELECT o.*,
      CASE
        WHEN coalesce((o.r->>'stock_minimo_estrategico')::numeric, 0) > coalesce((o.r->>'stock_global')::numeric, 0)
          THEN greatest(0, ceil(round(o.objetivo_nuevo - coalesce((o.r->>'stock_global')::numeric, 0), 6)))::integer
        WHEN o.ritmo_reciente > 0
          AND coalesce((o.r->>'stock_global')::numeric, 0) / o.ritmo_reciente >= o.horizonte + v_modelo.cobertura_margen_meses
          THEN 0
        ELSE greatest(0, ceil(round(o.objetivo_nuevo - coalesce((o.r->>'stock_global')::numeric, 0), 6)))::integer
      END AS sugerencia_nueva
    FROM objetivos o
  ),
  enriquecidos AS MATERIALIZED (
    SELECT
      f.r || jsonb_build_object(
        'xyz', f.xyz_nuevo,
        'codigo_mix', (f.r->>'abc') || (f.r->>'fsn') || f.xyz_nuevo,
        'segmento', f.segmento_nuevo,
        'horizonte_meses', f.horizonte,
        'demanda_ponderada_mensual', f.pronostico_mensual,
        'demanda_horizonte', f.demanda_horizonte_nueva,
        'stock_seguridad', f.seguridad_nueva,
        'stock_objetivo', f.objetivo_nuevo,
        'necesidad_neta', f.objetivo_nuevo - coalesce((f.r->>'stock_global')::numeric, 0),
        'sugerencia_unidades', f.sugerencia_nueva,
        'explicacion', coalesce(f.r->'explicacion', '{}'::jsonb) || jsonb_build_object(
          'motor', 'vivo_calibrado_v2', 'tipo_demanda', f.tipo_demanda,
          'adi', f.adi, 'cv2', f.cv2,
          'tendencia_caida', f.ritmo_anterior > 0 AND f.ritmo_reciente < f.ritmo_anterior * v_modelo.tendencia_caida_umbral,
          'cobertura_suficiente', f.ritmo_reciente > 0 AND coalesce((f.r->>'stock_global')::numeric, 0) / f.ritmo_reciente >= f.horizonte + v_modelo.cobertura_margen_meses,
          'pedido_unico_limitado', coalesce((f.r->>'pedidos_12m')::integer, 0) <= 1,
          'motivo', CASE
            WHEN f.sugerencia_nueva = 0 AND f.ritmo_reciente > 0 AND coalesce((f.r->>'stock_global')::numeric, 0) / f.ritmo_reciente >= f.horizonte + v_modelo.cobertura_margen_meses THEN 'Cobertura actual suficiente'
            WHEN f.sugerencia_nueva > 0 AND coalesce((f.r->>'pedidos_12m')::integer, 0) <= 1 THEN 'Demanda excepcional limitada a cobertura corta'
            WHEN f.sugerencia_nueva > 0 THEN 'Stock global por debajo del objetivo calibrado'
            ELSE 'Sin necesidad de compra'
          END
        )
      ) AS r,
      f.sugerencia_nueva,
      f.segmento_nuevo,
      f.r->>'estado_datos' AS estado_datos
    FROM finales f
  ),
  resumen AS MATERIALIZED (
    SELECT count(*)::integer AS total_piezas,
      count(*) FILTER (WHERE sugerencia_nueva > 0)::integer AS piezas_sugeridas,
      coalesce(sum(sugerencia_nueva), 0)::numeric AS unidades_sugeridas,
      count(*) FILTER (WHERE estado_datos = 'CODIGO_NUEVO_SIN_HISTORIAL')::integer AS piezas_nuevas_sin_historial,
      count(*) FILTER (WHERE estado_datos = 'SIN_VENTAS_RECIENTES')::integer AS piezas_sin_ventas_recientes
    FROM enriquecidos
  ),
  filtrados AS MATERIALIZED (
    SELECT * FROM enriquecidos e
    WHERE (nullif(trim(coalesce(p_buscar,'')), '') IS NULL
      OR e.r->>'producto_codigo' ILIKE '%' || trim(p_buscar) || '%'
      OR coalesce(e.r->>'codigo_fabricante','') ILIKE '%' || trim(p_buscar) || '%'
      OR e.r->>'descripcion' ILIKE '%' || trim(p_buscar) || '%')
      AND (coalesce(p_segmento,'TODOS') = 'TODOS' OR e.segmento_nuevo = p_segmento)
      AND (coalesce(p_estado,'TODOS') = 'TODOS' OR e.estado_datos = p_estado)
      AND (NOT coalesce(p_solo_sugeridos,false) OR e.sugerencia_nueva > 0)
  ),
  pagina AS MATERIALIZED (
    SELECT * FROM filtrados
    ORDER BY sugerencia_nueva DESC, coalesce((r->>'total_vendido_12m')::numeric,0) DESC, r->>'producto_codigo'
    LIMIT least(greatest(coalesce(p_limite,50),1),20000) OFFSET greatest(coalesce(p_offset,0),0)
  )
  SELECT jsonb_build_object(
    'modelo', jsonb_build_object('id',v_modelo.id,'version',v_modelo.version,'nombre',v_modelo.nombre),
    'fecha_analisis', v_fecha,
    'resumen', to_jsonb(resumen),
    'total_filtrado', (SELECT count(*) FROM filtrados),
    'rows', coalesce((SELECT jsonb_agg(r ORDER BY sugerencia_nueva DESC, r->>'producto_codigo') FROM pagina),'[]'::jsonb)
  ) INTO v_resultado FROM resumen;

  RETURN v_resultado;
END;
$$;

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
SET statement_timeout = '90s'
AS $function$
DECLARE
  v_modelo public.repuestos_modelo_versiones%ROWTYPE;
  v_base jsonb;
  v_fecha date := coalesce(p_fecha_analisis, current_date);
  v_resultado jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_module_access(auth.uid(), 'repuestos') THEN
    RAISE EXCEPTION 'No tenes acceso al modulo de repuestos' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_modelo
  FROM public.repuestos_modelo_versiones
  WHERE marca::text = upper(trim(p_marca)) AND activa
  LIMIT 1;

  IF v_modelo.id IS NULL THEN
    RAISE EXCEPTION 'No existe un modelo activo para %', p_marca;
  END IF;

  v_base := public.repuestos_sugerencia_viva_base_v2(
    p_marca, v_fecha, NULL, 'TODOS', 'TODOS', false, 20000, 0
  );

  WITH base AS MATERIALIZED (
    SELECT value AS r
    FROM jsonb_array_elements(coalesce(v_base->'rows', '[]'::jsonb))
  ),
  entradas AS MATERIALIZED (
    SELECT
      r,
      coalesce((r->>'pedidos_12m')::integer, 0) AS pedidos,
      coalesce((r->>'meses_venta_12m')::integer, 0) AS meses_activos,
      greatest(0, coalesce((r->>'demanda_ponderada_mensual')::numeric, 0)) AS pronostico,
      greatest(0, coalesce((r->>'demanda_horizonte')::numeric, 0)) AS demanda_horizonte,
      greatest(0, coalesce((r->>'stock_seguridad')::numeric, 0)) AS seguridad_anterior,
      greatest(0, coalesce((r->>'stock_global')::numeric, 0)) AS stock_global,
      greatest(0, coalesce((r->>'stock_minimo_estrategico')::numeric, 0)) AS minimo_estrategico,
      greatest(0, coalesce((r->>'unidades_12m')::numeric, 0)) AS unidades_12m,
      greatest(0, coalesce((r->>'horizonte_meses')::numeric, 0)) AS horizonte,
      coalesce(r->>'segmento', 'SERVICIO ECONOMICO') AS segmento
    FROM base
  ),
  politicas AS MATERIALIZED (
    SELECT
      e.*,
      CASE
        WHEN e.meses_activos >= 4 AND e.pedidos >= 4 THEN 'ALTA'
        WHEN e.meses_activos >= 2 AND e.pedidos >= 2 THEN 'MEDIA'
        ELSE 'BAJA'
      END AS confianza_datos,
      CASE
        WHEN e.meses_activos <= 1 OR e.seguridad_anterior = 0 THEN 'ESTIMADA'
        ELSE 'ESTADISTICA'
      END AS tipo_seguridad,
      CASE
        WHEN e.pedidos <= 1 THEN least(e.horizonte, v_modelo.pedido_unico_cobertura_meses)
        WHEN e.pedidos = 2 THEN least(e.horizonte, v_modelo.pedido_unico_cobertura_meses + 1)
        WHEN e.pedidos = 3 THEN least(e.horizonte, v_modelo.pedido_unico_cobertura_meses + 2)
        ELSE e.horizonte
      END::numeric AS cobertura_aplicada,
      greatest(
        e.seguridad_anterior,
        least(
          e.pronostico * CASE
            WHEN e.segmento = 'ESTRELLA' THEN 0.75
            WHEN e.segmento = 'DEMANDA VOLATIL' THEN 0.50
            ELSE 0.25
          END,
          e.demanda_horizonte * v_modelo.stock_seguridad_tope
        )
      )::numeric AS seguridad_v3
    FROM entradas e
  ),
  objetivos_base AS MATERIALIZED (
    SELECT
      p.*,
      CASE
        WHEN p.segmento = 'BAJO PEDIDO' THEN 0
        WHEN p.pedidos <= 3 THEN least(
          p.demanda_horizonte + p.seguridad_v3,
          p.pronostico * p.cobertura_aplicada
        )
        ELSE p.demanda_horizonte + p.seguridad_v3
      END::numeric AS objetivo_por_frecuencia
    FROM politicas p
  ),
  objetivos AS MATERIALIZED (
    SELECT
      o.*,
      greatest(
        o.minimo_estrategico,
        CASE
          WHEN o.segmento = 'SERVICIO ECONOMICO'
            THEN least(o.objetivo_por_frecuencia, 0.8 * o.unidades_12m)
          ELSE o.objetivo_por_frecuencia
        END
      )::numeric AS objetivo_v3
    FROM objetivos_base o
  ),
  finales AS MATERIALIZED (
    SELECT
      o.*,
      greatest(0, o.objetivo_v3 - o.stock_global)::numeric AS brecha_v3,
      CASE
        WHEN o.minimo_estrategico <= o.stock_global
          AND o.pedidos <= 1
          AND coalesce(o.r->>'abc', 'C') = 'C'
          AND greatest(0, o.objetivo_v3 - o.stock_global) < 0.50 THEN 0
        ELSE greatest(0, ceil(round(o.objetivo_v3 - o.stock_global, 6)))::integer
      END AS sugerencia_v3
    FROM objetivos o
  ),
  enriquecidos AS MATERIALIZED (
    SELECT
      f.r || jsonb_build_object(
        'stock_seguridad', f.seguridad_v3,
        'stock_objetivo', f.objetivo_v3,
        'necesidad_neta', f.brecha_v3,
        'sugerencia_unidades', f.sugerencia_v3,
        'confianza_datos', f.confianza_datos,
        'tipo_stock_seguridad', f.tipo_seguridad,
        'cobertura_aplicada_meses', f.cobertura_aplicada,
        'explicacion', coalesce(f.r->'explicacion', '{}'::jsonb) || jsonb_build_object(
          'motor', 'vivo_intermitente_v3',
          'confianza_datos', f.confianza_datos,
          'tipo_stock_seguridad', f.tipo_seguridad,
          'meses_activos_12m', f.meses_activos,
          'pedidos_12m', f.pedidos,
          'cobertura_aplicada_meses', f.cobertura_aplicada,
          'redondeo_omitido', f.sugerencia_v3 = 0 AND f.brecha_v3 > 0,
          'motivo', CASE
            WHEN f.sugerencia_v3 = 0 AND f.brecha_v3 > 0 THEN 'Brecha menor a media unidad; no se fuerza una compra marginal'
            WHEN f.sugerencia_v3 = 0 THEN 'Stock actual suficiente para la politica aplicada'
            WHEN f.confianza_datos = 'BAJA' THEN 'Compra conservadora con cobertura corta por historial insuficiente'
            WHEN f.pedidos <= 3 THEN 'Cobertura gradual segun recurrencia observada'
            ELSE 'Stock global por debajo del objetivo calculado'
          END
        )
      ) AS r,
      f.sugerencia_v3,
      f.segmento,
      f.r->>'estado_datos' AS estado_datos
    FROM finales f
  ),
  resumen AS MATERIALIZED (
    SELECT
      count(*)::integer AS total_piezas,
      count(*) FILTER (WHERE sugerencia_v3 > 0)::integer AS piezas_sugeridas,
      coalesce(sum(sugerencia_v3), 0)::integer AS unidades_sugeridas,
      count(*) FILTER (WHERE estado_datos = 'CODIGO_NUEVO_SIN_HISTORIAL')::integer AS piezas_nuevas_sin_historial,
      count(*) FILTER (WHERE estado_datos = 'SIN_VENTAS_RECIENTES')::integer AS piezas_sin_ventas_recientes,
      count(*) FILTER (WHERE r->>'confianza_datos' = 'BAJA')::integer AS piezas_confianza_baja
    FROM enriquecidos
  ),
  filtrados AS MATERIALIZED (
    SELECT *
    FROM enriquecidos e
    WHERE (
      nullif(trim(coalesce(p_buscar, '')), '') IS NULL
      OR e.r->>'producto_codigo' ILIKE '%' || trim(p_buscar) || '%'
      OR coalesce(e.r->>'codigo_fabricante', '') ILIKE '%' || trim(p_buscar) || '%'
      OR e.r->>'descripcion' ILIKE '%' || trim(p_buscar) || '%'
    )
      AND (coalesce(p_segmento, 'TODOS') = 'TODOS' OR e.segmento = p_segmento)
      AND (coalesce(p_estado, 'TODOS') = 'TODOS' OR e.estado_datos = p_estado)
      AND (NOT coalesce(p_solo_sugeridos, false) OR e.sugerencia_v3 > 0)
  ),
  pagina AS MATERIALIZED (
    SELECT *
    FROM filtrados
    ORDER BY sugerencia_v3 DESC,
      coalesce((r->>'total_vendido_12m')::numeric, 0) DESC,
      r->>'producto_codigo'
    LIMIT greatest(1, least(coalesce(p_limite, 50), 1000))
    OFFSET greatest(0, coalesce(p_offset, 0))
  )
  SELECT jsonb_build_object(
    'modelo', jsonb_build_object(
      'id', v_modelo.id,
      'version', v_modelo.version,
      'nombre', v_modelo.nombre,
      'motor', 'v3'
    ),
    'fecha_analisis', v_fecha,
    'resumen', to_jsonb(resumen),
    'total_filtrado', (SELECT count(*) FROM filtrados),
    'rows', coalesce((SELECT jsonb_agg(r) FROM pagina), '[]'::jsonb)
  )
  INTO v_resultado
  FROM resumen;

  RETURN v_resultado;
END;
$function$;

REVOKE ALL ON FUNCTION public.repuestos_sugerencia_viva_base_v1(text,date,text,text,text,boolean,integer,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.repuestos_sugerencia_viva_base_v2(text,date,text,text,text,boolean,integer,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.repuestos_sugerencia_viva(text,date,text,text,text,boolean,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repuestos_sugerencia_viva(text,date,text,text,text,boolean,integer,integer) TO authenticated;

-- =====================================================================
-- 1b. Maestro legacy (escritura -- CRITICAL)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.repuestos_iniciar_maestro_legacy(p_archivo_nombre text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede cargar el maestro anterior'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.repuestos_maestro_legacy_cargas
    WHERE estado = 'COMPLETADO'
  ) THEN
    RAISE EXCEPTION 'El maestro anterior ya fue cargado. Esta operacion se realiza una sola vez.';
  END IF;

  UPDATE public.repuestos_maestro_legacy_cargas
  SET estado = 'FALLIDO'
  WHERE estado = 'PROCESANDO'
    AND creado_por IS NOT DISTINCT FROM auth.uid();

  IF EXISTS (
    SELECT 1 FROM public.repuestos_maestro_legacy_cargas
    WHERE estado = 'PROCESANDO'
  ) THEN
    RAISE EXCEPTION 'Existe una carga del maestro anterior en proceso iniciada por otro usuario';
  END IF;

  INSERT INTO public.repuestos_maestro_legacy_cargas(archivo_nombre, creado_por)
  VALUES (coalesce(nullif(trim(p_archivo_nombre), ''), 'Lista Mercadoria.xls'), auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.repuestos_importar_maestro_legacy_lote(
  p_carga_id uuid,
  p_filas jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_insertadas integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede cargar el maestro anterior'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.repuestos_maestro_legacy_cargas
    WHERE id = p_carga_id AND estado = 'PROCESANDO'
  ) THEN
    RAISE EXCEPTION 'La carga no existe o ya fue cerrada';
  END IF;

  INSERT INTO public.repuestos_maestro_legacy(
    carga_id, codigo_legacy, codigo_legacy_norm,
    codigo_fabricante, codigo_fabricante_norm,
    descripcion, situacion, tipo
  )
  SELECT
    p_carga_id,
    trim(x.codigo_legacy),
    public.normalizar_codigo_repuesto_flexible(x.codigo_legacy),
    nullif(trim(x.codigo_fabricante), ''),
    coalesce(
      public.normalizar_codigo_repuesto_flexible(x.codigo_fabricante),
      public.extraer_codigo_repuesto_descripcion(x.descripcion)
    ),
    coalesce(nullif(trim(x.descripcion), ''), 'Producto ' || trim(x.codigo_legacy)),
    nullif(trim(x.situacion), ''),
    nullif(trim(x.tipo), '')
  FROM jsonb_to_recordset(coalesce(p_filas, '[]'::jsonb)) AS x(
    codigo_legacy text,
    codigo_fabricante text,
    descripcion text,
    situacion text,
    tipo text
  )
  WHERE public.normalizar_codigo_repuesto_flexible(x.codigo_legacy) IS NOT NULL
  ON CONFLICT (carga_id, codigo_legacy_norm) DO UPDATE SET
    codigo_legacy = EXCLUDED.codigo_legacy,
    codigo_fabricante = EXCLUDED.codigo_fabricante,
    codigo_fabricante_norm = EXCLUDED.codigo_fabricante_norm,
    descripcion = EXCLUDED.descripcion,
    situacion = EXCLUDED.situacion,
    tipo = EXCLUDED.tipo,
    actualizado_en = now();

  GET DIAGNOSTICS v_insertadas = ROW_COUNT;
  RETURN v_insertadas;
END;
$$;

CREATE OR REPLACE FUNCTION public.repuestos_finalizar_maestro_legacy(p_carga_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '180s'
AS $$
DECLARE
  v_filas integer := 0;
  v_vinculadas integer := 0;
  v_canonicas integer := 0;
  v_sin integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede cargar el maestro anterior'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.repuestos_maestro_legacy_cargas
    WHERE id = p_carga_id AND estado = 'PROCESANDO'
  ) THEN
    RAISE EXCEPTION 'La carga no existe o ya fue cerrada';
  END IF;

  CREATE TEMP TABLE tmp_maestro_actual ON COMMIT DROP AS
  SELECT
    p.codigo_interno,
    p.marca,
    p.incorporado_en,
    coalesce(s.stock_total, 0)::numeric AS stock_total,
    public.normalizar_codigo_repuesto_flexible(p.codigo_fabricante) AS fabricante_norm,
    public.extraer_codigo_repuesto_descripcion(p.descripcion) AS descripcion_norm
  FROM public.productos p
  LEFT JOIN (
    SELECT producto_codigo, sum(saldo_actual)::numeric AS stock_total
    FROM public.repuestos_stock
    GROUP BY producto_codigo
  ) s ON s.producto_codigo = p.codigo_interno
  WHERE p.activo AND p.codigo_interno ILIKE 'REP%';

  CREATE INDEX tmp_maestro_actual_fabricante_idx
    ON tmp_maestro_actual(fabricante_norm) WHERE fabricante_norm IS NOT NULL;
  CREATE INDEX tmp_maestro_actual_descripcion_idx
    ON tmp_maestro_actual(descripcion_norm) WHERE descripcion_norm IS NOT NULL;

  CREATE TEMP TABLE tmp_maestro_candidatos ON COMMIT DROP AS
  SELECT DISTINCT
    m.codigo_legacy_norm,
    p.codigo_interno AS producto_codigo,
    CASE WHEN p.fabricante_norm = m.codigo_fabricante_norm THEN 1 ELSE 2 END AS prioridad
  FROM public.repuestos_maestro_legacy m
  JOIN tmp_maestro_actual p
    ON p.fabricante_norm = m.codigo_fabricante_norm
    OR p.descripcion_norm = m.codigo_fabricante_norm
  WHERE m.carga_id = p_carga_id
    AND m.codigo_fabricante_norm IS NOT NULL;

  CREATE INDEX tmp_maestro_candidatos_codigo_idx
    ON tmp_maestro_candidatos(codigo_legacy_norm, prioridad, producto_codigo);

  WITH mejor AS MATERIALIZED (
    SELECT codigo_legacy_norm, min(prioridad) AS prioridad
    FROM tmp_maestro_candidatos
    GROUP BY codigo_legacy_norm
  ),
  resumen AS MATERIALIZED (
    SELECT
      c.codigo_legacy_norm,
      array_agg(DISTINCT c.producto_codigo ORDER BY c.producto_codigo) AS candidatos,
      count(DISTINCT c.producto_codigo)::integer AS cantidad
    FROM tmp_maestro_candidatos c
    JOIN mejor b
      ON b.codigo_legacy_norm = c.codigo_legacy_norm
     AND b.prioridad = c.prioridad
    GROUP BY c.codigo_legacy_norm
  ),
  elegido AS MATERIALIZED (
    SELECT DISTINCT ON (c.codigo_legacy_norm)
      c.codigo_legacy_norm,
      c.producto_codigo
    FROM tmp_maestro_candidatos c
    JOIN mejor b
      ON b.codigo_legacy_norm = c.codigo_legacy_norm
     AND b.prioridad = c.prioridad
    JOIN tmp_maestro_actual p ON p.codigo_interno = c.producto_codigo
    ORDER BY
      c.codigo_legacy_norm,
      p.stock_total DESC,
      p.incorporado_en ASC NULLS LAST,
      p.codigo_interno
  )
  UPDATE public.repuestos_maestro_legacy m
  SET
    producto_codigo = e.producto_codigo,
    estado_vinculo = CASE
      WHEN e.producto_codigo IS NULL THEN 'SIN_COINCIDENCIA'
      WHEN r.cantidad > 1 THEN 'CONFIRMADA_CANONICA'
      ELSE 'CONFIRMADA'
    END,
    metodo_vinculo = CASE
      WHEN e.producto_codigo IS NULL THEN NULL
      WHEN r.cantidad > 1 THEN 'FABRICANTE_CANONICO'
      ELSE 'FABRICANTE_UNICO'
    END,
    candidatos = coalesce(r.candidatos, '{}'::text[]),
    actualizado_en = now()
  FROM (SELECT codigo_legacy_norm FROM public.repuestos_maestro_legacy WHERE carga_id = p_carga_id) base
  LEFT JOIN resumen r ON r.codigo_legacy_norm = base.codigo_legacy_norm
  LEFT JOIN elegido e ON e.codigo_legacy_norm = base.codigo_legacy_norm
  WHERE m.carga_id = p_carga_id
    AND m.codigo_legacy_norm = base.codigo_legacy_norm;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE estado_vinculo IN ('CONFIRMADA', 'CONFIRMADA_CANONICA'))::integer,
    count(*) FILTER (WHERE estado_vinculo = 'CONFIRMADA_CANONICA')::integer,
    count(*) FILTER (WHERE estado_vinculo = 'SIN_COINCIDENCIA')::integer
  INTO v_filas, v_vinculadas, v_canonicas, v_sin
  FROM public.repuestos_maestro_legacy
  WHERE carga_id = p_carga_id;

  UPDATE public.repuestos_maestro_legacy_cargas
  SET activo = false
  WHERE activo;

  UPDATE public.repuestos_maestro_legacy_cargas
  SET
    estado = 'COMPLETADO',
    activo = true,
    filas = v_filas,
    vinculadas = v_vinculadas,
    canonicas = v_canonicas,
    sin_coincidencia = v_sin,
    completado_en = now()
  WHERE id = p_carga_id;

  RETURN jsonb_build_object(
    'filas', v_filas,
    'vinculadas', v_vinculadas,
    'canonicas', v_canonicas,
    'sin_coincidencia', v_sin
  );
END;
$$;

REVOKE ALL ON FUNCTION public.repuestos_iniciar_maestro_legacy(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.repuestos_importar_maestro_legacy_lote(uuid,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.repuestos_finalizar_maestro_legacy(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repuestos_iniciar_maestro_legacy(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_importar_maestro_legacy_lote(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_finalizar_maestro_legacy(uuid) TO authenticated;

-- =====================================================================
-- 1c. Facturacion historica detallada (escritura -- CRITICAL)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.repuestos_iniciar_facturacion_historica(
  p_archivo_nombre text,
  p_filas_archivo integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede cargar la facturacion historica'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.repuestos_facturacion_historica_cargas
    WHERE activo AND estado = 'COMPLETADO'
  ) THEN
    RAISE EXCEPTION 'La facturacion historica detallada ya fue cargada. Esta operacion se realiza una sola vez.';
  END IF;

  UPDATE public.repuestos_facturacion_historica_cargas
  SET estado = 'FALLIDO'
  WHERE estado = 'PROCESANDO';

  INSERT INTO public.repuestos_facturacion_historica_cargas(
    archivo_nombre, filas_archivo, creado_por
  ) VALUES (
    coalesce(nullif(trim(p_archivo_nombre), ''), 'FACTURACION HISTORICA.xlsx'),
    greatest(coalesce(p_filas_archivo, 0), 0),
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.repuestos_importar_facturacion_historica_lote(
  p_carga_id uuid,
  p_filas jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_recibidas integer := jsonb_array_length(coalesce(p_filas, '[]'::jsonb));
  v_afectadas integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede cargar la facturacion historica'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.repuestos_facturacion_historica_cargas
    WHERE id = p_carga_id AND estado = 'PROCESANDO'
  ) THEN
    RAISE EXCEPTION 'La carga no existe o ya fue cerrada';
  END IF;

  INSERT INTO public.facturacion_lineas_importadas(
    origen_sistema,
    codigo_interno_factura,
    factura,
    entidad_nombre,
    fecha_factura,
    subgrupo_original,
    grupo_normalizado,
    marca_normalizada,
    tipo_facturacion,
    tipo_tiempo,
    observacion,
    cod_mercaderia,
    mercaderia,
    cantidad,
    valor_unitario,
    total_venta,
    moneda,
    raw_data
  )
  SELECT
    'legacy_historico_detallado',
    nullif(trim(x.documento), ''),
    nullif(trim(x.documento), ''),
    coalesce(nullif(trim(x.entidad), ''), 'CLIENTE HISTORICO'),
    x.fecha::timestamptz,
    nullif(trim(x.grupo), ''),
    'Repuestos',
    CASE
      WHEN upper(coalesce(x.grupo, '')) LIKE '%CLAAS%' THEN 'CLAAS'::public.marca
      WHEN upper(coalesce(x.grupo, '')) LIKE '%PLANTADOR%'
        OR upper(coalesce(x.grupo, '')) LIKE '%PULVERIZ%' THEN 'HORSCH'::public.marca
      ELSE 'OTROS'::public.marca
    END,
    'Repuesto'::public.tipo_facturacion,
    'Cliente',
    'HISTORICO_LEGACY:' || trim(x.linea_clave),
    trim(x.codigo_legacy),
    coalesce(nullif(trim(x.descripcion), ''), 'Producto historico ' || trim(x.codigo_legacy)),
    coalesce(x.cantidad, 0),
    coalesce(x.valor_unitario, 0),
    coalesce(x.total_venta, 0),
    'USD',
    jsonb_build_object(
      'carga_id', p_carga_id,
      'linea_clave', trim(x.linea_clave),
      'grupo_original', x.grupo,
      'sucursal_original', x.sucursal,
      'movimiento', x.movimiento
    )
  FROM jsonb_to_recordset(coalesce(p_filas, '[]'::jsonb)) AS x(
    linea_clave text,
    fecha date,
    documento text,
    codigo_legacy text,
    descripcion text,
    entidad text,
    grupo text,
    sucursal text,
    movimiento text,
    cantidad numeric,
    valor_unitario numeric,
    total_venta numeric
  )
  WHERE nullif(trim(x.linea_clave), '') IS NOT NULL
    AND x.fecha IS NOT NULL
    AND nullif(trim(x.codigo_legacy), '') IS NOT NULL
    AND upper(coalesce(trim(x.movimiento), 'S')) = 'S'
  ON CONFLICT (origen_sistema, linea_hash) DO NOTHING;

  GET DIAGNOSTICS v_afectadas = ROW_COUNT;

  UPDATE public.repuestos_facturacion_historica_cargas
  SET filas_recibidas = least(
    CASE WHEN filas_archivo > 0 THEN filas_archivo ELSE filas_recibidas + v_recibidas END,
    filas_recibidas + v_recibidas
  )
  WHERE id = p_carga_id;

  RETURN jsonb_build_object(
    'recibidas', v_recibidas,
    'insertadas', v_afectadas
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.repuestos_finalizar_facturacion_historica(p_carga_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '210s'
AS $$
DECLARE
  v_resultado jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede cargar la facturacion historica'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.repuestos_facturacion_historica_cargas
    WHERE id = p_carga_id AND estado = 'PROCESANDO'
  ) THEN
    RAISE EXCEPTION 'La carga no existe o ya fue cerrada';
  END IF;

  v_resultado := public.repuestos_publicar_facturacion_historica();

  UPDATE public.repuestos_facturacion_historica_cargas SET activo = false WHERE activo;
  UPDATE public.repuestos_facturacion_historica_cargas
  SET
    estado = 'COMPLETADO',
    activo = true,
    lineas_vinculadas = coalesce((v_resultado->>'lineas_vinculadas')::integer, 0),
    productos_vinculados = coalesce((v_resultado->>'productos_vinculados')::integer, 0),
    completado_en = now()
  WHERE id = p_carga_id;

  RETURN v_resultado || jsonb_build_object('carga_id', p_carga_id);
END;
$$;

REVOKE ALL ON FUNCTION public.repuestos_iniciar_facturacion_historica(text,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.repuestos_importar_facturacion_historica_lote(uuid,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.repuestos_finalizar_facturacion_historica(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repuestos_iniciar_facturacion_historica(text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_importar_facturacion_historica_lote(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_finalizar_facturacion_historica(uuid) TO authenticated;

-- =====================================================================
-- 1d. Publicacion del historial (escritura -- CRITICAL)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.repuestos_publicar_facturacion_historica()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '90s'
AS $$
DECLARE
  v_lineas_fuente integer := 0;
  v_lineas_evaluadas integer := 0;
  v_lineas_vinculadas integer := 0;
  v_productos integer := 0;
  v_productos_12m integer := 0;
  v_productos_24m integer := 0;
  v_fecha_corte date := DATE '2026-07-01';
BEGIN
  IF auth.uid() IS NULL OR (
    NOT public.has_module_access(auth.uid(), 'repuestos')
    OR NOT (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
    )
  ) THEN
    RAISE EXCEPTION 'No tenes permiso para publicar el historial de repuestos'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    count(*)::integer,
    count(v.linea_id)::integer,
    count(*) FILTER (WHERE v.estado_vinculo = 'CONFIRMADA')::integer,
    count(DISTINCT v.producto_codigo)
      FILTER (WHERE v.estado_vinculo = 'CONFIRMADA')::integer
  INTO v_lineas_fuente, v_lineas_evaluadas, v_lineas_vinculadas, v_productos
  FROM public.facturacion_lineas_importadas f
  LEFT JOIN public.repuestos_ventas_vinculacion v ON v.linea_id = f.id
  WHERE f.origen_sistema = 'legacy_historico_detallado';

  IF v_lineas_fuente = 0 THEN
    RAISE EXCEPTION 'No existe una carga de facturacion historica detallada para publicar';
  END IF;

  IF v_lineas_evaluadas <> v_lineas_fuente THEN
    RAISE EXCEPTION
      'La vinculacion historica esta incompleta: % de % lineas fueron evaluadas. No se modifico la demanda.',
      v_lineas_evaluadas, v_lineas_fuente;
  END IF;

  CREATE TEMP TABLE tmp_demanda_historica_mensual ON COMMIT DROP AS
  SELECT
    v.producto_codigo,
    date_trunc('month', v.fecha_efectiva)::date AS mes,
    sum(v.cantidad)::numeric AS unidades_netas,
    sum(greatest(v.cantidad, 0))::numeric AS unidades_positivas,
    sum(abs(least(v.cantidad, 0)))::numeric AS devoluciones,
    count(DISTINCT coalesce(f.codigo_interno_factura, f.factura, f.id::text))::integer AS pedidos,
    sum(
      CASE
        WHEN upper(coalesce(f.moneda, 'USD')) IN ('GS', 'GRS', 'PYG') THEN 0
        ELSE coalesce(f.total_venta, 0)
      END
    )::numeric AS importe_comparable
  FROM public.facturacion_lineas_importadas f
  JOIN public.repuestos_ventas_vinculacion v ON v.linea_id = f.id
  WHERE f.origen_sistema = 'legacy_historico_detallado'
    AND v.estado_vinculo = 'CONFIRMADA'
    AND v.producto_codigo IS NOT NULL
    AND v.fecha_efectiva IS NOT NULL
    AND v.fecha_efectiva < v_fecha_corte
  GROUP BY v.producto_codigo, date_trunc('month', v.fecha_efectiva)::date;

  CREATE UNIQUE INDEX tmp_demanda_historica_mensual_idx
    ON tmp_demanda_historica_mensual(producto_codigo, mes);

  DELETE FROM public.repuestos_demanda_mensual
  WHERE mes < v_fecha_corte;

  INSERT INTO public.repuestos_demanda_mensual(
    producto_codigo, mes, unidades_netas, unidades_positivas,
    devoluciones, pedidos, importe_comparable
  )
  SELECT
    producto_codigo, mes, unidades_netas, unidades_positivas,
    devoluciones, pedidos, importe_comparable
  FROM tmp_demanda_historica_mensual;

  SELECT
    count(DISTINCT producto_codigo) FILTER (
      WHERE mes >= DATE '2025-08-01'
        AND mes <= DATE '2026-07-01'
        AND unidades_positivas > 0
    )::integer,
    count(DISTINCT producto_codigo) FILTER (
      WHERE mes >= DATE '2024-08-01'
        AND mes <= DATE '2026-07-01'
        AND unidades_positivas > 0
    )::integer
  INTO v_productos_12m, v_productos_24m
  FROM public.repuestos_demanda_mensual;

  UPDATE public.repuestos_facturacion_historica_cargas
  SET
    lineas_vinculadas = v_lineas_vinculadas,
    productos_vinculados = v_productos
  WHERE activo AND estado = 'COMPLETADO';

  RETURN jsonb_build_object(
    'lineas_fuente', v_lineas_fuente,
    'lineas_evaluadas', v_lineas_evaluadas,
    'lineas_vinculadas', v_lineas_vinculadas,
    'productos_vinculados', v_productos,
    'productos_con_ventas_12m', v_productos_12m,
    'productos_con_ventas_24m', v_productos_24m,
    'mes_desde', (SELECT min(mes) FROM public.repuestos_demanda_mensual),
    'mes_hasta', (SELECT max(mes) FROM public.repuestos_demanda_mensual)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.repuestos_iniciar_publicacion_historial()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '20s'
AS $$
DECLARE
  v_fuente integer;
  v_desde date;
  v_hasta date;
BEGIN
  IF auth.uid() IS NULL OR (
    NOT public.has_module_access(auth.uid(), 'repuestos')
    OR NOT (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
    )
  ) THEN
    RAISE EXCEPTION 'No tenes permiso para publicar el historial de repuestos'
      USING ERRCODE = '42501';
  END IF;

  SELECT filas_recibidas
  INTO v_fuente
  FROM public.repuestos_facturacion_historica_cargas
  WHERE activo AND estado = 'COMPLETADO'
  LIMIT 1;

  IF coalesce(v_fuente, 0) = 0 THEN
    RAISE EXCEPTION 'No existe una carga historica completada';
  END IF;

  SELECT
    date_trunc('month', min(f.fecha_factura))::date,
    least(DATE '2026-07-01', (date_trunc('month', max(f.fecha_factura)) + interval '1 month')::date)
  INTO v_desde, v_hasta
  FROM public.facturacion_lineas_importadas f
  WHERE f.origen_sistema = 'legacy_historico_detallado'
    AND f.fecha_factura < DATE '2026-07-01';

  IF v_desde IS NULL OR v_hasta IS NULL THEN
    RAISE EXCEPTION 'No hay ventas historicas confirmadas para materializar';
  END IF;

  UPDATE public.repuestos_facturacion_historica_cargas
  SET publicacion_estado = 'PROCESANDO', publicacion_hasta = NULL, publicado_en = NULL
  WHERE activo AND estado = 'COMPLETADO';

  RETURN jsonb_build_object(
    'fecha_desde', v_desde,
    'fecha_hasta_exclusiva', v_hasta,
    'lineas_fuente', v_fuente
  );
END;
$$;

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

  IF auth.uid() IS NULL OR (
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

CREATE OR REPLACE FUNCTION public.repuestos_finalizar_publicacion_historial()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '25s'
AS $$
DECLARE
  v_lineas integer;
  v_productos integer;
  v_productos_12m integer;
  v_productos_24m integer;
BEGIN
  IF auth.uid() IS NULL OR (
    NOT public.has_module_access(auth.uid(), 'repuestos')
    OR NOT (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
    )
  ) THEN
    RAISE EXCEPTION 'No tenes permiso para publicar el historial de repuestos'
      USING ERRCODE = '42501';
  END IF;

  SELECT lineas_vinculadas, productos_vinculados
  INTO v_lineas, v_productos
  FROM public.repuestos_facturacion_historica_cargas
  WHERE activo AND estado = 'COMPLETADO'
  LIMIT 1;

  SELECT
    count(DISTINCT producto_codigo) FILTER (
      WHERE mes >= DATE '2025-08-01' AND mes <= DATE '2026-07-01' AND unidades_positivas > 0
    )::integer,
    count(DISTINCT producto_codigo) FILTER (
      WHERE mes >= DATE '2024-08-01' AND mes <= DATE '2026-07-01' AND unidades_positivas > 0
    )::integer
  INTO v_productos_12m, v_productos_24m
  FROM public.repuestos_demanda_mensual;

  UPDATE public.repuestos_facturacion_historica_cargas
  SET
    publicacion_estado = 'COMPLETADO',
    publicado_en = now(),
    lineas_vinculadas = v_lineas,
    productos_vinculados = v_productos
  WHERE activo AND estado = 'COMPLETADO';

  RETURN jsonb_build_object(
    'lineas_vinculadas', v_lineas,
    'productos_vinculados', v_productos,
    'productos_con_ventas_12m', v_productos_12m,
    'productos_con_ventas_24m', v_productos_24m
  );
END;
$$;

REVOKE ALL ON FUNCTION public.repuestos_publicar_facturacion_historica() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.repuestos_iniciar_publicacion_historial() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.repuestos_publicar_historial_lote(date,date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.repuestos_finalizar_publicacion_historial() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repuestos_publicar_facturacion_historica() TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_iniciar_publicacion_historial() TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_publicar_historial_lote(date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_finalizar_publicacion_historial() TO authenticated;

-- =====================================================================
-- 1e. Conversiones de unidad historicas y reconstruccion del historial
--     unificado (escritura -- CRITICAL)
-- =====================================================================

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
  IF auth.uid() IS NULL OR (
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

CREATE OR REPLACE FUNCTION public.repuestos_refrescar_historial_unificado()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '240s'
AS $$
DECLARE
  v_actualizacion_id bigint;
  v_total integer := 0;
  v_confirmadas integer := 0;
  v_ambiguas integer := 0;
  v_sin_coincidencia integer := 0;
  v_productos_12m integer := 0;
  v_productos_24m integer := 0;
BEGIN
  IF auth.uid() IS NULL OR (
    NOT public.has_module_access(auth.uid(), 'repuestos')
    OR NOT (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
    )
  ) THEN
    RAISE EXCEPTION 'No tenes permiso para reconstruir el historial'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.repuestos_historial_actualizaciones(estado, ejecutado_por)
  VALUES ('PROCESANDO', auth.uid())
  RETURNING id INTO v_actualizacion_id;

  CREATE TEMP TABLE tmp_repuestos_productos ON COMMIT DROP AS
  SELECT
    p.codigo_interno,
    p.unidad,
    p.marca,
    p.incorporado_en,
    coalesce(s.stock_total, 0)::numeric AS stock_total,
    public.normalizar_codigo_repuesto_flexible(p.codigo_interno) AS interno_norm,
    public.normalizar_codigo_repuesto_flexible(p.codigo_fabricante) AS fabricante_norm,
    public.extraer_codigo_repuesto_descripcion(p.descripcion) AS descripcion_norm
  FROM public.productos p
  LEFT JOIN (
    SELECT producto_codigo, sum(saldo_actual)::numeric AS stock_total
    FROM public.repuestos_stock
    GROUP BY producto_codigo
  ) s ON s.producto_codigo = p.codigo_interno
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
  WHERE public.es_linea_facturacion_repuesto(
    f.tipo_facturacion,
    f.grupo_normalizado,
    f.subgrupo_original
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

  CREATE TEMP TABLE tmp_repuestos_candidatos(
    linea_id uuid NOT NULL,
    producto_codigo text NOT NULL,
    prioridad integer NOT NULL,
    metodo text NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_repuestos_candidatos
  SELECT l.id, m.producto_codigo, 0, 'MAESTRO_LEGACY'
  FROM tmp_repuestos_lineas l
  JOIN public.repuestos_maestro_legacy_cargas c
    ON c.activo AND c.estado = 'COMPLETADO'
  JOIN public.repuestos_maestro_legacy m
    ON m.carga_id = c.id
   AND m.codigo_legacy_norm = l.mercaderia_norm
  WHERE m.producto_codigo IS NOT NULL
    AND m.estado_vinculo IN ('CONFIRMADA', 'CONFIRMADA_CANONICA');

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

  DELETE FROM public.repuestos_ventas_vinculacion
  WHERE linea_id IS NOT NULL;

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
      ON mp.linea_id = c.linea_id AND mp.prioridad = c.prioridad
    GROUP BY c.linea_id, c.prioridad
  ),
  elegidos AS MATERIALIZED (
    SELECT DISTINCT ON (c.linea_id)
      c.linea_id,
      c.producto_codigo
    FROM tmp_repuestos_candidatos c
    JOIN mejor_prioridad mp
      ON mp.linea_id = c.linea_id AND mp.prioridad = c.prioridad
    JOIN tmp_repuestos_lineas l ON l.id = c.linea_id
    JOIN tmp_repuestos_productos p ON p.codigo_interno = c.producto_codigo
    ORDER BY
      c.linea_id,
      (p.marca = l.marca_origen) DESC,
      p.stock_total DESC,
      p.incorporado_en ASC NULLS LAST,
      p.codigo_interno
  )
  INSERT INTO public.repuestos_ventas_vinculacion(
    linea_id, producto_codigo, estado_vinculo, metodo_vinculo, prioridad,
    confianza, candidatos, cantidad_candidatos, fecha_efectiva,
    marca_origen, moneda, cantidad, unidad_producto
  )
  SELECT
    l.id,
    e.producto_codigo,
    CASE WHEN e.producto_codigo IS NULL THEN 'SIN_COINCIDENCIA' ELSE 'CONFIRMADA' END,
    CASE
      WHEN e.producto_codigo IS NULL THEN NULL
      WHEN r.cantidad_candidatos > 1 THEN r.metodo || '_CANONICO'
      ELSE r.metodo
    END,
    r.prioridad,
    CASE
      WHEN e.producto_codigo IS NULL THEN 0
      WHEN r.cantidad_candidatos > 1 THEN 0.85
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
    p.unidad
  FROM tmp_repuestos_lineas l
  LEFT JOIN resumen r ON r.linea_id = l.id
  LEFT JOIN elegidos e ON e.linea_id = l.id
  LEFT JOIN tmp_repuestos_productos p ON p.codigo_interno = e.producto_codigo;

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

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE estado_vinculo = 'CONFIRMADA')::integer,
    count(*) FILTER (WHERE estado_vinculo = 'AMBIGUA')::integer,
    count(*) FILTER (WHERE estado_vinculo = 'SIN_COINCIDENCIA')::integer
  INTO v_total, v_confirmadas, v_ambiguas, v_sin_coincidencia
  FROM public.repuestos_ventas_vinculacion;

  SELECT
    count(DISTINCT producto_codigo) FILTER (
      WHERE mes >= date_trunc('month', current_date)::date - interval '11 months'
    )::integer,
    count(DISTINCT producto_codigo) FILTER (
      WHERE mes >= date_trunc('month', current_date)::date - interval '23 months'
    )::integer
  INTO v_productos_12m, v_productos_24m
  FROM public.repuestos_demanda_mensual
  WHERE unidades_positivas > 0;

  UPDATE public.repuestos_historial_actualizaciones
  SET
    estado = 'COMPLETADA',
    lineas_totales = v_total,
    confirmadas = v_confirmadas,
    ambiguas = v_ambiguas,
    sin_coincidencia = v_sin_coincidencia,
    completado_en = now(),
    detalle = jsonb_build_object(
      'fuente', 'facturacion_existente',
      'productos_con_demanda', (SELECT count(DISTINCT producto_codigo) FROM public.repuestos_demanda_mensual),
      'productos_con_ventas_12m', v_productos_12m,
      'productos_con_ventas_24m', v_productos_24m,
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
    'productos_con_demanda', (SELECT count(DISTINCT producto_codigo) FROM public.repuestos_demanda_mensual),
    'productos_con_ventas_12m', v_productos_12m,
    'productos_con_ventas_24m', v_productos_24m
  );
END;
$$;

REVOKE ALL ON FUNCTION public.repuestos_aplicar_conversiones_unidad_historica() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.repuestos_refrescar_historial_unificado() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repuestos_aplicar_conversiones_unidad_historica() TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_refrescar_historial_unificado() TO authenticated;

-- =====================================================================
-- 1f. Parque: refresco de ultima actividad (SECURITY INVOKER -- incluido
--     por consistencia, ver nota en el mensaje de esta tanda)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.refrescar_parque_ultima_actividad()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
SET statement_timeout = 0
AS $$
DECLARE
  v_total integer;
BEGIN
  IF auth.uid() IS NULL
    OR NOT public.has_role(auth.uid(), 'admin'::public.app_role)
  THEN
    RAISE EXCEPTION 'Solo un administrador puede actualizar el resumen del Parque'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.parque_ultima_actividad;

  INSERT INTO public.parque_ultima_actividad (
    cliente_id, marca, ultima_venta_repuestos,
    ultimo_servicio_facturado, ultima_os, actualizado_en
  )
  WITH facturacion_resumen AS (
    SELECT
      f.cliente_id,
      CASE
          WHEN upper(trim(coalesce(to_jsonb(f) ->> 'marca_normalizada', ''))) IN ('CLAAS', 'HORSCH')
            THEN upper(trim(to_jsonb(f) ->> 'marca_normalizada'))
        WHEN upper(trim(coalesce(f.grupo, ''))) IN (
          'SERVICE - CLAAS', 'REPUESTOS - CLAAS', 'REPUESTOS CLAAS - PROMOCION',
          'REPUESTOS - CABEZALES/PLATAFOR', 'REPUESTOS TRACTOR', 'REPUESTOS DIVERSOS --'
        ) THEN 'CLAAS'
        WHEN upper(trim(coalesce(f.grupo, ''))) IN (
          'SERVICE - HORSCH', 'REPUESTOS PLANTADORA', 'REPUESTOS PULVERIZADORAS'
        ) THEN 'HORSCH'
        ELSE 'OTROS'
      END AS marca,
      max(f.fecha) FILTER (
        WHERE lower(trim(coalesce(f.grupo_fx, ''))) IN ('repuesto', 'repuestos')
      ) AS ultima_venta_repuestos,
      max(f.fecha) FILTER (
        WHERE lower(trim(coalesce(f.grupo_fx, ''))) IN (
          'mano de obra', 'servicio', 'servicios', 'kilometraje'
        )
      ) AS ultimo_servicio_facturado
    FROM public.facturacion f
    WHERE f.cliente_id IS NOT NULL
      AND NOT coalesce(f.excluido_de_reportes, false)
      AND lower(trim(coalesce(f.grupo_fx, ''))) IN (
        'repuesto', 'repuestos', 'mano de obra', 'servicio', 'servicios', 'kilometraje'
      )
    GROUP BY f.cliente_id, 2
  ),
  os_resumen AS (
    SELECT
      pm.cliente_id,
      CASE WHEN upper(trim(pm.marca::text)) IN ('CLAAS', 'HORSCH')
        THEN upper(trim(pm.marca::text)) ELSE 'OTROS' END AS marca,
      max(greatest(
        coalesce(osi.fecha_abierta_os, '-infinity'::timestamptz),
        coalesce(osi.fecha_cierre_os, '-infinity'::timestamptz),
        coalesce(osi.fecha_emision_factura, '-infinity'::timestamptz)
      ))::date AS ultima_os
    FROM public.ordenes_servicio_importadas osi
    JOIN public.parque_maquinas pm
      ON public.parque_normalizar_clave(pm.serie)
        = public.parque_normalizar_clave(osi.nro_chasis)
    WHERE pm.activo = true
      AND pm.cliente_id IS NOT NULL
      AND public.parque_normalizar_clave(pm.serie) <> ''
      AND public.parque_normalizar_clave(osi.nro_chasis) <> ''
      AND public.parque_normalizar_clave(osi.situacion_os) NOT IN (
        'ANULADA', 'ANULADO', 'CANCELADA', 'CANCELADO'
      )
      AND coalesce(osi.fecha_abierta_os, osi.fecha_cierre_os, osi.fecha_emision_factura) IS NOT NULL
    GROUP BY pm.cliente_id, 2
  ),
  claves AS (
    SELECT cliente_id, marca FROM facturacion_resumen
    UNION
    SELECT cliente_id, marca FROM os_resumen
  )
  SELECT
    c.cliente_id, c.marca, f.ultima_venta_repuestos,
    f.ultimo_servicio_facturado, o.ultima_os, now()
  FROM claves c
  LEFT JOIN facturacion_resumen f USING (cliente_id, marca)
  LEFT JOIN os_resumen o USING (cliente_id, marca);

  GET DIAGNOSTICS v_total = ROW_COUNT;
  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.refrescar_parque_ultima_actividad() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refrescar_parque_ultima_actividad() TO authenticated;

-- =====================================================================
-- 2. profiles: sacar el acceso a public/anon. Las policies TO authenticated
--    (Authenticated can view profiles, profiles_read_authenticated) quedan
--    intactas -- ningun usuario logueado pierde acceso.
-- =====================================================================

DROP POLICY IF EXISTS "Allow read profiles" ON public.profiles;

-- =====================================================================
-- 3. user_roles: sacar el SELECT abierto a cualquier authenticated.
--    "Users see own roles" (propia fila o admin) sigue vigente.
-- =====================================================================

DROP POLICY IF EXISTS "user_roles_read_authenticated" ON public.user_roles;

-- =====================================================================
-- 4. jornadas / programaciones: sin uso en el frontend actual (verificado
--    por codigo -- todo el flujo activo corre sobre servicio_jornadas). Se
--    sacan las policies abiertas sin reponer ninguna: quedan denegadas por
--    RLS default para authenticated, que es lo correcto para tablas sin
--    trafico real hoy.
-- =====================================================================

DROP POLICY IF EXISTS "jornadas_select_authenticated" ON public.jornadas;
DROP POLICY IF EXISTS "jornadas_insert_authenticated" ON public.jornadas;
DROP POLICY IF EXISTS "jornadas_update_authenticated" ON public.jornadas;
DROP POLICY IF EXISTS "jornadas_delete_authenticated" ON public.jornadas;

DROP POLICY IF EXISTS "programaciones_select_authenticated" ON public.programaciones;
DROP POLICY IF EXISTS "programaciones_insert_authenticated" ON public.programaciones;
DROP POLICY IF EXISTS "programaciones_update_authenticated" ON public.programaciones;
DROP POLICY IF EXISTS "programaciones_delete_authenticated" ON public.programaciones;

NOTIFY pgrst, 'reload schema';
