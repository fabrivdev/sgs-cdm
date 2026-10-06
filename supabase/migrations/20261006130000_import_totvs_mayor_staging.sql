-- Staging fiel e idempotente del Libro Mayor TOTVS.
-- Esta migración se valida localmente; agregar el archivo no la aplica a ninguna base.
-- La clasificación contable vive separada de los movimientos y puede permanecer pendiente.

BEGIN;

CREATE TABLE public.totvs_mayor_cargas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  archivo_nombre text NOT NULL,
  archivo_sha256 text NOT NULL CHECK (archivo_sha256 ~ '^[0-9a-f]{64}$'),
  archivo_tamano bigint NOT NULL CHECK (archivo_tamano > 0),
  estado text NOT NULL DEFAULT 'VALIDANDO'
    CHECK (estado IN ('VALIDANDO','IMPORTANDO','COMPLETA','CONFLICTO','CANCELADA')),
  fecha_desde date,
  fecha_hasta date,
  filas_vinculadas integer NOT NULL DEFAULT 0 CHECK (filas_vinculadas >= 0),
  filas_cuarentena integer NOT NULL DEFAULT 0 CHECK (filas_cuarentena >= 0),
  filas_apertura integer NOT NULL DEFAULT 0 CHECK (filas_apertura >= 0),
  filas_tpsldo_1 integer NOT NULL DEFAULT 0 CHECK (filas_tpsldo_1 >= 0),
  filas_tpsldo_9 integer NOT NULL DEFAULT 0 CHECK (filas_tpsldo_9 >= 0),
  neto_tpsldo_1_pyg numeric(24,6) NOT NULL DEFAULT 0,
  neto_tpsldo_1_usd numeric(24,6) NOT NULL DEFAULT 0,
  neto_tpsldo_9_pyg numeric(24,6) NOT NULL DEFAULT 0,
  neto_tpsldo_9_usd numeric(24,6) NOT NULL DEFAULT 0,
  creado_por uuid NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  completado_en timestamptz,
  cancelado_en timestamptz
);

CREATE TABLE public.totvs_mayor_movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave_origen text NOT NULL UNIQUE,
  huella_origen text NOT NULL,
  sucursal text NOT NULL,
  anio_mes text,
  fecha_fuente text NOT NULL,
  fecha_movimiento date NOT NULL,
  lote text NOT NULL,
  sublote text NOT NULL,
  documento text NOT NULL,
  linea text NOT NULL,
  importe_pyg numeric(24,6) NOT NULL,
  importe_usd numeric(24,6) NOT NULL,
  historial text,
  cuenta_codigo text,
  cuenta_descripcion text,
  centro_costo text,
  centro_costo_descripcion text,
  item_contable text,
  cliente text,
  origen text,
  tipo_movimiento text NOT NULL CHECK (tipo_movimiento IN ('1','2')),
  tipo_saldo text NOT NULL,
  contraparte_codigo text,
  contraparte_tienda text,
  documento_asociado text,
  tipo_asiento text,
  fecha_inclusion text,
  usuario_nombre text,
  asiento text,
  es_apertura boolean NOT NULL,
  archivo_origen text NOT NULL,
  fila_origen integer NOT NULL CHECK (fila_origen >= 2),
  datos_fuente jsonb NOT NULL DEFAULT '{}'::jsonb,
  primera_carga_id uuid NOT NULL REFERENCES public.totvs_mayor_cargas(id),
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.totvs_mayor_carga_movimientos (
  carga_id uuid NOT NULL REFERENCES public.totvs_mayor_cargas(id) ON DELETE CASCADE,
  movimiento_id uuid NOT NULL REFERENCES public.totvs_mayor_movimientos(id) ON DELETE CASCADE,
  PRIMARY KEY (carga_id, movimiento_id)
);

