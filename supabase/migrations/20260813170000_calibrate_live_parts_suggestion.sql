-- Calibracion v2 del motor vivo basada en las primeras exportaciones reales.
-- Conserva el calculo base como funcion interna y recalcula clasificacion de
-- intermitencia, tendencia, seguridad, cobertura y redondeo.

ALTER TABLE public.repuestos_modelo_versiones
  ADD COLUMN IF NOT EXISTS adi_intermitente_umbral numeric NOT NULL DEFAULT 1.32 CHECK (adi_intermitente_umbral > 0),
  ADD COLUMN IF NOT EXISTS cv2_erratico_umbral numeric NOT NULL DEFAULT 0.49 CHECK (cv2_erratico_umbral >= 0),
  ADD COLUMN IF NOT EXISTS tendencia_caida_umbral numeric NOT NULL DEFAULT 0.50 CHECK (tendencia_caida_umbral BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS tendencia_caida_tope numeric NOT NULL DEFAULT 1.25 CHECK (tendencia_caida_tope >= 0),
  ADD COLUMN IF NOT EXISTS stock_seguridad_tope numeric NOT NULL DEFAULT 0.50 CHECK (stock_seguridad_tope >= 0),
  ADD COLUMN IF NOT EXISTS cobertura_margen_meses numeric NOT NULL DEFAULT 0.50 CHECK (cobertura_margen_meses >= 0),
  ADD COLUMN IF NOT EXISTS pedido_unico_cobertura_meses numeric NOT NULL DEFAULT 2 CHECK (pedido_unico_cobertura_meses >= 0);

CREATE OR REPLACE FUNCTION public.repuestos_crear_version_modelo(
  p_marca text,
  p_nombre text,
  p_parametros jsonb,
  p_segmentos jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_anterior public.repuestos_modelo_versiones%ROWTYPE;
  v_nueva_id uuid;
  v_version integer;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_module_access(auth.uid(), 'repuestos')
     OR NOT (
       public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
     ) THEN
    RAISE EXCEPTION 'No tenes permiso para configurar el modelo' USING ERRCODE = '42501';
  END IF;

  IF upper(trim(p_marca)) NOT IN ('CLAAS','HORSCH') THEN
    RAISE EXCEPTION 'Marca invalida';
  END IF;

  SELECT * INTO v_anterior
  FROM public.repuestos_modelo_versiones
  WHERE marca::text = upper(trim(p_marca)) AND activa
  FOR UPDATE;

  IF v_anterior.id IS NULL THEN
    RAISE EXCEPTION 'No existe una configuracion activa para %', p_marca;
  END IF;

  SELECT coalesce(max(version), 0) + 1 INTO v_version
  FROM public.repuestos_modelo_versiones
  WHERE marca = v_anterior.marca;

  UPDATE public.repuestos_modelo_versiones SET activa = false WHERE id = v_anterior.id;

  INSERT INTO public.repuestos_modelo_versiones (
    marca, version, nombre, activa, peso_reciente, peso_anterior,
    lead_time_meses, ciclo_planificacion_meses, origen_predeterminado,
    abc_limite_a, abc_limite_b, fsn_pedidos_f, fsn_dias_f, fsn_dias_n,
    xyz_cv_x, xyz_cv_y, xyz_meses_x, xyz_meses_y_min, xyz_meses_y_max,
    adi_intermitente_umbral, cv2_erratico_umbral, tendencia_caida_umbral,
    tendencia_caida_tope, stock_seguridad_tope, cobertura_margen_meses,
    pedido_unico_cobertura_meses, creado_por
  ) VALUES (
    v_anterior.marca, v_version,
    coalesce(NULLIF(trim(p_nombre), ''), 'Modelo ' || upper(trim(p_marca)) || ' v' || v_version),
    true,
    coalesce(NULLIF(p_parametros->>'peso_reciente', '')::numeric, v_anterior.peso_reciente),
    coalesce(NULLIF(p_parametros->>'peso_anterior', '')::numeric, v_anterior.peso_anterior),
    coalesce(NULLIF(p_parametros->>'lead_time_meses', '')::integer, v_anterior.lead_time_meses),
    coalesce(NULLIF(p_parametros->>'ciclo_planificacion_meses', '')::integer, v_anterior.ciclo_planificacion_meses),
    upper(coalesce(NULLIF(trim(p_parametros->>'origen_predeterminado'), ''), v_anterior.origen_predeterminado)),
    coalesce(NULLIF(p_parametros->>'abc_limite_a', '')::numeric, v_anterior.abc_limite_a),
    coalesce(NULLIF(p_parametros->>'abc_limite_b', '')::numeric, v_anterior.abc_limite_b),
    coalesce(NULLIF(p_parametros->>'fsn_pedidos_f', '')::integer, v_anterior.fsn_pedidos_f),
    coalesce(NULLIF(p_parametros->>'fsn_dias_f', '')::integer, v_anterior.fsn_dias_f),
    coalesce(NULLIF(p_parametros->>'fsn_dias_n', '')::integer, v_anterior.fsn_dias_n),
    coalesce(NULLIF(p_parametros->>'xyz_cv_x', '')::numeric, v_anterior.xyz_cv_x),
    coalesce(NULLIF(p_parametros->>'xyz_cv_y', '')::numeric, v_anterior.xyz_cv_y),
    coalesce(NULLIF(p_parametros->>'xyz_meses_x', '')::integer, v_anterior.xyz_meses_x),
    coalesce(NULLIF(p_parametros->>'xyz_meses_y_min', '')::integer, v_anterior.xyz_meses_y_min),
    coalesce(NULLIF(p_parametros->>'xyz_meses_y_max', '')::integer, v_anterior.xyz_meses_y_max),
    coalesce(NULLIF(p_parametros->>'adi_intermitente_umbral', '')::numeric, v_anterior.adi_intermitente_umbral),
    coalesce(NULLIF(p_parametros->>'cv2_erratico_umbral', '')::numeric, v_anterior.cv2_erratico_umbral),
    coalesce(NULLIF(p_parametros->>'tendencia_caida_umbral', '')::numeric, v_anterior.tendencia_caida_umbral),
    coalesce(NULLIF(p_parametros->>'tendencia_caida_tope', '')::numeric, v_anterior.tendencia_caida_tope),
    coalesce(NULLIF(p_parametros->>'stock_seguridad_tope', '')::numeric, v_anterior.stock_seguridad_tope),
    coalesce(NULLIF(p_parametros->>'cobertura_margen_meses', '')::numeric, v_anterior.cobertura_margen_meses),
    coalesce(NULLIF(p_parametros->>'pedido_unico_cobertura_meses', '')::numeric, v_anterior.pedido_unico_cobertura_meses),
    auth.uid()
  ) RETURNING id INTO v_nueva_id;

  IF p_segmentos IS NULL OR jsonb_typeof(p_segmentos) <> 'array' THEN
    INSERT INTO public.repuestos_modelo_segmentos (modelo_version_id, segmento, nivel_servicio, revision_meses, valor_z, descripcion)
    SELECT v_nueva_id, segmento, nivel_servicio, revision_meses, valor_z, descripcion
    FROM public.repuestos_modelo_segmentos WHERE modelo_version_id = v_anterior.id;
  ELSE
    INSERT INTO public.repuestos_modelo_segmentos (modelo_version_id, segmento, nivel_servicio, revision_meses, valor_z, descripcion)
    SELECT v_nueva_id, x.segmento, x.nivel_servicio, x.revision_meses, x.valor_z, x.descripcion
    FROM jsonb_to_recordset(p_segmentos) AS x(segmento text, nivel_servicio numeric, revision_meses integer, valor_z numeric, descripcion text);
  END IF;

  INSERT INTO public.repuestos_modelo_reglas_mix (modelo_version_id, codigo_mix, segmento)
  SELECT v_nueva_id, codigo_mix, segmento
  FROM public.repuestos_modelo_reglas_mix WHERE modelo_version_id = v_anterior.id;

  RETURN v_nueva_id;
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.repuestos_sugerencia_viva_base_v1(text,date,text,text,text,boolean,integer,integer)') IS NULL THEN
    ALTER FUNCTION public.repuestos_sugerencia_viva(text,date,text,text,text,boolean,integer,integer)
      RENAME TO repuestos_sugerencia_viva_base_v1;
  END IF;
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
SET statement_timeout = '30s'
AS $$
DECLARE
  v_modelo public.repuestos_modelo_versiones%ROWTYPE;
  v_base jsonb;
  v_resultado jsonb;
  v_fecha date := coalesce(p_fecha_analisis, current_date);
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_module_access(auth.uid(), 'repuestos') THEN
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

REVOKE ALL ON FUNCTION public.repuestos_sugerencia_viva_base_v1(text,date,text,text,text,boolean,integer,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repuestos_sugerencia_viva_base_v1(text,date,text,text,text,boolean,integer,integer) FROM authenticated;
REVOKE ALL ON FUNCTION public.repuestos_sugerencia_viva(text,date,text,text,text,boolean,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repuestos_sugerencia_viva(text,date,text,text,text,boolean,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_crear_version_modelo(text,text,jsonb,jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
