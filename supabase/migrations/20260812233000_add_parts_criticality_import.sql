-- Importacion masiva de criticidad desde los libros de segmentacion.
-- Vincula primero por codigo interno y luego por codigo de fabricante.

CREATE OR REPLACE FUNCTION public.repuestos_importar_criticidades(
  p_marca text,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_resultado jsonb;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_module_access(auth.uid(), 'repuestos')
     OR NOT (
       public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
     ) THEN
    RAISE EXCEPTION 'No tenes permiso para importar criticidades' USING ERRCODE = '42501';
  END IF;

  IF upper(trim(p_marca)) NOT IN ('CLAAS', 'HORSCH') THEN
    RAISE EXCEPTION 'Marca invalida';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Los items deben enviarse como un arreglo JSON';
  END IF;

  WITH
  entradas AS MATERIALIZED (
    SELECT
      ordinality::integer AS fila,
      NULLIF(trim(item->>'codigo_interno'), '') AS codigo_interno,
      NULLIF(trim(item->>'codigo_fabricante'), '') AS codigo_fabricante,
      CASE upper(trim(coalesce(item->>'criticidad', '')))
        WHEN 'V' THEN 'V'
        WHEN 'VITAL' THEN 'V'
        WHEN 'E' THEN 'E'
        WHEN 'ESENCIAL' THEN 'E'
        WHEN 'D' THEN 'D'
        WHEN 'DESEABLE' THEN 'D'
        ELSE NULL
      END AS criticidad
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS source(item, ordinality)
  ),
  entradas_validas AS MATERIALIZED (
    SELECT
      e.*,
      public.normalizar_codigo_repuesto_flexible(e.codigo_interno) AS codigo_interno_norm,
      public.normalizar_codigo_repuesto_flexible(e.codigo_fabricante) AS codigo_fabricante_norm,
      NULLIF(regexp_replace(
        public.normalizar_codigo_repuesto_flexible(e.codigo_interno),
        '^0+', '', 'g'
      ), '') AS codigo_interno_sin_ceros,
      NULLIF(regexp_replace(
        public.normalizar_codigo_repuesto_flexible(e.codigo_fabricante),
        '^0+', '', 'g'
      ), '') AS codigo_fabricante_sin_ceros
    FROM entradas e
    WHERE e.criticidad IS NOT NULL
      AND (e.codigo_interno IS NOT NULL OR e.codigo_fabricante IS NOT NULL)
  ),
  productos_marca AS MATERIALIZED (
    SELECT
      p.codigo_interno AS producto_codigo,
      public.normalizar_codigo_repuesto_flexible(p.codigo_interno) AS codigo_producto_norm,
      public.normalizar_codigo_repuesto_flexible(p.codigo_fabricante) AS fabricante_producto_norm,
      NULLIF(regexp_replace(
        public.normalizar_codigo_repuesto_flexible(p.codigo_interno),
        '^[A-Z]+0*', '', 'g'
      ), '') AS codigo_producto_sufijo,
      NULLIF(regexp_replace(
        public.normalizar_codigo_repuesto_flexible(p.codigo_fabricante),
        '^0+', '', 'g'
      ), '') AS fabricante_producto_sin_ceros
    FROM public.productos p
    WHERE p.activo
      AND p.marca::text = upper(trim(p_marca))
      AND p.codigo_interno ILIKE 'REP%'
  ),
  candidatos AS MATERIALIZED (
    SELECT e.fila, p.producto_codigo, e.criticidad, 1 AS prioridad
    FROM entradas_validas e
    JOIN productos_marca p ON p.codigo_producto_norm = e.codigo_interno_norm
    WHERE e.codigo_interno_norm IS NOT NULL

    UNION ALL

    SELECT e.fila, p.producto_codigo, e.criticidad, 2
    FROM entradas_validas e
    JOIN productos_marca p ON p.codigo_producto_sufijo = e.codigo_interno_sin_ceros
    WHERE e.codigo_interno_sin_ceros IS NOT NULL

    UNION ALL

    SELECT e.fila, p.producto_codigo, e.criticidad, 3
    FROM entradas_validas e
    JOIN productos_marca p ON p.fabricante_producto_norm = e.codigo_fabricante_norm
    WHERE e.codigo_fabricante_norm IS NOT NULL

    UNION ALL

    SELECT e.fila, p.producto_codigo, e.criticidad, 4
    FROM entradas_validas e
    JOIN productos_marca p ON p.fabricante_producto_sin_ceros = e.codigo_fabricante_sin_ceros
    WHERE e.codigo_fabricante_sin_ceros IS NOT NULL
  ),
  mejores AS MATERIALIZED (
    SELECT DISTINCT ON (fila, producto_codigo)
      fila, producto_codigo, criticidad, prioridad
    FROM candidatos
    ORDER BY fila, producto_codigo, prioridad
  ),
  diagnostico AS MATERIALIZED (
    SELECT fila, count(DISTINCT producto_codigo)::integer AS coincidencias
    FROM mejores
    GROUP BY fila
  ),
  asignaciones AS MATERIALIZED (
    SELECT DISTINCT ON (m.producto_codigo)
      m.producto_codigo, m.criticidad, m.fila
    FROM mejores m
    JOIN diagnostico d ON d.fila = m.fila AND d.coincidencias = 1
    ORDER BY m.producto_codigo, m.prioridad, m.fila DESC
  ),
  guardados AS (
    INSERT INTO public.repuestos_articulo_planificacion (
      producto_codigo, criticidad, origen, observaciones, actualizado_por
    )
    SELECT
      a.producto_codigo,
      a.criticidad,
      'ALEMANIA',
      'Criticidad importada desde libro de segmentacion',
      auth.uid()
    FROM asignaciones a
    ON CONFLICT (producto_codigo) DO UPDATE SET
      criticidad = EXCLUDED.criticidad,
      origen = coalesce(NULLIF(public.repuestos_articulo_planificacion.origen, ''), 'ALEMANIA'),
      observaciones = EXCLUDED.observaciones,
      actualizado_por = auth.uid(),
      actualizado_en = now()
    RETURNING producto_codigo
  )
  SELECT jsonb_build_object(
    'recibidos', (SELECT count(*) FROM entradas),
    'validos', (SELECT count(*) FROM entradas_validas),
    'aplicados', (SELECT count(*) FROM guardados),
    'sin_coincidencia', (
      SELECT count(*)
      FROM entradas_validas e
      LEFT JOIN diagnostico d ON d.fila = e.fila
      WHERE d.fila IS NULL
    ),
    'ambiguos', (SELECT count(*) FROM diagnostico WHERE coincidencias > 1)
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.repuestos_importar_criticidades(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repuestos_importar_criticidades(text, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
