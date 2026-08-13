-- Carga unica del detalle de FACTURACION HISTORICA.xlsx.
-- Conserva cada renglon de repuesto y lo vincula mediante el maestro anterior.
-- La carga es idempotente: una interrupcion puede reintentarse sin duplicar ventas.

CREATE TABLE IF NOT EXISTS public.repuestos_facturacion_historica_cargas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  archivo_nombre text NOT NULL,
  estado text NOT NULL DEFAULT 'PROCESANDO'
    CHECK (estado IN ('PROCESANDO', 'COMPLETADO', 'FALLIDO')),
  filas_archivo integer NOT NULL DEFAULT 0,
  filas_recibidas integer NOT NULL DEFAULT 0,
  lineas_vinculadas integer NOT NULL DEFAULT 0,
  productos_vinculados integer NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT false,
  creado_en timestamptz NOT NULL DEFAULT now(),
  completado_en timestamptz,
  creado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS repuestos_facturacion_historica_activa_idx
  ON public.repuestos_facturacion_historica_cargas(activo)
  WHERE activo;

CREATE INDEX IF NOT EXISTS facturacion_lineas_historico_legacy_idx
  ON public.facturacion_lineas_importadas(cod_mercaderia, fecha_factura)
  WHERE origen_sistema = 'legacy_historico_detallado';

ALTER TABLE public.repuestos_facturacion_historica_cargas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS repuestos_facturacion_historica_select
  ON public.repuestos_facturacion_historica_cargas;
CREATE POLICY repuestos_facturacion_historica_select
ON public.repuestos_facturacion_historica_cargas FOR SELECT TO authenticated
USING (public.has_module_access(auth.uid(), 'repuestos'));

GRANT SELECT ON public.repuestos_facturacion_historica_cargas TO authenticated;

CREATE OR REPLACE FUNCTION public.repuestos_estado_facturacion_historica()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce((
    SELECT jsonb_build_object(
      'cargado', estado = 'COMPLETADO' AND activo,
      'en_proceso', estado = 'PROCESANDO',
      'carga_id', id,
      'archivo_nombre', archivo_nombre,
      'filas_archivo', filas_archivo,
      'filas_recibidas', filas_recibidas,
      'lineas_vinculadas', lineas_vinculadas,
      'productos_vinculados', productos_vinculados,
      'completado_en', completado_en
    )
    FROM public.repuestos_facturacion_historica_cargas
    WHERE activo OR estado = 'PROCESANDO'
    ORDER BY activo DESC, creado_en DESC
    LIMIT 1
  ), jsonb_build_object('cargado', false, 'en_proceso', false));
$$;

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
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede cargar la facturacion historica'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.repuestos_facturacion_historica_cargas
    WHERE activo AND estado = 'COMPLETADO'
  ) THEN
    RAISE EXCEPTION 'La facturacion historica detallada ya fue cargada. Esta operacion se realiza una sola vez.';
  END IF;

  -- Un intento interrumpido no bloquea el reintento. Las lineas ya insertadas
  -- se reconocen por su clave estable y no se duplican.
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
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
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

CREATE OR REPLACE FUNCTION public.repuestos_publicar_facturacion_historica()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '180s'
AS $$
DECLARE
  v_lineas integer := 0;
  v_productos integer := 0;
