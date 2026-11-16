BEGIN;

INSERT INTO public.app_secciones (id, modulo_id, nombre, orden, activo)
VALUES ('servicios.controles_maquinas', 'servicios', 'Controles de máquinas', 45, true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.servicios_controles_maquinas (
  chasis text NOT NULL,
  etapa text NOT NULL CHECK (etapa IN ('recibimiento', 'preentrega', 'entrega_tecnica')),
  finalizado date,
  informado date,
  situacion text CHECK (situacion IN ('Finalizado', 'A cobrar', 'Cobrado')),
  os_numero text,
  actualizado timestamptz NOT NULL DEFAULT now(),
  actualizado_por uuid,
  PRIMARY KEY (chasis, etapa)
);
ALTER TABLE public.servicios_controles_maquinas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.servicios_controles_maquinas FROM PUBLIC, anon, authenticated;

CREATE TABLE public.servicios_controles_historico (
  fila integer PRIMARY KEY,
  chasis text NOT NULL,
  modelo text,
  datos jsonb NOT NULL,
  controles jsonb NOT NULL
);
ALTER TABLE public.servicios_controles_historico ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.servicios_controles_historico FROM PUBLIC, anon, authenticated;

CREATE VIEW public.servicios_maquinas_arribadas AS
WITH unidades AS (
  SELECT public.normalizar_chasis_notificacion(u.chasis) AS chasis,
    upper(btrim(u.marca)) AS marca, u.modelo, u.ata,
    u.chasis_ambiguo, u.stock_fisico_confirmado, u.parque_confirmado
  FROM public.maquinaria_importacion_unidades_operativas u
  WHERE u.activa AND coalesce(u.estado_fuente, '') NOT ILIKE '%cancel%'
)
SELECT chasis, min(marca) AS marca, min(modelo) AS modelo, min(ata) AS ata
FROM unidades
WHERE chasis IS NOT NULL
GROUP BY chasis
HAVING count(*) = 1 AND min(marca) IN ('CLAAS', 'HORSCH')
  AND bool_and(NOT chasis_ambiguo)
  AND bool_or(ata <= (now() AT TIME ZONE 'America/Asuncion')::date
    OR stock_fisico_confirmado OR parque_confirmado);

REVOKE ALL ON public.servicios_maquinas_arribadas FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.servicios_controles_listar()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(), 'servicios.controles_maquinas') THEN
    RAISE EXCEPTION 'Sin acceso a Controles de máquinas' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(to_jsonb(m) || jsonb_build_object('controles',
      coalesce(h.controles, '{}'::jsonb) || coalesce((
      SELECT jsonb_object_agg(c.etapa, to_jsonb(c) - 'actualizado_por')
      FROM public.servicios_controles_maquinas c WHERE c.chasis = m.chasis
    ), '{}'::jsonb)) ORDER BY m.ata DESC NULLS LAST, m.chasis)
    FROM (
      SELECT a.*, true AS habilitada FROM public.servicios_maquinas_arribadas a
      UNION ALL
      SELECT x.chasis, 'HORSCH', max(x.modelo), NULL::date, false
      FROM public.servicios_controles_historico x
      WHERE NOT EXISTS (SELECT 1 FROM public.servicios_maquinas_arribadas a WHERE a.chasis = x.chasis)
      GROUP BY x.chasis
    ) m
    LEFT JOIN (
      SELECT chasis, (jsonb_agg(controles)->0) AS controles
      FROM public.servicios_controles_historico
      GROUP BY chasis HAVING count(*) = 1
    ) h ON h.chasis = m.chasis AND m.marca = 'HORSCH'
  ), '[]'::jsonb);
END;
$$;

CREATE FUNCTION public.servicios_controles_os(p_chasis text)
RETURNS TABLE (numero text, responsable text, estado text, problema text, tecnicos text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(), 'servicios.controles_maquinas') THEN
    RAISE EXCEPTION 'Sin acceso a Controles de máquinas' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT o.os_numero, o.responsable, o.situacion_os, o.problema, ARRAY(
    SELECT DISTINCT j.tecnico_nombre FROM public.comisiones_jornadas j
    WHERE j.os_numero = o.os_numero AND j.vigente AND j.estado_validacion <> 'INVALIDA'
      AND nullif(btrim(j.tecnico_nombre), '') IS NOT NULL
    ORDER BY j.tecnico_nombre
  )
  FROM public.ordenes_servicio_importadas o
  JOIN public.servicios_maquinas_arribadas m
    ON m.chasis = public.normalizar_chasis_notificacion(o.nro_chasis)
  WHERE m.chasis = p_chasis ORDER BY o.fecha_abierta_os DESC NULLS LAST, o.os_numero;
END;
$$;

CREATE FUNCTION public.servicios_controles_guardar(
  p_chasis text, p_etapa text, p_finalizado date, p_informado date,
  p_situacion text, p_os text, p_version timestamptz
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL OR NOT public.has_section_access(v_user, 'servicios.controles_maquinas')
    OR NOT (public.has_role(v_user, 'admin') OR public.has_role(v_user, 'superadmin')
      OR public.has_role(v_user, 'jefatura') OR public.has_role(v_user, 'gerencia')) THEN
    RAISE EXCEPTION 'Sin permiso para editar controles' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.servicios_maquinas_arribadas WHERE chasis = p_chasis) THEN
    RAISE EXCEPTION 'El equipo no está habilitado';
  END IF;
  IF p_os IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.servicios_controles_os(p_chasis) WHERE numero = p_os
  ) THEN
    RAISE EXCEPTION 'La OS no corresponde al equipo';
  END IF;
  IF p_version IS NULL THEN
    INSERT INTO public.servicios_controles_maquinas
      (chasis, etapa, finalizado, informado, situacion, os_numero, actualizado_por)
    VALUES (p_chasis, p_etapa, p_finalizado, p_informado, p_situacion, p_os, v_user)
    ON CONFLICT DO NOTHING;
  ELSE
    UPDATE public.servicios_controles_maquinas SET finalizado = p_finalizado,
      informado = p_informado, situacion = p_situacion, os_numero = p_os,
      actualizado = clock_timestamp(), actualizado_por = v_user
    WHERE chasis = p_chasis AND etapa = p_etapa AND actualizado = p_version;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'El control cambió. Volvé a abrirlo para editarlo.'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.servicios_controles_listar(), public.servicios_controles_os(text),
  public.servicios_controles_guardar(text,text,date,date,text,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.servicios_controles_listar(), public.servicios_controles_os(text),
  public.servicios_controles_guardar(text,text,date,date,text,text,timestamptz) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
