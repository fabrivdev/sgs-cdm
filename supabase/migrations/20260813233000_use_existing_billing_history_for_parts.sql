-- La facturacion ya importada es la unica fuente operativa del motor.
-- Los libros de segmentacion quedan exclusivamente como control externo.

CREATE OR REPLACE FUNCTION public.es_linea_facturacion_repuesto(
  p_tipo public.tipo_facturacion,
  p_grupo_normalizado text,
  p_subgrupo_original text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT
    p_tipo = 'Repuesto'::public.tipo_facturacion
    OR coalesce(p_grupo_normalizado, '') ~* 'repuest|parts'
    OR coalesce(p_subgrupo_original, '') ~* 'repuest|parts';
$$;

-- Puente permanente entre el codigo interno del sistema anterior y el
-- producto vigente. Se carga una sola vez desde "Lista Mercadoria.xls".
CREATE TABLE IF NOT EXISTS public.repuestos_maestro_legacy_cargas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  archivo_nombre text NOT NULL,
  estado text NOT NULL DEFAULT 'PROCESANDO'
    CHECK (estado IN ('PROCESANDO', 'COMPLETADO', 'FALLIDO')),
  activo boolean NOT NULL DEFAULT false,
  filas integer NOT NULL DEFAULT 0,
  vinculadas integer NOT NULL DEFAULT 0,
  canonicas integer NOT NULL DEFAULT 0,
  sin_coincidencia integer NOT NULL DEFAULT 0,
  creado_en timestamptz NOT NULL DEFAULT now(),
  completado_en timestamptz,
  creado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS repuestos_maestro_legacy_carga_activa_idx
  ON public.repuestos_maestro_legacy_cargas(activo)
  WHERE activo;

CREATE TABLE IF NOT EXISTS public.repuestos_maestro_legacy (
  carga_id uuid NOT NULL REFERENCES public.repuestos_maestro_legacy_cargas(id) ON DELETE CASCADE,
  codigo_legacy text NOT NULL,
  codigo_legacy_norm text NOT NULL,
  codigo_fabricante text,
  codigo_fabricante_norm text,
  descripcion text NOT NULL,
  situacion text,
  tipo text,
  producto_codigo text REFERENCES public.productos(codigo_interno) ON DELETE SET NULL,
  estado_vinculo text NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado_vinculo IN ('PENDIENTE', 'CONFIRMADA', 'CONFIRMADA_CANONICA', 'SIN_COINCIDENCIA')),
  metodo_vinculo text,
  candidatos text[] NOT NULL DEFAULT '{}'::text[],
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (carga_id, codigo_legacy_norm)
);

CREATE INDEX IF NOT EXISTS repuestos_maestro_legacy_codigo_idx
  ON public.repuestos_maestro_legacy(codigo_legacy_norm);
CREATE INDEX IF NOT EXISTS repuestos_maestro_legacy_fabricante_idx
  ON public.repuestos_maestro_legacy(codigo_fabricante_norm)
  WHERE codigo_fabricante_norm IS NOT NULL;
CREATE INDEX IF NOT EXISTS repuestos_maestro_legacy_producto_idx
  ON public.repuestos_maestro_legacy(producto_codigo)
  WHERE producto_codigo IS NOT NULL;

ALTER TABLE public.repuestos_maestro_legacy_cargas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repuestos_maestro_legacy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS repuestos_maestro_legacy_cargas_select ON public.repuestos_maestro_legacy_cargas;
CREATE POLICY repuestos_maestro_legacy_cargas_select
ON public.repuestos_maestro_legacy_cargas FOR SELECT TO authenticated
USING (public.has_module_access(auth.uid(), 'repuestos'));

DROP POLICY IF EXISTS repuestos_maestro_legacy_select ON public.repuestos_maestro_legacy;
CREATE POLICY repuestos_maestro_legacy_select
ON public.repuestos_maestro_legacy FOR SELECT TO authenticated
USING (public.has_module_access(auth.uid(), 'repuestos'));

GRANT SELECT ON public.repuestos_maestro_legacy_cargas TO authenticated;
GRANT SELECT ON public.repuestos_maestro_legacy TO authenticated;

CREATE OR REPLACE FUNCTION public.repuestos_estado_maestro_legacy()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(
    (
      SELECT jsonb_build_object(
        'cargado', true,
        'archivo_nombre', archivo_nombre,
        'filas', filas,
        'vinculadas', vinculadas,
        'canonicas', canonicas,
        'sin_coincidencia', sin_coincidencia,
        'completado_en', completado_en
      )
      FROM public.repuestos_maestro_legacy_cargas
      WHERE activo AND estado = 'COMPLETADO'
      ORDER BY completado_en DESC
      LIMIT 1
    ),
    jsonb_build_object('cargado', false)
  );