CREATE TABLE public.totvs_mayor_cuarentena (
  movimiento_id uuid PRIMARY KEY REFERENCES public.totvs_mayor_movimientos(id) ON DELETE CASCADE,
  motivo text NOT NULL CHECK (motivo IN ('CUENTA_VACIA')),
  resuelta boolean NOT NULL DEFAULT false,
  resolucion text,
  resuelta_por uuid,
  resuelta_en timestamptz,
  CHECK ((NOT resuelta AND resolucion IS NULL AND resuelta_por IS NULL AND resuelta_en IS NULL)
    OR (resuelta AND nullif(btrim(resolucion),'') IS NOT NULL AND resuelta_por IS NOT NULL AND resuelta_en IS NOT NULL))
);

CREATE TABLE public.totvs_mayor_cuentas_clasificacion (
  cuenta_codigo text NOT NULL,
  version integer NOT NULL CHECK (version >= 1),
  categoria text,
  subcategoria text,
  estado text NOT NULL CHECK (estado IN ('PROPUESTA','CLARA','REVISION')),
  fundamento text,
  origen text NOT NULL DEFAULT 'MANUAL',
  aprobada_por uuid,
  aprobada_en timestamptz,
  creada_por uuid,
  creada_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cuenta_codigo, version),
  CHECK ((estado IN ('PROPUESTA','REVISION') AND aprobada_por IS NULL AND aprobada_en IS NULL)
    OR (estado = 'CLARA' AND nullif(btrim(categoria),'') IS NOT NULL AND aprobada_por IS NOT NULL AND aprobada_en IS NOT NULL)),
  CHECK (estado <> 'PROPUESTA' OR nullif(btrim(categoria),'') IS NOT NULL)
);

CREATE TABLE public.totvs_mayor_periodos_estado (
  periodo date PRIMARY KEY CHECK (periodo = date_trunc('month', periodo)::date),
  estado text NOT NULL CHECK (estado IN ('SIN_CONFIRMAR','PROVISIONAL_CIERRE_POR_CONFIRMAR','PARCIAL','CERRADO')),
  fundamento text,
  origen text NOT NULL DEFAULT 'MANUAL',
  actualizado_por uuid,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (estado <> 'CERRADO' OR actualizado_por IS NOT NULL)
);

CREATE INDEX totvs_mayor_movimientos_fecha_idx ON public.totvs_mayor_movimientos(fecha_movimiento);
CREATE INDEX totvs_mayor_movimientos_cuenta_idx ON public.totvs_mayor_movimientos(cuenta_codigo, fecha_movimiento);
CREATE INDEX totvs_mayor_movimientos_sucursal_idx ON public.totvs_mayor_movimientos(sucursal, fecha_movimiento);
CREATE INDEX totvs_mayor_movimientos_centro_idx ON public.totvs_mayor_movimientos(centro_costo, fecha_movimiento);
CREATE INDEX totvs_mayor_carga_movimientos_movimiento_idx ON public.totvs_mayor_carga_movimientos(movimiento_id);

ALTER TABLE public.totvs_mayor_cargas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.totvs_mayor_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.totvs_mayor_carga_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.totvs_mayor_cuarentena ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.totvs_mayor_cuentas_clasificacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.totvs_mayor_periodos_estado ENABLE ROW LEVEL SECURITY;

CREATE POLICY totvs_mayor_cargas_admin ON public.totvs_mayor_cargas
FOR SELECT TO authenticated USING (public.has_section_access(auth.uid(), 'admin.importaciones'));
CREATE POLICY totvs_mayor_movimientos_admin ON public.totvs_mayor_movimientos
FOR SELECT TO authenticated USING (public.has_section_access(auth.uid(), 'admin.importaciones'));
CREATE POLICY totvs_mayor_carga_movimientos_admin ON public.totvs_mayor_carga_movimientos
FOR SELECT TO authenticated USING (public.has_section_access(auth.uid(), 'admin.importaciones'));
CREATE POLICY totvs_mayor_cuarentena_admin ON public.totvs_mayor_cuarentena
FOR SELECT TO authenticated USING (public.has_section_access(auth.uid(), 'admin.importaciones'));
CREATE POLICY totvs_mayor_clasificacion_admin ON public.totvs_mayor_cuentas_clasificacion
FOR SELECT TO authenticated USING (public.has_section_access(auth.uid(), 'admin.importaciones'));
CREATE POLICY totvs_mayor_periodos_admin ON public.totvs_mayor_periodos_estado
FOR SELECT TO authenticated USING (public.has_section_access(auth.uid(), 'admin.importaciones'));

