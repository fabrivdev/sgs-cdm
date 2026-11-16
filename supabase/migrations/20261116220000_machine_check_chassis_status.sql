BEGIN;

CREATE OR REPLACE FUNCTION public.servicios_controles_listar()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(), 'servicios.controles_maquinas') THEN
    RAISE EXCEPTION 'Sin acceso a Puesta a punto' USING ERRCODE = '42501';
  END IF;

  RETURN coalesce((
    WITH candidatos AS (
      SELECT public.normalizar_chasis_notificacion(u.chasis) AS chasis,
        upper(btrim(u.marca)) AS marca, u.modelo, u.ata, u.chasis_ambiguo
      FROM public.maquinaria_importacion_unidades_operativas u
      WHERE u.activa AND coalesce(u.estado_fuente, '') NOT ILIKE '%cancel%'
    ), conflictos AS (
      SELECT chasis, CASE WHEN count(DISTINCT marca) = 1 THEN min(marca) END AS marca,
        CASE WHEN count(DISTINCT modelo) = 1 THEN min(modelo) END AS modelo, max(ata) AS ata
      FROM candidatos WHERE chasis IS NOT NULL
      GROUP BY chasis
      HAVING (count(*) > 1 OR bool_or(chasis_ambiguo))
        AND bool_or(marca IN ('HORSCH', 'CLAAS'))
    ), historico AS (
      SELECT chasis, max(modelo) AS modelo, count(*) AS cantidad,
        jsonb_agg(jsonb_build_object('fila', fila, 'controles', controles) ORDER BY fila) AS registros
      FROM public.servicios_controles_historico GROUP BY chasis
    ), equipos AS (
      SELECT a.*, true AS habilitada, false AS conflicto FROM public.servicios_maquinas_arribadas a
      UNION ALL
      SELECT c.*, false, true FROM conflictos c
      UNION ALL
      SELECT h.chasis, 'HORSCH', h.modelo, NULL::date, false, false
      FROM historico h WHERE NOT EXISTS (
        SELECT 1 FROM public.servicios_maquinas_arribadas a WHERE a.chasis = h.chasis
      ) AND NOT EXISTS (SELECT 1 FROM conflictos c WHERE c.chasis = h.chasis)
    )
    SELECT jsonb_agg(to_jsonb(m) || jsonb_build_object(
      'situacion_chasis', CASE
        WHEN m.conflicto THEN NULL
        WHEN EXISTS (
          SELECT 1 FROM public.parque_maquinas p
          WHERE p.activo AND public.normalizar_chasis_notificacion(p.serie) = m.chasis
        ) THEN 'parque'
        WHEN EXISTS (
          SELECT 1 FROM public.maquinaria_unidades_operacion u
          JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
          JOIN public.maquinaria_operaciones o ON o.id = l.operacion_id
          WHERE public.normalizar_chasis_notificacion(u.chasis) = m.chasis
            AND nullif(btrim(o.np_numero), '') IS NOT NULL
            AND o.estado NOT IN ('CANCELADA', 'CERRADA')
            AND u.estado NOT IN ('CANCELADA', 'EN_PARQUE', 'TRANSFERIDA')
        ) THEN 'pedido'
        WHEN EXISTS (
          SELECT 1 FROM public.parque_stock_maquinas s
          WHERE s.saldo_actual > 0 AND public.normalizar_chasis_notificacion(s.chasis) = m.chasis
        ) THEN 'stock'
      END,
      'historico', CASE WHEN h.cantidad > 1 THEN h.registros ELSE '[]'::jsonb END,
      'controles', coalesce(CASE WHEN h.cantidad = 1 THEN h.registros->0->'controles' END, '{}'::jsonb)
        || coalesce((
          SELECT jsonb_object_agg(c.etapa, to_jsonb(c) - 'actualizado_por')
          FROM public.servicios_controles_maquinas c WHERE c.chasis = m.chasis
        ), '{}'::jsonb)
    ) ORDER BY m.ata DESC NULLS LAST, m.chasis)
    FROM equipos m LEFT JOIN historico h ON h.chasis = m.chasis AND (m.marca = 'HORSCH' OR m.conflicto)
  ), '[]'::jsonb);
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