$$;

CREATE OR REPLACE FUNCTION public.repuestos_iniciar_maestro_legacy(p_archivo_nombre text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede cargar el maestro anterior'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.repuestos_maestro_legacy_cargas
    WHERE estado = 'COMPLETADO'
  ) THEN
    RAISE EXCEPTION 'El maestro anterior ya fue cargado. Esta operacion se realiza una sola vez.';
  END IF;

  -- Un fallo de red o del navegador no debe bloquear un nuevo intento.
  -- Solo se cierran intentos anteriores del mismo usuario.
  UPDATE public.repuestos_maestro_legacy_cargas
  SET estado = 'FALLIDO'
  WHERE estado = 'PROCESANDO'
    AND creado_por IS NOT DISTINCT FROM auth.uid();

  IF EXISTS (
    SELECT 1 FROM public.repuestos_maestro_legacy_cargas
    WHERE estado = 'PROCESANDO'
  ) THEN
    RAISE EXCEPTION 'Ya existe una carga del maestro anterior en proceso';
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
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
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
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
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

-- Algunas cargas antiguas quedaron en facturacion aunque ya traian codigo y
-- cantidad. Se promueven una sola vez al detalle auditable. Las facturas que
-- ya tienen una linea detallada equivalente no se duplican.
INSERT INTO public.facturacion_lineas_importadas(
  importacion_id,
  origen_sistema,
  codigo_interno_factura,
  factura,
  entidad_nombre,
  fecha_factura,
  sucursal,
  subgrupo_original,
  grupo_normalizado,
  marca_normalizada,
  tipo_facturacion,
  tipo_tiempo,
  observacion,
  cod_mercaderia,
  cantidad,
  total_venta,
  moneda,
  raw_data
)
SELECT
  NULL::uuid,
  'legacy_facturacion_detalle',
  coalesce(nullif(to_jsonb(f) ->> 'codigo_interno_factura', ''), f.cod_factura),
  f.cod_factura,
  f.entidad_nombre,
  f.fecha::timestamptz,
  f.sucursal,
  f.grupo,
  coalesce(nullif(to_jsonb(f) ->> 'grupo_normalizado', ''), f.grupo),
  coalesce(
    CASE
      WHEN upper(nullif(to_jsonb(f) ->> 'marca_normalizada', '')) IN ('CLAAS', 'HORSCH', 'OTROS')
        THEN upper(to_jsonb(f) ->> 'marca_normalizada')::public.marca
      ELSE NULL
    END,
    CASE
      WHEN coalesce(f.grupo, '') ~* 'CLAAS' THEN 'CLAAS'::public.marca
      WHEN coalesce(f.grupo, '') ~* 'HORSCH' THEN 'HORSCH'::public.marca
      ELSE 'OTROS'::public.marca
    END
  ),
  f.tipo,
  CASE
    WHEN to_jsonb(f) ->> 'tipo_tiempo' IN ('Cliente', 'Garantia', 'Interno')
      THEN to_jsonb(f) ->> 'tipo_tiempo'
    ELSE 'Cliente'
  END,
  nullif(to_jsonb(f) ->> 'observacion', ''),
  nullif(to_jsonb(f) ->> 'cod_mercaderia', ''),
  coalesce(f.cantidad, 0),
  coalesce(f.total_venta, 0),
  nullif(to_jsonb(f) ->> 'moneda', ''),
  jsonb_build_object('facturacion_id', f.id, 'fuente', 'facturacion')
FROM public.facturacion f
WHERE NOT coalesce((to_jsonb(f) ->> 'excluido_de_reportes')::boolean, false)
  AND public.es_linea_facturacion_repuesto(
    f.tipo,
    nullif(to_jsonb(f) ->> 'grupo_normalizado', ''),
    f.grupo
  )
  AND nullif(trim(to_jsonb(f) ->> 'cod_mercaderia'), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.facturacion_lineas_importadas d
    WHERE coalesce(d.codigo_interno_factura, d.factura)
          = coalesce(nullif(to_jsonb(f) ->> 'codigo_interno_factura', ''), f.cod_factura)
      AND d.fecha_factura::date = f.fecha
      AND public.normalizar_codigo_repuesto_flexible(d.cod_mercaderia)
          = public.normalizar_codigo_repuesto_flexible(to_jsonb(f) ->> 'cod_mercaderia')
  )
ON CONFLICT (origen_sistema, linea_hash) DO NOTHING;