REVOKE ALL ON TABLE public.totvs_mayor_cargas, public.totvs_mayor_movimientos,
  public.totvs_mayor_carga_movimientos, public.totvs_mayor_cuarentena,
  public.totvs_mayor_cuentas_clasificacion, public.totvs_mayor_periodos_estado
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.totvs_mayor_cargas, public.totvs_mayor_movimientos,
  public.totvs_mayor_carga_movimientos, public.totvs_mayor_cuarentena,
  public.totvs_mayor_cuentas_clasificacion, public.totvs_mayor_periodos_estado
TO authenticated;

CREATE OR REPLACE FUNCTION public.totvs_iniciar_mayor_carga_v1(p_metadata jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(), 'admin.importaciones') THEN
    RAISE EXCEPTION 'Sin permiso para importar el Libro Mayor' USING ERRCODE='42501';
  END IF;
  IF p_metadata IS NULL
     OR nullif(btrim(p_metadata->>'archivo_nombre'),'') IS NULL
     OR coalesce(p_metadata->>'archivo_sha256','') !~ '^[0-9a-f]{64}$'
     OR coalesce((p_metadata->>'archivo_tamano')::bigint,0) <= 0 THEN
    RAISE EXCEPTION 'Metadata de carga del Mayor inválida' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.totvs_mayor_cargas(archivo_nombre,archivo_sha256,archivo_tamano,creado_por)
  VALUES (btrim(p_metadata->>'archivo_nombre'),p_metadata->>'archivo_sha256',(p_metadata->>'archivo_tamano')::bigint,auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.totvs_importar_mayor_lote_v1(
  p_carga_id uuid,
  p_modo text,
  p_filas jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total integer;
  v_unicas integer;
  v_insertadas integer;
  v_sin_cambios integer;
  v_conflictos integer;
  v_cuarentena integer;
  v_vinculadas integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(), 'admin.importaciones') THEN
    RAISE EXCEPTION 'Sin permiso para importar el Libro Mayor' USING ERRCODE='42501';
  END IF;
  IF p_carga_id IS NULL OR p_modo NOT IN ('validate','import') OR jsonb_typeof(p_filas) <> 'array' THEN
    RAISE EXCEPTION 'Carga, modo o filas del Mayor inválidos' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.totvs_mayor_cargas
  WHERE id=p_carga_id AND creado_por=auth.uid() AND estado IN ('VALIDANDO','IMPORTANDO')
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Carga del Mayor inexistente, ajena o cerrada' USING ERRCODE='22023'; END IF;

  v_total := jsonb_array_length(p_filas);
  IF v_total < 1 OR v_total > 500 THEN
    RAISE EXCEPTION 'Cada lote del Mayor debe contener entre 1 y 500 filas' USING ERRCODE='22023';
  END IF;

  DROP TABLE IF EXISTS pg_temp.mayor_lote;
  CREATE TEMP TABLE mayor_lote ON COMMIT DROP AS
  SELECT * FROM jsonb_to_recordset(p_filas) AS x(
    clave_origen text, huella_origen text, sucursal text, anio_mes text,
    fecha_fuente text, fecha_movimiento date, lote text, sublote text, documento text, linea text,
    importe_pyg numeric, importe_usd numeric, historial text, cuenta_codigo text,
    cuenta_descripcion text, centro_costo text, centro_costo_descripcion text,
    item_contable text, cliente text, origen text, tipo_movimiento text, tipo_saldo text,
    contraparte_codigo text, contraparte_tienda text, documento_asociado text,
    tipo_asiento text, fecha_inclusion text, usuario_nombre text, asiento text,
    es_apertura boolean, archivo_origen text, fila_origen integer, datos_fuente jsonb
  );

  SELECT count(DISTINCT clave_origen) INTO v_unicas FROM mayor_lote;
  IF v_unicas <> v_total THEN
    RAISE EXCEPTION 'El lote del Mayor contiene claves repetidas' USING ERRCODE='23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM mayor_lote
    WHERE nullif(btrim(clave_origen),'') IS NULL OR nullif(btrim(huella_origen),'') IS NULL
       OR nullif(btrim(sucursal),'') IS NULL OR nullif(btrim(fecha_fuente),'') IS NULL
       OR fecha_movimiento IS NULL OR nullif(btrim(lote),'') IS NULL
       OR nullif(btrim(sublote),'') IS NULL OR nullif(btrim(documento),'') IS NULL
       OR nullif(btrim(linea),'') IS NULL OR importe_pyg IS NULL OR importe_usd IS NULL
       OR tipo_movimiento NOT IN ('1','2') OR nullif(btrim(tipo_saldo),'') IS NULL
       OR es_apertura IS NULL OR nullif(btrim(archivo_origen),'') IS NULL OR fila_origen < 2
       OR clave_origen IS DISTINCT FROM concat_ws('|',btrim(sucursal),btrim(fecha_fuente),btrim(lote),btrim(sublote),btrim(documento),btrim(linea))
  ) THEN
    RAISE EXCEPTION 'El lote del Mayor contiene campos obligatorios o clave inválidos' USING ERRCODE='22023';
  END IF;

  SELECT count(*) FILTER (WHERE actual.id IS NULL),
         count(*) FILTER (WHERE actual.id IS NOT NULL AND actual.huella_origen = lote.huella_origen),
         count(*) FILTER (WHERE actual.id IS NOT NULL AND actual.huella_origen IS DISTINCT FROM lote.huella_origen),
         count(*) FILTER (WHERE nullif(btrim(lote.cuenta_codigo),'') IS NULL)
  INTO v_insertadas,v_sin_cambios,v_conflictos,v_cuarentena
  FROM mayor_lote lote
  LEFT JOIN public.totvs_mayor_movimientos actual ON actual.clave_origen=lote.clave_origen;

  IF p_modo='validate' THEN
    RETURN jsonb_build_object('modo','validate','total',v_total,'insertadas',v_insertadas,
      'sin_cambios',v_sin_cambios,'conflictos',v_conflictos,'cuarentena',v_cuarentena,'escrituras',0);
  END IF;
  IF v_conflictos > 0 THEN
    RAISE EXCEPTION '% claves del Mayor ya existen con otra huella; el lote fue revertido', v_conflictos USING ERRCODE='23505';
  END IF;

  INSERT INTO public.totvs_mayor_movimientos(
    clave_origen,huella_origen,sucursal,anio_mes,fecha_fuente,fecha_movimiento,lote,sublote,documento,linea,
    importe_pyg,importe_usd,historial,cuenta_codigo,cuenta_descripcion,centro_costo,centro_costo_descripcion,
    item_contable,cliente,origen,tipo_movimiento,tipo_saldo,contraparte_codigo,contraparte_tienda,
    documento_asociado,tipo_asiento,fecha_inclusion,usuario_nombre,asiento,es_apertura,
    archivo_origen,fila_origen,datos_fuente,primera_carga_id
  ) SELECT
    clave_origen,huella_origen,btrim(sucursal),nullif(btrim(anio_mes),''),btrim(fecha_fuente),fecha_movimiento,
    btrim(lote),btrim(sublote),btrim(documento),btrim(linea),importe_pyg,importe_usd,
    nullif(btrim(historial),''),nullif(btrim(cuenta_codigo),''),nullif(btrim(cuenta_descripcion),''),
    nullif(btrim(centro_costo),''),nullif(btrim(centro_costo_descripcion),''),nullif(btrim(item_contable),''),
    nullif(btrim(cliente),''),nullif(btrim(origen),''),tipo_movimiento,btrim(tipo_saldo),
    nullif(btrim(contraparte_codigo),''),nullif(btrim(contraparte_tienda),''),nullif(btrim(documento_asociado),''),
    nullif(btrim(tipo_asiento),''),nullif(btrim(fecha_inclusion),''),nullif(btrim(usuario_nombre),''),
    nullif(btrim(asiento),''),es_apertura,btrim(archivo_origen),fila_origen,coalesce(datos_fuente,'{}'::jsonb),p_carga_id
  FROM mayor_lote ON CONFLICT (clave_origen) DO NOTHING;

  INSERT INTO public.totvs_mayor_carga_movimientos(carga_id,movimiento_id)
  SELECT p_carga_id,m.id FROM mayor_lote lote
  JOIN public.totvs_mayor_movimientos m ON m.clave_origen=lote.clave_origen AND m.huella_origen=lote.huella_origen
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_vinculadas = ROW_COUNT;

  INSERT INTO public.totvs_mayor_cuarentena(movimiento_id,motivo)
  SELECT m.id,'CUENTA_VACIA' FROM mayor_lote lote
  JOIN public.totvs_mayor_movimientos m ON m.clave_origen=lote.clave_origen
  WHERE nullif(btrim(lote.cuenta_codigo),'') IS NULL
  ON CONFLICT (movimiento_id) DO NOTHING;

  UPDATE public.totvs_mayor_cargas c SET
    estado='IMPORTANDO',
    filas_vinculadas=(SELECT count(*) FROM public.totvs_mayor_carga_movimientos cm WHERE cm.carga_id=c.id),
    filas_cuarentena=(SELECT count(*) FROM public.totvs_mayor_carga_movimientos cm JOIN public.totvs_mayor_cuarentena q ON q.movimiento_id=cm.movimiento_id WHERE cm.carga_id=c.id)
  WHERE c.id=p_carga_id;

  RETURN jsonb_build_object('modo','import','total',v_total,'insertadas',v_insertadas,
    'sin_cambios',v_sin_cambios,'conflictos',0,'cuarentena',v_cuarentena,'vinculadas',v_vinculadas);
