-- Mantiene actualizado el puente entre codigos internos del sistema anterior
-- y el maestro vigente. Las coincidencias unicas se confirman sin depender de
-- la marca; las multiples quedan pendientes y pueden resolverse manualmente.

CREATE TABLE IF NOT EXISTS public.repuestos_legacy_vinculos_manuales (
  codigo_legacy_norm text PRIMARY KEY,
  codigo_legacy text NOT NULL,
  producto_codigo text NOT NULL REFERENCES public.productos(codigo_interno) ON DELETE CASCADE,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.repuestos_legacy_vinculos_manuales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS repuestos_legacy_vinculos_manuales_select
  ON public.repuestos_legacy_vinculos_manuales;
CREATE POLICY repuestos_legacy_vinculos_manuales_select
ON public.repuestos_legacy_vinculos_manuales
FOR SELECT TO authenticated
USING (public.has_module_access(auth.uid(), 'repuestos'));

REVOKE ALL ON TABLE public.repuestos_legacy_vinculos_manuales FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.repuestos_legacy_vinculos_manuales TO authenticated;

CREATE OR REPLACE FUNCTION public.repuestos_reconciliar_maestro_legacy_actual()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '60s'
AS $$
DECLARE
  v_carga_id uuid;
  v_filas integer := 0;
  v_automaticas integer := 0;
  v_manuales integer := 0;
  v_ambiguas integer := 0;
  v_sin_coincidencia integer := 0;
  v_lineas_actualizadas integer := 0;
BEGIN
  IF auth.uid() IS NULL OR (
    NOT public.has_module_access(auth.uid(), 'repuestos')
    OR NOT (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
      OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
    )
  ) THEN
    RAISE EXCEPTION 'No tenes permiso para reconciliar el historial de repuestos'
      USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_carga_id
  FROM public.repuestos_maestro_legacy_cargas
  WHERE activo AND estado = 'COMPLETADO'
  ORDER BY completado_en DESC NULLS LAST
  LIMIT 1;

  IF v_carga_id IS NULL THEN
    RETURN jsonb_build_object(
      'cargado', false,
      'filas', 0,
      'automaticas', 0,
      'manuales', 0,
      'ambiguas', 0,
      'sin_coincidencia', 0,
      'lineas_actualizadas', 0
    );
  END IF;

  CREATE TEMP TABLE tmp_reconciliar_productos ON COMMIT DROP AS
  SELECT
    p.codigo_interno,
    public.normalizar_codigo_repuesto_flexible(p.codigo_fabricante) AS fabricante_norm,
    public.normalizar_texto_repuesto(p.descripcion) AS descripcion_norm
  FROM public.productos p
  WHERE p.activo
    AND p.codigo_interno ILIKE 'REP%';

  CREATE INDEX tmp_reconciliar_productos_fabricante_idx
    ON tmp_reconciliar_productos(fabricante_norm)
    WHERE fabricante_norm IS NOT NULL;
  CREATE INDEX tmp_reconciliar_productos_descripcion_idx
    ON tmp_reconciliar_productos(descripcion_norm)
    WHERE descripcion_norm IS NOT NULL;

  CREATE TEMP TABLE tmp_reconciliar_candidatos (
    codigo_legacy_norm text NOT NULL,
    producto_codigo text NOT NULL,
    prioridad integer NOT NULL,
    metodo text NOT NULL
  ) ON COMMIT DROP;

  -- Una decision manual siempre prevalece en posteriores actualizaciones.
  INSERT INTO tmp_reconciliar_candidatos
  SELECT m.codigo_legacy_norm, p.codigo_interno, 0, 'CODIGO_ANTERIOR_MANUAL'
  FROM public.repuestos_maestro_legacy m
  JOIN public.repuestos_legacy_vinculos_manuales vm
    ON vm.codigo_legacy_norm = m.codigo_legacy_norm
  JOIN tmp_reconciliar_productos p
    ON p.codigo_interno = vm.producto_codigo
  WHERE m.carga_id = v_carga_id;

  -- La combinacion fabricante + descripcion es la coincidencia automatica
  -- mas fuerte y no necesita que ambos productos tengan una marca asignada.
  INSERT INTO tmp_reconciliar_candidatos
  SELECT DISTINCT m.codigo_legacy_norm, p.codigo_interno, 1, 'FABRICANTE_Y_DESCRIPCION_UNICOS'
  FROM public.repuestos_maestro_legacy m
  JOIN tmp_reconciliar_productos p
    ON p.fabricante_norm = m.codigo_fabricante_norm
   AND p.descripcion_norm = public.normalizar_texto_repuesto(m.descripcion)
  WHERE m.carga_id = v_carga_id
    AND m.codigo_fabricante_norm IS NOT NULL
    AND p.descripcion_norm IS NOT NULL;

  INSERT INTO tmp_reconciliar_candidatos
  SELECT DISTINCT m.codigo_legacy_norm, p.codigo_interno, 2, 'FABRICANTE_EXACTO_UNICO'
  FROM public.repuestos_maestro_legacy m
  JOIN tmp_reconciliar_productos p
    ON p.fabricante_norm = m.codigo_fabricante_norm
  WHERE m.carga_id = v_carga_id
    AND m.codigo_fabricante_norm IS NOT NULL;

  -- Se usa la descripcion completa solo cuando el mejor nivel termina en un
  -- unico producto. Nunca se decide por similitud parcial o fuzzy.
  INSERT INTO tmp_reconciliar_candidatos
  SELECT DISTINCT m.codigo_legacy_norm, p.codigo_interno, 3, 'DESCRIPCION_EXACTA_UNICA'
  FROM public.repuestos_maestro_legacy m
  JOIN tmp_reconciliar_productos p
    ON p.descripcion_norm = public.normalizar_texto_repuesto(m.descripcion)
  WHERE m.carga_id = v_carga_id
    AND p.descripcion_norm IS NOT NULL;

  CREATE INDEX tmp_reconciliar_candidatos_codigo_idx
    ON tmp_reconciliar_candidatos(codigo_legacy_norm, prioridad, producto_codigo);

  CREATE TEMP TABLE tmp_reconciliar_resolucion ON COMMIT DROP AS
  WITH mejor AS (
    SELECT codigo_legacy_norm, min(prioridad) AS prioridad
    FROM tmp_reconciliar_candidatos
    GROUP BY codigo_legacy_norm
  )
  SELECT
    m.codigo_legacy_norm,
    b.prioridad,
    min(c.metodo) AS metodo,
    array_agg(DISTINCT c.producto_codigo ORDER BY c.producto_codigo)
      FILTER (WHERE c.producto_codigo IS NOT NULL) AS candidatos,
    count(DISTINCT c.producto_codigo)::integer AS cantidad
  FROM public.repuestos_maestro_legacy m
  LEFT JOIN mejor b ON b.codigo_legacy_norm = m.codigo_legacy_norm
  LEFT JOIN tmp_reconciliar_candidatos c
    ON c.codigo_legacy_norm = m.codigo_legacy_norm
   AND c.prioridad = b.prioridad
  WHERE m.carga_id = v_carga_id
  GROUP BY m.codigo_legacy_norm, b.prioridad;

  UPDATE public.repuestos_maestro_legacy m
  SET
    producto_codigo = CASE WHEN r.cantidad = 1 THEN r.candidatos[1] ELSE NULL END,
    estado_vinculo = CASE
      WHEN r.cantidad = 1 THEN 'CONFIRMADA'
      WHEN r.cantidad > 1 THEN 'PENDIENTE'
      ELSE 'SIN_COINCIDENCIA'
    END,
    metodo_vinculo = CASE WHEN r.cantidad = 1 THEN r.metodo ELSE NULL END,
    candidatos = coalesce(r.candidatos, '{}'::text[]),
    actualizado_en = now()
  FROM tmp_reconciliar_resolucion r
  WHERE m.carga_id = v_carga_id
    AND m.codigo_legacy_norm = r.codigo_legacy_norm;

  -- Actualiza todas las lineas historicas, no solo el ejemplo consultado. Una
  -- ambiguedad elimina cualquier asignacion canonica previa para no atribuir
  -- consumo al producto incorrecto.
  UPDATE public.repuestos_ventas_vinculacion v
  SET
    producto_codigo = CASE
      WHEN m.estado_vinculo = 'CONFIRMADA' THEN m.producto_codigo
      ELSE NULL
    END,
    estado_vinculo = CASE
      WHEN m.estado_vinculo = 'CONFIRMADA' THEN 'CONFIRMADA'
      WHEN cardinality(m.candidatos) > 1 THEN 'AMBIGUA'
      ELSE 'SIN_COINCIDENCIA'
    END,
    metodo_vinculo = m.metodo_vinculo,
    prioridad = CASE
      WHEN m.metodo_vinculo = 'CODIGO_ANTERIOR_MANUAL' THEN 0
      WHEN m.estado_vinculo = 'CONFIRMADA' THEN 1
      ELSE NULL
    END,
    confianza = CASE
      WHEN m.metodo_vinculo = 'CODIGO_ANTERIOR_MANUAL' THEN 1
      WHEN m.estado_vinculo = 'CONFIRMADA' THEN 0.98
      ELSE 0
    END,
    candidatos = m.candidatos,
    cantidad_candidatos = cardinality(m.candidatos),
    actualizado_en = now()
  FROM public.facturacion_lineas_importadas f,
       public.repuestos_maestro_legacy m
  WHERE v.linea_id = f.id
    AND f.origen_sistema = 'legacy_historico_detallado'
    AND m.carga_id = v_carga_id
    AND m.codigo_legacy_norm = public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia);

  GET DIAGNOSTICS v_lineas_actualizadas = ROW_COUNT;

  SELECT
    count(*)::integer,
    count(*) FILTER (
      WHERE estado_vinculo = 'CONFIRMADA'
        AND metodo_vinculo = 'CODIGO_ANTERIOR_MANUAL'
    )::integer,
    count(*) FILTER (
      WHERE estado_vinculo = 'CONFIRMADA'
        AND metodo_vinculo <> 'CODIGO_ANTERIOR_MANUAL'
    )::integer,
    count(*) FILTER (
      WHERE estado_vinculo = 'PENDIENTE' AND cardinality(candidatos) > 1
    )::integer,
    count(*) FILTER (WHERE estado_vinculo = 'SIN_COINCIDENCIA')::integer
  INTO v_filas, v_manuales, v_automaticas, v_ambiguas, v_sin_coincidencia
  FROM public.repuestos_maestro_legacy
  WHERE carga_id = v_carga_id;

  UPDATE public.repuestos_maestro_legacy_cargas
  SET
    filas = v_filas,
    vinculadas = v_automaticas + v_manuales,
    canonicas = 0,
    sin_coincidencia = v_sin_coincidencia
  WHERE id = v_carga_id;

  RETURN jsonb_build_object(
    'cargado', true,
    'filas', v_filas,
    'automaticas', v_automaticas,
    'manuales', v_manuales,
    'ambiguas', v_ambiguas,
    'sin_coincidencia', v_sin_coincidencia,
    'lineas_actualizadas', v_lineas_actualizadas
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.repuestos_vincular_codigo_legacy(
  p_producto_codigo text,
  p_codigo_legacy text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '25s'
AS $$
DECLARE
  v_carga_id uuid;
  v_codigo_legacy_norm text;
  v_codigo_legacy text;
  v_descripcion text;
  v_lineas integer := 0;
BEGIN
  IF auth.uid() IS NULL OR (
    NOT public.has_module_access(auth.uid(), 'repuestos')
    OR NOT (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
      OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
    )
  ) THEN
    RAISE EXCEPTION 'No tenes permiso para vincular codigos anteriores'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.productos p
    WHERE p.codigo_interno = trim(p_producto_codigo)
      AND p.activo
      AND p.codigo_interno ILIKE 'REP%'
  ) THEN
    RAISE EXCEPTION 'El repuesto actual % no existe o no esta activo', p_producto_codigo;
  END IF;

  v_codigo_legacy_norm := public.normalizar_codigo_repuesto_flexible(p_codigo_legacy);
  IF v_codigo_legacy_norm IS NULL THEN
    RAISE EXCEPTION 'Ingresa un codigo interno anterior valido';
  END IF;

  SELECT id INTO v_carga_id
  FROM public.repuestos_maestro_legacy_cargas
  WHERE activo AND estado = 'COMPLETADO'
  ORDER BY completado_en DESC NULLS LAST
  LIMIT 1;

  SELECT m.codigo_legacy, m.descripcion
  INTO v_codigo_legacy, v_descripcion
  FROM public.repuestos_maestro_legacy m
  WHERE m.carga_id = v_carga_id
    AND m.codigo_legacy_norm = v_codigo_legacy_norm
  LIMIT 1;

  IF v_codigo_legacy IS NULL THEN
    RAISE EXCEPTION 'El codigo anterior % no existe en el maestro del sistema anterior', p_codigo_legacy;
  END IF;

  INSERT INTO public.repuestos_legacy_vinculos_manuales(
    codigo_legacy_norm, codigo_legacy, producto_codigo, actualizado_por
  ) VALUES (
    v_codigo_legacy_norm, v_codigo_legacy, trim(p_producto_codigo), auth.uid()
  )
  ON CONFLICT (codigo_legacy_norm) DO UPDATE SET
    codigo_legacy = EXCLUDED.codigo_legacy,
    producto_codigo = EXCLUDED.producto_codigo,
    actualizado_en = now(),
    actualizado_por = EXCLUDED.actualizado_por;

  UPDATE public.repuestos_maestro_legacy
  SET
    producto_codigo = trim(p_producto_codigo),
    estado_vinculo = 'CONFIRMADA',
    metodo_vinculo = 'CODIGO_ANTERIOR_MANUAL',
    candidatos = ARRAY[trim(p_producto_codigo)],
    actualizado_en = now()
  WHERE carga_id = v_carga_id
    AND codigo_legacy_norm = v_codigo_legacy_norm;

  UPDATE public.repuestos_ventas_vinculacion v
  SET
    producto_codigo = trim(p_producto_codigo),
    estado_vinculo = 'CONFIRMADA',
    metodo_vinculo = 'CODIGO_ANTERIOR_MANUAL',
    prioridad = 0,
    confianza = 1,
    candidatos = ARRAY[trim(p_producto_codigo)],
    cantidad_candidatos = 1,
    actualizado_en = now()
  FROM public.facturacion_lineas_importadas f
  WHERE v.linea_id = f.id
    AND f.origen_sistema = 'legacy_historico_detallado'
    AND public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia) = v_codigo_legacy_norm;

  GET DIAGNOSTICS v_lineas = ROW_COUNT;

  UPDATE public.repuestos_maestro_legacy_cargas c
  SET
    vinculadas = stats.vinculadas,
    canonicas = 0,
    sin_coincidencia = stats.sin_coincidencia
  FROM (
    SELECT
      count(*) FILTER (WHERE estado_vinculo = 'CONFIRMADA')::integer AS vinculadas,
      count(*) FILTER (WHERE estado_vinculo = 'SIN_COINCIDENCIA')::integer AS sin_coincidencia
    FROM public.repuestos_maestro_legacy
    WHERE carga_id = v_carga_id
  ) stats
  WHERE c.id = v_carga_id;

  RETURN jsonb_build_object(
    'producto_codigo', trim(p_producto_codigo),
    'codigo_legacy', v_codigo_legacy,
    'descripcion_legacy', v_descripcion,
    'lineas_vinculadas', v_lineas
  );
END;
$$;

REVOKE ALL ON FUNCTION public.repuestos_reconciliar_maestro_legacy_actual() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.repuestos_vincular_codigo_legacy(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repuestos_reconciliar_maestro_legacy_actual() TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_vincular_codigo_legacy(text,text) TO authenticated;

NOTIFY pgrst, 'reload schema';