-- Si la migracion experimental de libros fue aplicada, se desactiva como
-- fuente para impedir cualquier doble conteo. No se elimina informacion.
DO $disable_external_history$
BEGIN
  IF to_regclass('public.repuestos_historial_legacy_lotes') IS NOT NULL THEN
    EXECUTE 'UPDATE public.repuestos_historial_legacy_lotes SET activo = false WHERE activo';
  END IF;
END;
$disable_external_history$;

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
  IF auth.uid() IS NOT NULL AND (
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

  -- Regla principal: el codigo interno facturado del sistema anterior se
  -- resuelve mediante el maestro legacy cargado una sola vez.
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

CREATE OR REPLACE FUNCTION public.repuestos_resumen_calidad_historial(p_marca text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH base AS (
    SELECT
      v.estado_vinculo,
      v.producto_codigo,
      v.fecha_efectiva AS fecha,
      coalesce(p.marca, v.marca_origen) AS marca
    FROM public.repuestos_ventas_vinculacion v
    LEFT JOIN public.productos p ON p.codigo_interno = v.producto_codigo
  ),
  filtrada AS (
    SELECT * FROM base
    WHERE p_marca IS NULL OR marca::text = upper(trim(p_marca))
  ),
  ultima AS (
    SELECT * FROM public.repuestos_historial_actualizaciones
    WHERE estado = 'COMPLETADA'
    ORDER BY completado_en DESC
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'preparado', EXISTS (SELECT 1 FROM ultima),
    'lineas_totales', count(*)::integer,
    'confirmadas', count(*) FILTER (WHERE estado_vinculo = 'CONFIRMADA')::integer,
    'ambiguas', count(*) FILTER (WHERE estado_vinculo = 'AMBIGUA')::integer,
    'sin_coincidencia', count(*) FILTER (WHERE estado_vinculo = 'SIN_COINCIDENCIA')::integer,
    'productos_confirmados', count(DISTINCT producto_codigo)
      FILTER (WHERE estado_vinculo = 'CONFIRMADA')::integer,
    'fecha_desde', min(fecha),
    'fecha_hasta', max(fecha),
    'actualizado_en', (SELECT completado_en FROM ultima)
  )
  FROM filtrada;
$$;

CREATE OR REPLACE FUNCTION public.repuestos_diagnostico_fuentes_historial()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'maestro_legacy', public.repuestos_estado_maestro_legacy(),
    'lineas_detalladas_totales', count(*)::integer,
    'lineas_repuestos_detectadas', count(*) FILTER (
      WHERE public.es_linea_facturacion_repuesto(
        tipo_facturacion, grupo_normalizado, subgrupo_original
      )
    )::integer,
    'lineas_repuestos_con_codigo', count(*) FILTER (
      WHERE public.es_linea_facturacion_repuesto(
        tipo_facturacion, grupo_normalizado, subgrupo_original
      )
      AND (
        nullif(trim(cod_mercaderia), '') IS NOT NULL
        OR nullif(trim(codigo_fabricante), '') IS NOT NULL
        OR public.extraer_codigo_repuesto_descripcion(mercaderia) IS NOT NULL
      )
    )::integer,
    'facturas_repuestos', count(DISTINCT coalesce(codigo_interno_factura, factura)) FILTER (
      WHERE public.es_linea_facturacion_repuesto(
        tipo_facturacion, grupo_normalizado, subgrupo_original
      )
    )::integer,
    'fecha_desde', min(fecha_factura) FILTER (
      WHERE public.es_linea_facturacion_repuesto(
        tipo_facturacion, grupo_normalizado, subgrupo_original
      )
    ),
    'fecha_hasta', max(fecha_factura) FILTER (
      WHERE public.es_linea_facturacion_repuesto(
        tipo_facturacion, grupo_normalizado, subgrupo_original
      )
    )
  )
  FROM public.facturacion_lineas_importadas;
$$;

REVOKE ALL ON FUNCTION public.es_linea_facturacion_repuesto(public.tipo_facturacion,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repuestos_estado_maestro_legacy() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repuestos_iniciar_maestro_legacy(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repuestos_importar_maestro_legacy_lote(uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repuestos_finalizar_maestro_legacy(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repuestos_refrescar_historial_unificado() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repuestos_diagnostico_fuentes_historial() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.es_linea_facturacion_repuesto(public.tipo_facturacion,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_estado_maestro_legacy() TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_iniciar_maestro_legacy(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_importar_maestro_legacy_lote(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_finalizar_maestro_legacy(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_refrescar_historial_unificado() TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_diagnostico_fuentes_historial() TO authenticated;

NOTIFY pgrst, 'reload schema';