END;
$$;

CREATE OR REPLACE FUNCTION public.totvs_finalizar_mayor_carga_v1(p_carga_id uuid,p_control jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(), 'admin.importaciones') THEN
    RAISE EXCEPTION 'Sin permiso para finalizar el Libro Mayor' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.totvs_mayor_cargas WHERE id=p_carga_id AND creado_por=auth.uid() AND estado IN ('VALIDANDO','IMPORTANDO') FOR UPDATE;
  IF NOT FOUND OR p_control IS NULL THEN RAISE EXCEPTION 'Carga o control del Mayor inválido' USING ERRCODE='22023'; END IF;

  SELECT count(*)::integer filas,
    count(*) FILTER (WHERE m.es_apertura)::integer aperturas,
    count(*) FILTER (WHERE m.tipo_saldo='1')::integer filas_1,
    count(*) FILTER (WHERE m.tipo_saldo='9')::integer filas_9,
    coalesce(sum(m.importe_pyg) FILTER (WHERE m.tipo_saldo='1'),0) neto_1_pyg,
    coalesce(sum(m.importe_usd) FILTER (WHERE m.tipo_saldo='1'),0) neto_1_usd,
    coalesce(sum(m.importe_pyg) FILTER (WHERE m.tipo_saldo='9'),0) neto_9_pyg,
    coalesce(sum(m.importe_usd) FILTER (WHERE m.tipo_saldo='9'),0) neto_9_usd,
    min(m.fecha_movimiento) desde,max(m.fecha_movimiento) hasta,
    count(*) FILTER (WHERE q.movimiento_id IS NOT NULL)::integer cuarentena
  INTO v FROM public.totvs_mayor_carga_movimientos cm
  JOIN public.totvs_mayor_movimientos m ON m.id=cm.movimiento_id
  LEFT JOIN public.totvs_mayor_cuarentena q ON q.movimiento_id=m.id
  WHERE cm.carga_id=p_carga_id;

  IF v.filas IS DISTINCT FROM (p_control->>'movimientos')::integer
    OR v.aperturas IS DISTINCT FROM (p_control->>'aperturas')::integer
    OR v.filas_1 IS DISTINCT FROM (p_control->>'filas_tpsldo_1')::integer
    OR v.filas_9 IS DISTINCT FROM (p_control->>'filas_tpsldo_9')::integer
    OR v.cuarentena IS DISTINCT FROM (p_control->>'cuarentena')::integer
    OR abs(v.neto_1_pyg-(p_control->>'neto_tpsldo_1_pyg')::numeric) > 0.01
    OR abs(v.neto_1_usd-(p_control->>'neto_tpsldo_1_usd')::numeric) > 0.01
    OR abs(v.neto_9_pyg-(p_control->>'neto_tpsldo_9_pyg')::numeric) > 0.01
    OR abs(v.neto_9_usd-(p_control->>'neto_tpsldo_9_usd')::numeric) > 0.01 THEN
    RAISE EXCEPTION 'La carga del Mayor no concilia con sus controles; finalización revertida' USING ERRCODE='23514';
  END IF;

  UPDATE public.totvs_mayor_cargas SET estado='COMPLETA',fecha_desde=v.desde,fecha_hasta=v.hasta,
    filas_vinculadas=v.filas,filas_cuarentena=v.cuarentena,filas_apertura=v.aperturas,
    filas_tpsldo_1=v.filas_1,filas_tpsldo_9=v.filas_9,
    neto_tpsldo_1_pyg=v.neto_1_pyg,neto_tpsldo_1_usd=v.neto_1_usd,
    neto_tpsldo_9_pyg=v.neto_9_pyg,neto_tpsldo_9_usd=v.neto_9_usd,completado_en=now()
  WHERE id=p_carga_id;
  RETURN jsonb_build_object('carga_id',p_carga_id,'estado','COMPLETA','movimientos',v.filas,'cuarentena',v.cuarentena);
