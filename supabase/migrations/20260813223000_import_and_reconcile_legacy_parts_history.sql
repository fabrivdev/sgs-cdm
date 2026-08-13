-- Recupera el historico detallado anterior al cambio de sistema desde los
-- libros de segmentacion. El XML vigente solo contiene el tramo nuevo, por lo
-- que no puede reproducir por si solo la demanda de los ultimos 12/24 meses.

CREATE TABLE IF NOT EXISTS public.repuestos_historial_legacy_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca public.marca NOT NULL,
  archivo_nombre text NOT NULL,
  estado text NOT NULL DEFAULT 'PROCESANDO'
    CHECK (estado IN ('PROCESANDO', 'COMPLETADO', 'FALLIDO')),
  activo boolean NOT NULL DEFAULT false,
  filas integer NOT NULL DEFAULT 0,
  confirmadas integer NOT NULL DEFAULT 0,
  pendientes_revision integer NOT NULL DEFAULT 0,
  creado_en timestamptz NOT NULL DEFAULT now(),
  completado_en timestamptz,
  creado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS repuestos_historial_legacy_lote_activo_idx
  ON public.repuestos_historial_legacy_lotes(marca)
  WHERE activo;

CREATE TABLE IF NOT EXISTS public.repuestos_ventas_historicas_legacy (
  lote_id uuid NOT NULL REFERENCES public.repuestos_historial_legacy_lotes(id) ON DELETE CASCADE,
  linea_clave text NOT NULL,
  marca public.marca NOT NULL,
  fecha date NOT NULL,
  documento text,
  codigo_legacy text NOT NULL,
  codigo_fabricante text,
  descripcion text NOT NULL,
  cantidad numeric NOT NULL DEFAULT 0,
  importe_usd numeric NOT NULL DEFAULT 0,
  producto_codigo text REFERENCES public.productos(codigo_interno) ON DELETE SET NULL,
  estado_vinculo text NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado_vinculo IN ('PENDIENTE', 'CONFIRMADA', 'PENDIENTE_REVISION')),
  metodo_vinculo text,
  candidatos text[] NOT NULL DEFAULT '{}'::text[],
  creado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lote_id, linea_clave)
);

CREATE INDEX IF NOT EXISTS repuestos_ventas_historicas_legacy_codigo_idx
  ON public.repuestos_ventas_historicas_legacy(lote_id, codigo_legacy);
CREATE INDEX IF NOT EXISTS repuestos_ventas_historicas_legacy_producto_idx
  ON public.repuestos_ventas_historicas_legacy(producto_codigo, fecha DESC);

CREATE TABLE IF NOT EXISTS public.repuestos_codigo_equivalencias (
  marca public.marca NOT NULL,
  codigo_legacy text NOT NULL,
  codigo_fabricante_legacy text NOT NULL DEFAULT '',
  producto_codigo text NOT NULL REFERENCES public.productos(codigo_interno) ON DELETE CASCADE,
  metodo text NOT NULL,
  confianza numeric NOT NULL DEFAULT 0 CHECK (confianza BETWEEN 0 AND 1),
  requiere_revision boolean NOT NULL DEFAULT false,
  manual boolean NOT NULL DEFAULT false,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (marca, codigo_legacy, codigo_fabricante_legacy)
);

ALTER TABLE public.repuestos_historial_legacy_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repuestos_ventas_historicas_legacy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repuestos_codigo_equivalencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS repuestos_historial_legacy_lotes_select ON public.repuestos_historial_legacy_lotes;
CREATE POLICY repuestos_historial_legacy_lotes_select
ON public.repuestos_historial_legacy_lotes FOR SELECT TO authenticated
USING (public.has_module_access(auth.uid(), 'repuestos'));

DROP POLICY IF EXISTS repuestos_ventas_historicas_legacy_select ON public.repuestos_ventas_historicas_legacy;
CREATE POLICY repuestos_ventas_historicas_legacy_select
ON public.repuestos_ventas_historicas_legacy FOR SELECT TO authenticated
USING (public.has_module_access(auth.uid(), 'repuestos'));

