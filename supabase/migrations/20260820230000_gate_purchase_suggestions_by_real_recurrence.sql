-- Evita transformar ventas puntuales en consumo mensual recurrente.
--
-- Una factura no equivale a un episodio de demanda: varias facturas del mismo
-- cliente separadas por hasta 30 dias pertenecen al mismo episodio comercial.
-- La compra automatica solo se habilita cuando existe recurrencia temporal
-- suficiente. El historial permanece visible y un minimo estrategico manual
-- sigue funcionando como piso de compra.

DO $migration$
BEGIN
  IF to_regprocedure(
    'public.repuestos_sugerencia_viva_base_v4(text,date,text,text,text,boolean,integer,integer)'
  ) IS NULL THEN
    ALTER FUNCTION public.repuestos_sugerencia_viva(
      text,date,text,text,text,boolean,integer,integer
    ) RENAME TO repuestos_sugerencia_viva_base_v4;
  END IF;
END;
$migration$;

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
  v_base jsonb;
  v_fecha date := coalesce(p_fecha_analisis, current_date);
  v_resultado jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_module_access(auth.uid(), 'repuestos') THEN
    RAISE EXCEPTION 'No tenes acceso al modulo de repuestos' USING ERRCODE = '42501';
  END IF;

  -- El motor v4 conserva la clasificacion y el pronostico. Esta capa agrega
  -- una puerta de evidencia antes de permitir que se conviertan en una compra.
  v_base := public.repuestos_sugerencia_viva_base_v4(
    p_marca, v_fecha, NULL, 'TODOS', 'TODOS', false, 20000, 0
  );

  WITH base AS MATERIALIZED (
    SELECT value AS r
    FROM jsonb_array_elements(coalesce(v_base->'rows', '[]'::jsonb))
  ),
  productos_analizados AS MATERIALIZED (
    SELECT DISTINCT r->>'producto_codigo' AS producto_codigo
    FROM base
    WHERE nullif(r->>'producto_codigo', '') IS NOT NULL
  ),
  recurrencia_mensual AS MATERIALIZED (
    SELECT
      p.producto_codigo,
      count(*) FILTER (
        WHERE d.mes >= date_trunc('month', v_fecha)::date - interval '11 months'
          AND d.mes <= date_trunc('month', v_fecha)::date
          AND d.unidades_positivas > 0
      )::integer AS meses_12m,
      count(*) FILTER (
        WHERE d.mes >= date_trunc('month', v_fecha)::date - interval '23 months'
          AND d.mes <= date_trunc('month', v_fecha)::date
          AND d.unidades_positivas > 0
      )::integer AS meses_24m,
      coalesce(
        max(d.unidades_positivas) FILTER (
          WHERE d.mes >= date_trunc('month', v_fecha)::date - interval '11 months'
            AND d.mes <= date_trunc('month', v_fecha)::date
        )
        / nullif(sum(d.unidades_positivas) FILTER (
          WHERE d.mes >= date_trunc('month', v_fecha)::date - interval '11 months'
            AND d.mes <= date_trunc('month', v_fecha)::date
        ), 0),
        0
      )::numeric AS concentracion_mes_12m
    FROM productos_analizados p
    LEFT JOIN public.repuestos_demanda_mensual d
      ON d.producto_codigo = p.producto_codigo
     AND d.mes >= date_trunc('month', v_fecha)::date - interval '23 months'
     AND d.mes <= date_trunc('month', v_fecha)::date
    GROUP BY p.producto_codigo
  ),
  ventas_diarias AS MATERIALIZED (
    SELECT
      v.producto_codigo,
      v.fecha_efectiva,
      coalesce(
        nullif(upper(regexp_replace(trim(f.entidad_nombre), '\s+', ' ', 'g')), ''),
        'CLIENTE NO IDENTIFICADO'
      ) AS cliente_norm
    FROM productos_analizados p
    JOIN public.repuestos_ventas_vinculacion v
      ON v.producto_codigo = p.producto_codigo
     AND v.estado_vinculo = 'CONFIRMADA'
     AND v.fecha_efectiva >= date_trunc('month', v_fecha)::date - interval '23 months'
     AND v.fecha_efectiva <= v_fecha
     AND v.cantidad > 0
    JOIN public.facturacion_lineas_importadas f ON f.id = v.linea_id
    GROUP BY v.producto_codigo, v.fecha_efectiva,
      coalesce(
        nullif(upper(regexp_replace(trim(f.entidad_nombre), '\s+', ' ', 'g')), ''),
        'CLIENTE NO IDENTIFICADO'
      )
  ),
  ventas_con_anterior AS MATERIALIZED (
    SELECT
      vd.*,
      lag(vd.fecha_efectiva) OVER (
        PARTITION BY vd.producto_codigo, vd.cliente_norm
        ORDER BY vd.fecha_efectiva
      ) AS fecha_anterior
    FROM ventas_diarias vd
  ),
  ventas_con_episodio AS MATERIALIZED (
    SELECT
      va.*,
      sum(CASE
        WHEN va.fecha_anterior IS NULL
          OR va.fecha_efectiva - va.fecha_anterior > 30 THEN 1
        ELSE 0
      END) OVER (
        PARTITION BY va.producto_codigo, va.cliente_norm
        ORDER BY va.fecha_efectiva
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      )::integer AS episodio_id
    FROM ventas_con_anterior va
  ),
  recurrencia_comercial AS MATERIALIZED (
    SELECT
      p.producto_codigo,
      count(DISTINCT ve.cliente_norm) FILTER (
        WHERE ve.fecha_efectiva >= date_trunc('month', v_fecha)::date - interval '11 months'
      )::integer AS clientes_12m,
      count(DISTINCT (ve.cliente_norm, ve.episodio_id)) FILTER (
        WHERE ve.fecha_efectiva >= date_trunc('month', v_fecha)::date - interval '11 months'
      )::integer AS episodios_12m,
      count(DISTINCT (ve.cliente_norm, ve.episodio_id))::integer AS episodios_24m
    FROM productos_analizados p
    LEFT JOIN ventas_con_episodio ve ON ve.producto_codigo = p.producto_codigo
    GROUP BY p.producto_codigo
  ),
  entradas AS MATERIALIZED (
    SELECT
      b.r,
      b.r->>'producto_codigo' AS producto_codigo,
      greatest(0, coalesce((b.r->>'stock_global')::numeric, 0)) AS stock_global,
      greatest(0, coalesce((b.r->>'stock_minimo_estrategico')::numeric, 0)) AS minimo_estrategico,
      greatest(0, coalesce((b.r->>'sugerencia_unidades')::integer, 0)) AS sugerencia_original,
      coalesce(b.r->>'segmento', 'SERVICIO ECONOMICO') AS segmento_original,
      coalesce(b.r->>'estado_datos', 'LISTO') AS estado_datos,
      greatest(0, coalesce((b.r->>'unidades_12m')::numeric, 0)) AS unidades_12m,
      coalesce(rm.meses_12m, 0) AS meses_12m,
      coalesce(rm.meses_24m, 0) AS meses_24m,
      coalesce(rm.concentracion_mes_12m, 0) AS concentracion_mes_12m,
      coalesce(rc.clientes_12m, 0) AS clientes_12m,
      coalesce(rc.episodios_12m, 0) AS episodios_12m,
      coalesce(rc.episodios_24m, 0) AS episodios_24m
    FROM base b
    LEFT JOIN recurrencia_mensual rm
      ON rm.producto_codigo = b.r->>'producto_codigo'
    LEFT JOIN recurrencia_comercial rc
      ON rc.producto_codigo = b.r->>'producto_codigo'
  ),
  evaluadas AS MATERIALIZED (
    SELECT
      e.*,
      (
        (e.meses_12m >= 3 AND e.episodios_12m >= 3)
        OR (
          e.meses_12m >= 2
          AND e.episodios_12m >= 2
          AND e.clientes_12m >= 2
          AND e.concentracion_mes_12m <= 0.70
        )
        OR (e.meses_24m >= 4 AND e.episodios_24m >= 4)
      ) AS evidencia_recurrencia,
      CASE
        WHEN e.unidades_12m <= 0 THEN 'SIN_DEMANDA_RECIENTE'
        WHEN e.meses_12m <= 1 THEN 'VENTA_EN_UN_SOLO_MES'
        WHEN e.episodios_12m <= 1 THEN 'UN_SOLO_EPISODIO_COMERCIAL'
        WHEN e.concentracion_mes_12m > 0.70 AND e.meses_12m <= 2
          THEN 'DEMANDA_CONCENTRADA_EN_UN_MES'
        WHEN e.clientes_12m <= 1 AND e.meses_12m <= 2
          THEN 'DEMANDA_CONCENTRADA_EN_UN_CLIENTE'
        ELSE 'RECURRENCIA_INSUFICIENTE'
      END AS motivo_no_recurrente
    FROM entradas e
  ),
  enriquecidas AS MATERIALIZED (
    SELECT
      CASE
        WHEN ev.evidencia_recurrencia OR ev.unidades_12m <= 0 THEN
          ev.r || jsonb_build_object(
            'meses_venta_24m', ev.meses_24m,
            'episodios_demanda_12m', ev.episodios_12m,
            'episodios_demanda_24m', ev.episodios_24m,
            'clientes_12m', ev.clientes_12m,
            'concentracion_mes_12m', ev.concentracion_mes_12m,
            'evidencia_recurrencia', ev.evidencia_recurrencia,
            'explicacion', coalesce(ev.r->'explicacion', '{}'::jsonb)
              || jsonb_build_object(
                'puerta_recurrencia', 'APROBADA',
                'meses_activos_12m', ev.meses_12m,
                'meses_activos_24m', ev.meses_24m,
                'episodios_12m', ev.episodios_12m,
                'episodios_24m', ev.episodios_24m,
                'clientes_12m', ev.clientes_12m,
                'concentracion_mes_12m', ev.concentracion_mes_12m
              )
          )
        ELSE
          ev.r || jsonb_build_object(
            'segmento', 'BAJO PEDIDO',
            'demanda_horizonte', 0,
            'stock_seguridad', 0,
            'stock_objetivo', ev.minimo_estrategico,
            'necesidad_neta', greatest(0, ev.minimo_estrategico - ev.stock_global),
            'sugerencia_unidades', greatest(
              0,
              ceil(ev.minimo_estrategico - ev.stock_global)
            )::integer,
            'confianza_datos', 'BAJA',
            'tipo_stock_seguridad', 'NO APLICA',
            'cobertura_aplicada_meses', 0,
            'meses_venta_24m', ev.meses_24m,
            'episodios_demanda_12m', ev.episodios_12m,
            'episodios_demanda_24m', ev.episodios_24m,
            'clientes_12m', ev.clientes_12m,
            'concentracion_mes_12m', ev.concentracion_mes_12m,
            'evidencia_recurrencia', false,
            'explicacion', coalesce(ev.r->'explicacion', '{}'::jsonb)
              || jsonb_build_object(
                'motor', 'vivo_recurrencia_v5',
                'puerta_recurrencia', 'BLOQUEADA',
                'motivo_no_recurrente', ev.motivo_no_recurrente,
                'meses_activos_12m', ev.meses_12m,
                'meses_activos_24m', ev.meses_24m,
                'episodios_12m', ev.episodios_12m,
                'episodios_24m', ev.episodios_24m,
                'clientes_12m', ev.clientes_12m,
                'concentracion_mes_12m', ev.concentracion_mes_12m,
                'motivo', CASE
                  WHEN ev.minimo_estrategico > ev.stock_global
                    THEN 'Venta puntual: compra definida solamente por el minimo estrategico manual'
                  ELSE 'Venta puntual o concentrada: sin recurrencia suficiente para reposicion automatica'
                END
              )
          )
      END AS r,
      CASE
        WHEN ev.evidencia_recurrencia OR ev.unidades_12m <= 0
          THEN ev.sugerencia_original
        ELSE greatest(0, ceil(ev.minimo_estrategico - ev.stock_global))::integer
      END AS sugerencia,
      CASE
        WHEN ev.evidencia_recurrencia OR ev.unidades_12m <= 0
          THEN ev.segmento_original
        ELSE 'BAJO PEDIDO'
      END AS segmento,
      ev.estado_datos
    FROM evaluadas ev
  ),
  resumen AS MATERIALIZED (
    SELECT
      count(*)::integer AS total_piezas,
      count(*) FILTER (WHERE sugerencia > 0)::integer AS piezas_sugeridas,
      coalesce(sum(sugerencia), 0)::integer AS unidades_sugeridas,
      count(*) FILTER (WHERE estado_datos = 'CODIGO_NUEVO_SIN_HISTORIAL')::integer
        AS piezas_nuevas_sin_historial,
      count(*) FILTER (WHERE estado_datos = 'SIN_VENTAS_RECIENTES')::integer
        AS piezas_sin_ventas_recientes,
      count(*) FILTER (WHERE r->>'confianza_datos' = 'BAJA')::integer
        AS piezas_confianza_baja,
      count(*) FILTER (WHERE r->>'evidencia_recurrencia' = 'false')::integer
        AS piezas_sin_recurrencia
    FROM enriquecidas
  ),
  filtradas AS MATERIALIZED (
    SELECT *
    FROM enriquecidas e
    WHERE (
      nullif(trim(coalesce(p_buscar, '')), '') IS NULL
      OR e.r->>'producto_codigo' ILIKE '%' || trim(p_buscar) || '%'
      OR coalesce(e.r->>'codigo_fabricante', '') ILIKE '%' || trim(p_buscar) || '%'
      OR e.r->>'descripcion' ILIKE '%' || trim(p_buscar) || '%'
    )
      AND (coalesce(p_segmento, 'TODOS') = 'TODOS' OR e.segmento = p_segmento)
      AND (coalesce(p_estado, 'TODOS') = 'TODOS' OR e.estado_datos = p_estado)
      AND (NOT coalesce(p_solo_sugeridos, false) OR e.sugerencia > 0)
  ),
  pagina AS MATERIALIZED (
    SELECT *
    FROM filtradas
    ORDER BY sugerencia DESC,
      coalesce((r->>'total_vendido_12m')::numeric, 0) DESC,
      r->>'producto_codigo'
    LIMIT greatest(1, least(coalesce(p_limite, 50), 1000))
    OFFSET greatest(0, coalesce(p_offset, 0))
  )
  SELECT jsonb_build_object(
    'modelo', coalesce(v_base->'modelo', '{}'::jsonb)
      || jsonb_build_object('motor', 'v5_recurrencia_real'),
    'fecha_analisis', v_fecha,
    'resumen', to_jsonb(resumen),
    'total_filtrado', (SELECT count(*) FROM filtradas),
    'rows', coalesce((SELECT jsonb_agg(r) FROM pagina), '[]'::jsonb)
  )
  INTO v_resultado
  FROM resumen;

  RETURN v_resultado;
END;
$function$;

COMMENT ON FUNCTION public.repuestos_sugerencia_viva(
  text,date,text,text,text,boolean,integer,integer
) IS 'Motor vivo v5: bloquea compras automaticas sin recurrencia temporal y comercial suficiente.';

REVOKE ALL ON FUNCTION public.repuestos_sugerencia_viva_base_v4(
  text,date,text,text,text,boolean,integer,integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.repuestos_sugerencia_viva(
  text,date,text,text,text,boolean,integer,integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repuestos_sugerencia_viva(
  text,date,text,text,text,boolean,integer,integer
) TO authenticated;

NOTIFY pgrst, 'reload schema';