END;
$$;

CREATE OR REPLACE FUNCTION public.totvs_cancelar_mayor_carga_v1(p_carga_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(), 'admin.importaciones') THEN
    RAISE EXCEPTION 'Sin permiso para cancelar el Libro Mayor' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.totvs_mayor_cargas WHERE id=p_carga_id AND creado_por=auth.uid() AND estado IN ('VALIDANDO','IMPORTANDO') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Carga del Mayor inexistente, ajena o no cancelable' USING ERRCODE='22023'; END IF;
  DELETE FROM public.totvs_mayor_carga_movimientos WHERE carga_id=p_carga_id;
  DELETE FROM public.totvs_mayor_movimientos m WHERE NOT EXISTS (
    SELECT 1 FROM public.totvs_mayor_carga_movimientos cm WHERE cm.movimiento_id=m.id
  );
  UPDATE public.totvs_mayor_cargas SET estado='CANCELADA',filas_vinculadas=0,filas_cuarentena=0,cancelado_en=now() WHERE id=p_carga_id;
END;
$$;

CREATE OR REPLACE VIEW public.totvs_mayor_resumen_agregado AS
WITH clasificacion AS (
  SELECT DISTINCT ON (cuenta_codigo) cuenta_codigo,categoria,subcategoria,estado,version
  FROM public.totvs_mayor_cuentas_clasificacion ORDER BY cuenta_codigo,version DESC
), movimientos_elegibles AS (
  -- Una reimportacion completa puede vincular el mismo movimiento mas de una vez.
  -- Deducir primero los IDs evita duplicar importes y no arrastra datos_fuente JSON
  -- ni el resto de columnas anchas durante la agregacion gerencial.
  SELECT DISTINCT cm.movimiento_id
  FROM public.totvs_mayor_carga_movimientos cm
  JOIN public.totvs_mayor_cargas c ON c.id=cm.carga_id
  WHERE c.estado='COMPLETA'
)
SELECT date_trunc('month',m.fecha_movimiento)::date periodo,m.sucursal,m.centro_costo,m.tipo_saldo,m.es_apertura,
  m.cuenta_codigo,m.cuenta_descripcion,coalesce(cl.estado,'SIN_MAPEO') clasificacion_estado,
  cl.categoria,cl.subcategoria,cl.version clasificacion_version,
  coalesce(pe.estado,'SIN_CONFIRMAR') periodo_estado,
  count(*)::integer filas,sum(m.importe_pyg) importe_pyg,sum(m.importe_usd) importe_usd,
  sum(abs(m.importe_pyg)) importe_absoluto_pyg,sum(abs(m.importe_usd)) importe_absoluto_usd,
  sum(abs(m.importe_pyg)) FILTER (WHERE coalesce(cl.estado,'SIN_MAPEO') <> 'CLARA') importe_excluido_pyg,
  sum(abs(m.importe_usd)) FILTER (WHERE coalesce(cl.estado,'SIN_MAPEO') <> 'CLARA') importe_excluido_usd,
  count(*) FILTER (WHERE q.movimiento_id IS NOT NULL)::integer filas_cuarentena