DROP POLICY IF EXISTS repuestos_codigo_equivalencias_select ON public.repuestos_codigo_equivalencias;
CREATE POLICY repuestos_codigo_equivalencias_select
ON public.repuestos_codigo_equivalencias FOR SELECT TO authenticated
USING (public.has_module_access(auth.uid(), 'repuestos'));

GRANT SELECT ON public.repuestos_historial_legacy_lotes TO authenticated;
GRANT SELECT ON public.repuestos_ventas_historicas_legacy TO authenticated;
GRANT SELECT ON public.repuestos_codigo_equivalencias TO authenticated;

CREATE OR REPLACE FUNCTION public.normalizar_texto_repuesto(p_texto text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(
    regexp_replace(
      translate(
        upper(trim(coalesce(p_texto, ''))),
        'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
        'AAAAAEEEEIIIIOOOOOUUUUNC'
      ),
      '[^A-Z0-9]+',
      ' ',
      'g'
    ),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.repuestos_iniciar_importacion_historial_legacy(
  p_marca text,
  p_archivo_nombre text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lote uuid;
  v_marca public.marca := upper(trim(p_marca))::public.marca;
BEGIN
  IF auth.uid() IS NOT NULL AND (
    NOT public.has_module_access(auth.uid(), 'repuestos')
    OR NOT (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
    )
  ) THEN
    RAISE EXCEPTION 'No tenes permiso para importar el historial de repuestos'
      USING ERRCODE = '42501';
  END IF;

  IF v_marca NOT IN ('CLAAS'::public.marca, 'HORSCH'::public.marca) THEN
    RAISE EXCEPTION 'Marca no valida para el historial: %', p_marca;
  END IF;

  INSERT INTO public.repuestos_historial_legacy_lotes(
    marca, archivo_nombre, creado_por
  ) VALUES (
    v_marca, coalesce(nullif(trim(p_archivo_nombre), ''), 'historico.xlsx'), auth.uid()
  ) RETURNING id INTO v_lote;

  RETURN v_lote;
END;
$$;

CREATE OR REPLACE FUNCTION public.repuestos_importar_historial_legacy_lote(
  p_lote_id uuid,
  p_filas jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_marca public.marca;
  v_insertadas integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND (
    NOT public.has_module_access(auth.uid(), 'repuestos')
    OR NOT (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
    )
  ) THEN
    RAISE EXCEPTION 'No tenes permiso para importar el historial de repuestos'
      USING ERRCODE = '42501';
  END IF;

  SELECT marca INTO v_marca
  FROM public.repuestos_historial_legacy_lotes
  WHERE id = p_lote_id AND estado = 'PROCESANDO';

  IF v_marca IS NULL THEN
    RAISE EXCEPTION 'El lote no existe o ya fue cerrado';
  END IF;

  INSERT INTO public.repuestos_ventas_historicas_legacy(
    lote_id, linea_clave, marca, fecha, documento, codigo_legacy,
    codigo_fabricante, descripcion, cantidad, importe_usd
  )
  SELECT
    p_lote_id,
    trim(x.linea_clave),
    v_marca,
    x.fecha,
    nullif(trim(x.documento), ''),
    trim(x.codigo_legacy),
    nullif(trim(x.codigo_fabricante), ''),
    coalesce(nullif(trim(x.descripcion), ''), 'Producto historico ' || trim(x.codigo_legacy)),
    coalesce(x.cantidad, 0),
    coalesce(x.importe_usd, 0)
  FROM jsonb_to_recordset(coalesce(p_filas, '[]'::jsonb)) AS x(
    linea_clave text,
    fecha date,
    documento text,
    codigo_legacy text,
    codigo_fabricante text,
    descripcion text,
    cantidad numeric,
    importe_usd numeric
  )
  WHERE nullif(trim(x.linea_clave), '') IS NOT NULL
    AND nullif(trim(x.codigo_legacy), '') IS NOT NULL
  ON CONFLICT (lote_id, linea_clave) DO UPDATE SET
    fecha = EXCLUDED.fecha,
    documento = EXCLUDED.documento,
    codigo_legacy = EXCLUDED.codigo_legacy,
    codigo_fabricante = EXCLUDED.codigo_fabricante,
    descripcion = EXCLUDED.descripcion,
    cantidad = EXCLUDED.cantidad,
    importe_usd = EXCLUDED.importe_usd;

  GET DIAGNOSTICS v_insertadas = ROW_COUNT;
  RETURN v_insertadas;
END;
$$;

CREATE OR REPLACE FUNCTION public.repuestos_finalizar_importacion_historial_legacy(
  p_lote_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '180s'
AS $$
DECLARE
  v_marca public.marca;
  v_filas integer := 0;
  v_confirmadas integer := 0;
  v_revision integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND (
    NOT public.has_module_access(auth.uid(), 'repuestos')
    OR NOT (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
    )
  ) THEN
    RAISE EXCEPTION 'No tenes permiso para importar el historial de repuestos'
      USING ERRCODE = '42501';
  END IF;

  SELECT marca INTO v_marca
  FROM public.repuestos_historial_legacy_lotes
  WHERE id = p_lote_id AND estado = 'PROCESANDO';

  IF v_marca IS NULL THEN
    RAISE EXCEPTION 'El lote no existe o ya fue cerrado';
  END IF;

  CREATE TEMP TABLE tmp_legacy_claves ON COMMIT DROP AS
  SELECT
    min(h.codigo_legacy) AS codigo_legacy,
    coalesce(min(h.codigo_fabricante), '') AS codigo_fabricante,
    min(h.descripcion) AS descripcion,
    public.normalizar_codigo_repuesto_flexible(min(h.codigo_legacy)) AS legacy_norm,
    public.normalizar_codigo_repuesto_flexible(min(h.codigo_fabricante)) AS fabricante_norm,
    public.extraer_codigo_repuesto_descripcion(min(h.descripcion)) AS descripcion_codigo_norm,
    public.normalizar_texto_repuesto(min(h.descripcion)) AS descripcion_texto_norm
  FROM public.repuestos_ventas_historicas_legacy h
  WHERE h.lote_id = p_lote_id
  GROUP BY public.normalizar_codigo_repuesto_flexible(h.codigo_legacy);

  CREATE INDEX tmp_legacy_claves_codigo_idx ON tmp_legacy_claves(legacy_norm);

  CREATE TEMP TABLE tmp_legacy_productos ON COMMIT DROP AS
  SELECT
    p.codigo_interno,
    public.normalizar_codigo_repuesto_flexible(p.codigo_fabricante) AS fabricante_norm,
    public.extraer_codigo_repuesto_descripcion(p.descripcion) AS descripcion_codigo_norm,
    public.normalizar_texto_repuesto(p.descripcion) AS descripcion_texto_norm
  FROM public.productos p
  WHERE p.marca = v_marca
    AND p.activo
    AND p.codigo_interno ILIKE 'REP%';

  CREATE INDEX tmp_legacy_productos_fabricante_idx ON tmp_legacy_productos(fabricante_norm);
  CREATE INDEX tmp_legacy_productos_desc_codigo_idx ON tmp_legacy_productos(descripcion_codigo_norm);
  CREATE INDEX tmp_legacy_productos_desc_texto_idx ON tmp_legacy_productos(descripcion_texto_norm);

  CREATE TEMP TABLE tmp_legacy_candidatos(
    legacy_norm text NOT NULL,
    producto_codigo text NOT NULL,
    prioridad integer NOT NULL,
    metodo text NOT NULL
  ) ON COMMIT DROP;

  -- La combinacion fabricante + descripcion resuelve duplicados del maestro.
  INSERT INTO tmp_legacy_candidatos
  SELECT l.legacy_norm, p.codigo_interno, 1, 'FABRICANTE_Y_DESCRIPCION'
  FROM tmp_legacy_claves l
  JOIN tmp_legacy_productos p
    ON p.fabricante_norm = l.fabricante_norm
   AND p.descripcion_texto_norm = l.descripcion_texto_norm
  WHERE l.fabricante_norm IS NOT NULL AND l.descripcion_texto_norm IS NOT NULL;

  INSERT INTO tmp_legacy_candidatos
  SELECT l.legacy_norm, p.codigo_interno, 2, 'FABRICANTE_Y_CODIGO_DESCRIPCION'
  FROM tmp_legacy_claves l
  JOIN tmp_legacy_productos p
    ON p.fabricante_norm = l.fabricante_norm
   AND p.descripcion_codigo_norm = l.descripcion_codigo_norm
  WHERE l.fabricante_norm IS NOT NULL AND l.descripcion_codigo_norm IS NOT NULL;

  INSERT INTO tmp_legacy_candidatos
  SELECT l.legacy_norm, p.codigo_interno, 3, 'FABRICANTE'
  FROM tmp_legacy_claves l
  JOIN tmp_legacy_productos p ON p.fabricante_norm = l.fabricante_norm
  WHERE l.fabricante_norm IS NOT NULL;

  INSERT INTO tmp_legacy_candidatos
  SELECT l.legacy_norm, p.codigo_interno, 4, 'CODIGO_DESCRIPCION_A_FABRICANTE'
  FROM tmp_legacy_claves l
  JOIN tmp_legacy_productos p ON p.fabricante_norm = l.descripcion_codigo_norm
  WHERE l.descripcion_codigo_norm IS NOT NULL;

  INSERT INTO tmp_legacy_candidatos
  SELECT l.legacy_norm, p.codigo_interno, 5, 'DESCRIPCION_EXACTA'
  FROM tmp_legacy_claves l
  JOIN tmp_legacy_productos p ON p.descripcion_texto_norm = l.descripcion_texto_norm
  WHERE l.descripcion_texto_norm IS NOT NULL;

  INSERT INTO tmp_legacy_candidatos
  SELECT l.legacy_norm, p.codigo_interno, 6, 'CODIGO_DESCRIPCION'
  FROM tmp_legacy_claves l
  JOIN tmp_legacy_productos p ON p.descripcion_codigo_norm = l.descripcion_codigo_norm
  WHERE l.descripcion_codigo_norm IS NOT NULL;

  CREATE TEMP TABLE tmp_legacy_resolucion ON COMMIT DROP AS
  WITH mejor AS (
    SELECT legacy_norm, min(prioridad) AS prioridad
    FROM tmp_legacy_candidatos
    GROUP BY legacy_norm
  )
  SELECT
    c.legacy_norm,
    min(c.metodo) AS metodo,
    array_agg(DISTINCT c.producto_codigo ORDER BY c.producto_codigo) AS candidatos,
    count(DISTINCT c.producto_codigo)::integer AS cantidad_candidatos
  FROM tmp_legacy_candidatos c
  JOIN mejor m ON m.legacy_norm = c.legacy_norm AND m.prioridad = c.prioridad
  GROUP BY c.legacy_norm;

  -- Todo codigo sin resolucion unica conserva sus ventas en un producto
  -- historico inactivo. Queda visible para revision, pero nunca desaparece.
  INSERT INTO public.productos(
    codigo_interno, codigo_fabricante, descripcion, unidad, grupo, familia, marca, activo
  )
  SELECT
    'LEG' || substr(v_marca::text, 1, 3) || upper(substr(md5(v_marca::text || '|' || l.legacy_norm), 1, 12)),
    nullif(l.codigo_fabricante, ''),
    l.descripcion,
    'UN',
    'HISTORICO',
    NULL,
    v_marca,
    false
  FROM tmp_legacy_claves l
  LEFT JOIN tmp_legacy_resolucion r ON r.legacy_norm = l.legacy_norm
  WHERE coalesce(r.cantidad_candidatos, 0) <> 1
  ON CONFLICT (codigo_interno) DO UPDATE SET
    codigo_fabricante = EXCLUDED.codigo_fabricante,
    descripcion = EXCLUDED.descripcion,
    marca = EXCLUDED.marca;

  INSERT INTO public.repuestos_codigo_equivalencias(
    marca, codigo_legacy, codigo_fabricante_legacy, producto_codigo,
    metodo, confianza, requiere_revision, manual, actualizado_por
  )
  SELECT
    v_marca,
    l.legacy_norm,
    coalesce(l.fabricante_norm, ''),
    CASE
      WHEN r.cantidad_candidatos = 1 THEN r.candidatos[1]
      ELSE 'LEG' || substr(v_marca::text, 1, 3) || upper(substr(md5(v_marca::text || '|' || l.legacy_norm), 1, 12))
    END,
    CASE WHEN r.cantidad_candidatos = 1 THEN r.metodo ELSE 'PRODUCTO_HISTORICO_PENDIENTE' END,
    CASE WHEN r.cantidad_candidatos = 1 THEN 0.95 ELSE 0.30 END,
    coalesce(r.cantidad_candidatos, 0) <> 1,
    false,
    auth.uid()
  FROM tmp_legacy_claves l
  LEFT JOIN tmp_legacy_resolucion r ON r.legacy_norm = l.legacy_norm
  ON CONFLICT (marca, codigo_legacy, codigo_fabricante_legacy) DO UPDATE SET
    producto_codigo = CASE
      WHEN public.repuestos_codigo_equivalencias.manual
        THEN public.repuestos_codigo_equivalencias.producto_codigo
      ELSE EXCLUDED.producto_codigo
    END,
    metodo = CASE
      WHEN public.repuestos_codigo_equivalencias.manual
        THEN public.repuestos_codigo_equivalencias.metodo
      ELSE EXCLUDED.metodo
    END,
    confianza = CASE
      WHEN public.repuestos_codigo_equivalencias.manual
        THEN public.repuestos_codigo_equivalencias.confianza
      ELSE EXCLUDED.confianza
    END,
    requiere_revision = CASE
      WHEN public.repuestos_codigo_equivalencias.manual THEN false
      ELSE EXCLUDED.requiere_revision
    END,
    actualizado_en = now(),
    actualizado_por = EXCLUDED.actualizado_por;

  UPDATE public.repuestos_ventas_historicas_legacy h
  SET
    producto_codigo = e.producto_codigo,
    estado_vinculo = CASE WHEN e.requiere_revision THEN 'PENDIENTE_REVISION' ELSE 'CONFIRMADA' END,
    metodo_vinculo = e.metodo,
    candidatos = ARRAY[e.producto_codigo]
  FROM public.repuestos_codigo_equivalencias e
  WHERE h.lote_id = p_lote_id
    AND e.marca = h.marca
    AND e.codigo_legacy = public.normalizar_codigo_repuesto_flexible(h.codigo_legacy)
    AND e.codigo_fabricante_legacy = coalesce(
      public.normalizar_codigo_repuesto_flexible(h.codigo_fabricante), ''
    );

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE estado_vinculo = 'CONFIRMADA')::integer,
    count(*) FILTER (WHERE estado_vinculo = 'PENDIENTE_REVISION')::integer
  INTO v_filas, v_confirmadas, v_revision
  FROM public.repuestos_ventas_historicas_legacy
  WHERE lote_id = p_lote_id;

  UPDATE public.repuestos_historial_legacy_lotes
  SET activo = false
  WHERE marca = v_marca AND activo AND id <> p_lote_id;

  UPDATE public.repuestos_historial_legacy_lotes
  SET
    estado = 'COMPLETADO',
    activo = true,
    filas = v_filas,
    confirmadas = v_confirmadas,
    pendientes_revision = v_revision,
    completado_en = now()
  WHERE id = p_lote_id;

  -- Publica el historico importado inmediatamente. No obliga a reconstruir el
  -- tramo nuevo (la operacion que venia agotando el statement timeout).
  DELETE FROM public.repuestos_demanda_mensual
  WHERE mes < DATE '2026-07-01';

  INSERT INTO public.repuestos_demanda_mensual(
    producto_codigo, mes, unidades_netas, unidades_positivas,
    devoluciones, pedidos, importe_comparable
  )
  SELECT
    h.producto_codigo,
    date_trunc('month', h.fecha)::date,
    sum(h.cantidad)::numeric,
    sum(greatest(h.cantidad, 0))::numeric,
    sum(abs(least(h.cantidad, 0)))::numeric,
    count(DISTINCT coalesce(h.documento, h.linea_clave))::integer,
    sum(h.importe_usd)::numeric
  FROM public.repuestos_ventas_historicas_legacy h
  JOIN public.repuestos_historial_legacy_lotes l
    ON l.id = h.lote_id AND l.activo AND l.estado = 'COMPLETADO'
  WHERE h.producto_codigo IS NOT NULL
    AND h.fecha < DATE '2026-07-01'
  GROUP BY h.producto_codigo, date_trunc('month', h.fecha)::date
  ON CONFLICT (producto_codigo, mes) DO UPDATE SET
    unidades_netas = EXCLUDED.unidades_netas,
    unidades_positivas = EXCLUDED.unidades_positivas,
    devoluciones = EXCLUDED.devoluciones,
    pedidos = EXCLUDED.pedidos,
    importe_comparable = EXCLUDED.importe_comparable,
    actualizado_en = now();

  RETURN jsonb_build_object(
    'lote_id', p_lote_id,
    'filas', v_filas,
    'confirmadas', v_confirmadas,
    'pendientes_revision', v_revision,
    'productos_vinculados', (
      SELECT count(DISTINCT producto_codigo)
      FROM public.repuestos_ventas_historicas_legacy
      WHERE lote_id = p_lote_id AND estado_vinculo = 'CONFIRMADA'
    )
  );
END;
$$;

-- Conserva la reconstruccion del tramo nuevo y agrega el historico activo sin
-- solapar el corte oficial del nuevo sistema (01/07/2026).
DO $migration$
BEGIN
  IF to_regprocedure('public.repuestos_refrescar_historial_unificado_base_actual()') IS NULL THEN
    ALTER FUNCTION public.repuestos_refrescar_historial_unificado()
      RENAME TO repuestos_refrescar_historial_unificado_base_actual;
  END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.repuestos_refrescar_historial_unificado()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '240s'
AS $$
DECLARE
  v_resultado jsonb;
  v_legacy_lineas integer := 0;
  v_legacy_productos integer := 0;
BEGIN
  v_resultado := public.repuestos_refrescar_historial_unificado_base_actual();

  INSERT INTO public.repuestos_demanda_mensual(
    producto_codigo, mes, unidades_netas, unidades_positivas,
    devoluciones, pedidos, importe_comparable
  )
  SELECT
    h.producto_codigo,
    date_trunc('month', h.fecha)::date,
    sum(h.cantidad)::numeric,
    sum(greatest(h.cantidad, 0))::numeric,
    sum(abs(least(h.cantidad, 0)))::numeric,
    count(DISTINCT coalesce(h.documento, h.linea_clave))::integer,
    sum(h.importe_usd)::numeric
  FROM public.repuestos_ventas_historicas_legacy h
  JOIN public.repuestos_historial_legacy_lotes l
    ON l.id = h.lote_id AND l.activo AND l.estado = 'COMPLETADO'
  WHERE h.producto_codigo IS NOT NULL
    AND h.fecha < DATE '2026-07-01'
  GROUP BY h.producto_codigo, date_trunc('month', h.fecha)::date
  ON CONFLICT (producto_codigo, mes) DO UPDATE SET
    unidades_netas = EXCLUDED.unidades_netas,
    unidades_positivas = EXCLUDED.unidades_positivas,
    devoluciones = EXCLUDED.devoluciones,
    pedidos = EXCLUDED.pedidos,
    importe_comparable = EXCLUDED.importe_comparable,
    actualizado_en = now();

  SELECT count(*)::integer, count(DISTINCT h.producto_codigo)::integer
  INTO v_legacy_lineas, v_legacy_productos
  FROM public.repuestos_ventas_historicas_legacy h
  JOIN public.repuestos_historial_legacy_lotes l ON l.id = h.lote_id AND l.activo
  WHERE h.producto_codigo IS NOT NULL AND h.fecha < DATE '2026-07-01';

  RETURN v_resultado || jsonb_build_object(
    'lineas_historicas', v_legacy_lineas,
    'productos_historicos', v_legacy_productos,
    'productos_con_demanda', (
      SELECT count(DISTINCT producto_codigo) FROM public.repuestos_demanda_mensual
    )
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
  WITH actual AS (
    SELECT
      v.estado_vinculo,
      v.producto_codigo,
      v.fecha_efectiva AS fecha,
      coalesce(p.marca, v.marca_origen) AS marca
    FROM public.repuestos_ventas_vinculacion v
    LEFT JOIN public.productos p ON p.codigo_interno = v.producto_codigo
  ),
  legacy AS (
    SELECT
      CASE WHEN h.estado_vinculo = 'CONFIRMADA' THEN 'CONFIRMADA' ELSE 'AMBIGUA' END AS estado_vinculo,
      h.producto_codigo,
      h.fecha,
      h.marca
    FROM public.repuestos_ventas_historicas_legacy h
    JOIN public.repuestos_historial_legacy_lotes l ON l.id = h.lote_id AND l.activo
  ),
  base AS (
    SELECT * FROM actual
    UNION ALL
    SELECT * FROM legacy
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

CREATE OR REPLACE FUNCTION public.repuestos_ultima_venta_unificada(p_fecha date)
RETURNS TABLE(producto_codigo text, ultima_venta date)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT fuente.producto_codigo, max(fuente.fecha)::date AS ultima_venta
  FROM (
    SELECT v.producto_codigo, v.fecha_efectiva AS fecha
    FROM public.repuestos_ventas_vinculacion v
    WHERE v.estado_vinculo = 'CONFIRMADA'
      AND v.producto_codigo IS NOT NULL
      AND v.fecha_efectiva <= p_fecha

    UNION ALL

    SELECT h.producto_codigo, h.fecha
    FROM public.repuestos_ventas_historicas_legacy h
    JOIN public.repuestos_historial_legacy_lotes l
      ON l.id = h.lote_id AND l.activo AND l.estado = 'COMPLETADO'
    WHERE h.producto_codigo IS NOT NULL
      AND h.fecha <= p_fecha
  ) fuente
  GROUP BY fuente.producto_codigo;
$$;

-- La primera capa del motor calculaba FSN usando solamente las ventas del XML
-- nuevo. Se sustituye esa fuente por la ultima venta unificada, conservando el
-- resto del motor versionado sin duplicar cientos de lineas de su definicion.
DO $patch_base_v1$
DECLARE
  v_firma regprocedure := to_regprocedure(
    'public.repuestos_sugerencia_viva_base_v1(text,date,text,text,text,boolean,integer,integer)'
  );
  v_definicion text;
  v_original text := $old$
  ultima_venta AS MATERIALIZED (
    SELECT v.producto_codigo, max(v.fecha_efectiva) AS ultima_venta
    FROM public.repuestos_ventas_vinculacion v
    JOIN productos_base p ON p.producto_codigo = v.producto_codigo
    WHERE v.estado_vinculo = 'CONFIRMADA'
      AND v.fecha_efectiva <= v_fecha
    GROUP BY v.producto_codigo
  ),$old$;
  v_reemplazo text := $new$
  ultima_venta AS MATERIALIZED (
    SELECT u.producto_codigo, u.ultima_venta
    FROM public.repuestos_ultima_venta_unificada(v_fecha) u
    JOIN productos_base p ON p.producto_codigo = u.producto_codigo
  ),$new$;
BEGIN
  IF v_firma IS NULL THEN
    RAISE EXCEPTION 'No existe la capa base_v1 del motor vivo';
  END IF;
  SELECT pg_get_functiondef(v_firma) INTO v_definicion;
  IF strpos(v_definicion, v_original) = 0 THEN
    RAISE EXCEPTION 'No se encontro el bloque de ultima venta esperado en base_v1';
  END IF;
  EXECUTE replace(v_definicion, v_original, v_reemplazo);
END;
$patch_base_v1$;

REVOKE ALL ON FUNCTION public.repuestos_iniciar_importacion_historial_legacy(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repuestos_importar_historial_legacy_lote(uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repuestos_finalizar_importacion_historial_legacy(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repuestos_refrescar_historial_unificado() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repuestos_iniciar_importacion_historial_legacy(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_importar_historial_legacy_lote(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_finalizar_importacion_historial_legacy(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_refrescar_historial_unificado() TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_ultima_venta_unificada(date) TO authenticated;

NOTIFY pgrst, 'reload schema';
