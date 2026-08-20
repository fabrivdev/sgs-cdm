-- Un solo pedido en doce meses no demuestra recurrencia. La politica viva lo
-- clasifica como BAJO PEDIDO y solo conserva una compra si existe un minimo
-- estrategico configurado manualmente.
--
-- Tambien evita interpretar medidas al final de una descripcion (8X45,
-- 16X70, 10X20X30) como codigos de fabricante. Esas coincidencias estaban
-- relacionando piezas fisicamente distintas solo por compartir dimensiones.

CREATE OR REPLACE FUNCTION public.extraer_codigo_repuesto_descripcion(p_descripcion text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  WITH candidato AS (
    SELECT public.normalizar_codigo_repuesto_flexible(
      substring(
        upper(trim(coalesce(p_descripcion, '')))
        from '([A-Z0-9][A-Z0-9./-]*[0-9])$'
      )
    ) AS codigo
  )
  SELECT CASE
    -- Una medida no identifica de manera unica a un repuesto.
    WHEN codigo ~ '^M?[0-9]{1,4}(X[0-9]{1,4})+$' THEN NULL
    ELSE codigo
  END
  FROM candidato;
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
  entradas_base AS MATERIALIZED (
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
      coalesce(r->>'segmento', 'SERVICIO ECONOMICO') AS segmento_original
    FROM base
  ),
  entradas AS MATERIALIZED (
    SELECT
      e.*,
      CASE
        WHEN e.pedidos <= 1 THEN 'BAJO PEDIDO'
        ELSE e.segmento_original
      END AS segmento
    FROM entradas_base e
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
        WHEN e.segmento = 'BAJO PEDIDO' THEN 'NO APLICA'
        WHEN e.meses_activos <= 1 OR e.seguridad_anterior = 0 THEN 'ESTIMADA'
        ELSE 'ESTADISTICA'
      END AS tipo_seguridad,
      CASE
        WHEN e.segmento = 'BAJO PEDIDO' THEN 0
        WHEN e.pedidos = 2 THEN least(e.horizonte, v_modelo.pedido_unico_cobertura_meses + 1)
        WHEN e.pedidos = 3 THEN least(e.horizonte, v_modelo.pedido_unico_cobertura_meses + 2)
        ELSE e.horizonte
      END::numeric AS cobertura_aplicada,
      CASE
        WHEN e.segmento = 'BAJO PEDIDO' THEN 0
        ELSE greatest(
          e.seguridad_anterior,
          least(
            e.pronostico * CASE
              WHEN e.segmento = 'ESTRELLA' THEN 0.75
              WHEN e.segmento = 'DEMANDA VOLATIL' THEN 0.50
              ELSE 0.25
            END,
            e.demanda_horizonte * v_modelo.stock_seguridad_tope
          )
        )
      END::numeric AS seguridad_v3
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
          WHEN o.segmento = 'BAJO PEDIDO' THEN 0
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
      greatest(
        0,
        ceil(round(o.objetivo_v3 - o.stock_global, 6))
      )::integer AS sugerencia_v3
    FROM objetivos o
  ),
  enriquecidos AS MATERIALIZED (
    SELECT
      f.r || jsonb_build_object(
        'segmento', f.segmento,
        'demanda_horizonte', CASE WHEN f.segmento = 'BAJO PEDIDO' THEN 0 ELSE f.demanda_horizonte END,
        'stock_seguridad', f.seguridad_v3,
        'stock_objetivo', f.objetivo_v3,
        'necesidad_neta', f.brecha_v3,
        'sugerencia_unidades', f.sugerencia_v3,
        'confianza_datos', f.confianza_datos,
        'tipo_stock_seguridad', f.tipo_seguridad,
        'cobertura_aplicada_meses', f.cobertura_aplicada,
        'explicacion', coalesce(f.r->'explicacion', '{}'::jsonb) || jsonb_build_object(
          'motor', 'vivo_intermitente_v4',
          'confianza_datos', f.confianza_datos,
          'tipo_stock_seguridad', f.tipo_seguridad,
          'meses_activos_12m', f.meses_activos,
          'pedidos_12m', f.pedidos,
          'cobertura_aplicada_meses', f.cobertura_aplicada,
          'pedido_unico_bajo_pedido', f.pedidos <= 1,
          'motivo', CASE
            WHEN f.segmento = 'BAJO PEDIDO' AND f.minimo_estrategico > f.stock_global
              THEN 'Pedido unico: compra definida solamente por el minimo estrategico manual'
            WHEN f.segmento = 'BAJO PEDIDO'
              THEN 'Pedido unico: sin evidencia suficiente para reposicion automatica'
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
      'motor', 'v4'
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

COMMENT ON FUNCTION public.repuestos_sugerencia_viva(text,date,text,text,text,boolean,integer,integer) IS
  'Motor vivo v4: un pedido en 12 meses queda bajo pedido salvo minimo estrategico manual.';

REVOKE ALL ON FUNCTION public.extraer_codigo_repuesto_descripcion(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.extraer_codigo_repuesto_descripcion(text) TO authenticated;

REVOKE ALL ON FUNCTION public.repuestos_sugerencia_viva(text,date,text,text,text,boolean,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repuestos_sugerencia_viva(text,date,text,text,text,boolean,integer,integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