FROM movimientos_elegibles me
JOIN public.totvs_mayor_movimientos m ON m.id=me.movimiento_id
LEFT JOIN clasificacion cl ON cl.cuenta_codigo=m.cuenta_codigo
LEFT JOIN public.totvs_mayor_periodos_estado pe ON pe.periodo=date_trunc('month',m.fecha_movimiento)::date
LEFT JOIN public.totvs_mayor_cuarentena q ON q.movimiento_id=m.id AND NOT q.resuelta
GROUP BY 1,2,3,4,5,6,7,8,9,10,11,pe.estado;

REVOKE ALL ON public.totvs_mayor_resumen_agregado FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.totvs_consultar_mayor_resumen_v1(p_desde date DEFAULT NULL,p_hasta date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_resultado jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_section_access(auth.uid(), 'admin.importaciones')
    OR public.has_role(auth.uid(), 'gerencia'::public.app_role)
  ) THEN RAISE EXCEPTION 'Sin permiso para consultar agregados del Libro Mayor' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.periodo,r.sucursal,r.cuenta_codigo),'[]'::jsonb)
  INTO v_resultado FROM public.totvs_mayor_resumen_agregado r
  WHERE (p_desde IS NULL OR r.periodo >= date_trunc('month',p_desde)::date)
    AND (p_hasta IS NULL OR r.periodo <= date_trunc('month',p_hasta)::date);
  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.totvs_iniciar_mayor_carga_v1(jsonb),
  public.totvs_importar_mayor_lote_v1(uuid,text,jsonb),
  public.totvs_finalizar_mayor_carga_v1(uuid,jsonb),
  public.totvs_cancelar_mayor_carga_v1(uuid),
  public.totvs_consultar_mayor_resumen_v1(date,date)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.totvs_iniciar_mayor_carga_v1(jsonb),
  public.totvs_importar_mayor_lote_v1(uuid,text,jsonb),
  public.totvs_finalizar_mayor_carga_v1(uuid,jsonb),
  public.totvs_cancelar_mayor_carga_v1(uuid),
  public.totvs_consultar_mayor_resumen_v1(date,date)
TO authenticated;

COMMENT ON TABLE public.totvs_mayor_movimientos IS 'Asientos fuente del Mayor TOTVS; PYG y USD se conservan separados y sin clasificación inferida.';
COMMENT ON TABLE public.totvs_mayor_cuarentena IS 'Movimientos del Mayor sin cuenta; permanecen en controles y no se descartan silenciosamente.';
COMMENT ON VIEW public.totvs_mayor_resumen_agregado IS 'Contrato agregado para panel; muestra estado de cierre, clasificación y montos excluidos, no certifica EBITDA.';
COMMENT ON TABLE public.totvs_mayor_cuentas_clasificacion IS 'Clasificacion versionada: PROPUESTA no equivale a aprobacion, REVISION requiere decision y CLARA exige aprobador y fecha.';

NOTIFY pgrst, 'reload schema';
COMMIT;