BEGIN
  CREATE TEMP TABLE tmp_facturacion_historica_codigos ON COMMIT DROP AS
  WITH codigos AS MATERIALIZED (
    SELECT DISTINCT public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia) AS codigo_norm
    FROM public.facturacion_lineas_importadas f
    WHERE f.origen_sistema = 'legacy_historico_detallado'
      AND public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia) IS NOT NULL
  ),
  candidatos AS MATERIALIZED (
    SELECT c.codigo_norm, m.producto_codigo, 0 AS prioridad, 'MAESTRO_LEGACY'::text AS metodo
    FROM codigos c
    JOIN public.repuestos_maestro_legacy_cargas mc
      ON mc.activo AND mc.estado = 'COMPLETADO'
    JOIN public.repuestos_maestro_legacy m
      ON m.carga_id = mc.id AND m.codigo_legacy_norm = c.codigo_norm
    WHERE m.producto_codigo IS NOT NULL
      AND m.estado_vinculo IN ('CONFIRMADA', 'CONFIRMADA_CANONICA')

    UNION ALL

    SELECT c.codigo_norm, p.codigo_interno, 1, 'CODIGO_INTERNO'
    FROM codigos c
    JOIN public.productos p
      ON public.normalizar_codigo_repuesto_flexible(p.codigo_interno) = c.codigo_norm
    WHERE p.activo

    UNION ALL

    SELECT c.codigo_norm, p.codigo_interno, 2, 'CODIGO_FABRICANTE'
    FROM codigos c
    JOIN public.productos p
      ON public.normalizar_codigo_repuesto_flexible(p.codigo_fabricante) = c.codigo_norm
    WHERE p.activo
  )
  SELECT DISTINCT ON (codigo_norm)
    codigo_norm, producto_codigo, prioridad, metodo
  FROM candidatos
  ORDER BY codigo_norm, prioridad, producto_codigo;

  CREATE UNIQUE INDEX tmp_facturacion_historica_codigos_idx
    ON tmp_facturacion_historica_codigos(codigo_norm);
  ANALYZE tmp_facturacion_historica_codigos;

  -- El maestro anterior es la regla principal. Los empates ya fueron resueltos
  -- de forma auditable al cargar ese maestro.
  INSERT INTO public.repuestos_ventas_vinculacion(
    linea_id, producto_codigo, estado_vinculo, metodo_vinculo, prioridad,
    confianza, candidatos, cantidad_candidatos, fecha_efectiva,
    marca_origen, moneda, cantidad, unidad_producto
  )
  SELECT
    f.id,
    mapa.producto_codigo,
    CASE WHEN mapa.producto_codigo IS NULL THEN 'SIN_COINCIDENCIA' ELSE 'CONFIRMADA' END,
    mapa.metodo,
    mapa.prioridad,
    CASE
      WHEN mapa.prioridad = 0 THEN 1.00
      WHEN mapa.prioridad = 1 THEN 0.95
      WHEN mapa.prioridad = 2 THEN 0.90
      ELSE 0
    END,
    CASE WHEN mapa.producto_codigo IS NULL THEN '{}'::text[] ELSE ARRAY[mapa.producto_codigo] END,
    CASE WHEN mapa.producto_codigo IS NULL THEN 0 ELSE 1 END,
    f.fecha_factura::date,
    coalesce(p.marca, f.marca_normalizada, 'OTROS'::public.marca),
    f.moneda,
    coalesce(f.cantidad, 0),
    p.unidad
  FROM public.facturacion_lineas_importadas f
  LEFT JOIN tmp_facturacion_historica_codigos mapa
    ON mapa.codigo_norm = public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia)
  LEFT JOIN public.productos p ON p.codigo_interno = mapa.producto_codigo
  WHERE f.origen_sistema = 'legacy_historico_detallado'
  ON CONFLICT (linea_id) DO UPDATE SET
    producto_codigo = EXCLUDED.producto_codigo,
    estado_vinculo = EXCLUDED.estado_vinculo,
    metodo_vinculo = EXCLUDED.metodo_vinculo,
    prioridad = EXCLUDED.prioridad,
    confianza = EXCLUDED.confianza,
    candidatos = EXCLUDED.candidatos,
    cantidad_candidatos = EXCLUDED.cantidad_candidatos,
    fecha_efectiva = EXCLUDED.fecha_efectiva,
    marca_origen = EXCLUDED.marca_origen,
    moneda = EXCLUDED.moneda,
    cantidad = EXCLUDED.cantidad,
    unidad_producto = EXCLUDED.unidad_producto,
    actualizado_en = now();

  -- Recalcula solo el tramo historico. El sistema nuevo permanece intacto.
  DELETE FROM public.repuestos_demanda_mensual
  WHERE mes < DATE '2026-07-01';

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
    AND v.fecha_efectiva < DATE '2026-07-01'
  GROUP BY v.producto_codigo, date_trunc('month', v.fecha_efectiva)::date
  ON CONFLICT (producto_codigo, mes) DO UPDATE SET
    unidades_netas = EXCLUDED.unidades_netas,
    unidades_positivas = EXCLUDED.unidades_positivas,
    devoluciones = EXCLUDED.devoluciones,
    pedidos = EXCLUDED.pedidos,
    importe_comparable = EXCLUDED.importe_comparable,
    actualizado_en = now();

  SELECT count(*)::integer, count(DISTINCT producto_codigo)::integer
  INTO v_lineas, v_productos
  FROM public.repuestos_ventas_vinculacion v
  JOIN public.facturacion_lineas_importadas f ON f.id = v.linea_id
  WHERE f.origen_sistema = 'legacy_historico_detallado'
    AND v.estado_vinculo = 'CONFIRMADA';

  RETURN jsonb_build_object(
    'lineas_vinculadas', v_lineas,
    'productos_vinculados', v_productos
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
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
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

REVOKE ALL ON FUNCTION public.repuestos_estado_facturacion_historica() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repuestos_iniciar_facturacion_historica(text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repuestos_importar_facturacion_historica_lote(uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repuestos_publicar_facturacion_historica() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repuestos_finalizar_facturacion_historica(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.repuestos_estado_facturacion_historica() TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_iniciar_facturacion_historica(text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_importar_facturacion_historica_lote(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_publicar_facturacion_historica() TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_finalizar_facturacion_historica(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
