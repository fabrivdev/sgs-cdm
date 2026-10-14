-- Cada archivo completo es una foto del Mayor. Una correccion conserva la fila
-- anterior y el agregado publica exclusivamente la ultima foto conciliada.
BEGIN;

ALTER TABLE public.totvs_mayor_cargas DROP CONSTRAINT totvs_mayor_cargas_estado_check;
ALTER TABLE public.totvs_mayor_cargas ADD CONSTRAINT totvs_mayor_cargas_estado_check
  CHECK (estado IN ('VALIDANDO','IMPORTANDO','COMPLETA','SUPERADA','CONFLICTO','CANCELADA'));

-- Consumidores anteriores seleccionan estado=COMPLETA y algunos deduplican
-- solo por movimiento_id. Dejar un solo corte COMPLETA protege tambien a esos
-- lectores hasta que se reconcilien sus definiciones con esta migracion.
WITH vigente AS (
  SELECT id FROM public.totvs_mayor_cargas WHERE estado='COMPLETA'
  ORDER BY completado_en DESC NULLS LAST,creado_en DESC,id DESC LIMIT 1
)
UPDATE public.totvs_mayor_cargas c SET estado='SUPERADA'
WHERE c.estado='COMPLETA' AND c.id<>(SELECT id FROM vigente);

CREATE OR REPLACE FUNCTION public.totvs_mayor_activar_foto_v2()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  -- El bloqueo antecede la escritura de COMPLETA y serializa dos cierres.
  PERFORM pg_advisory_xact_lock(176786832,191924845);
  UPDATE public.totvs_mayor_cargas SET estado='SUPERADA'
  WHERE id<>NEW.id AND estado='COMPLETA';
  RETURN NEW;
END;
$$;
CREATE TRIGGER totvs_mayor_activar_foto_v2
BEFORE UPDATE OF estado ON public.totvs_mayor_cargas
FOR EACH ROW WHEN (NEW.estado='COMPLETA' AND OLD.estado IS DISTINCT FROM 'COMPLETA')
EXECUTE FUNCTION public.totvs_mayor_activar_foto_v2();
CREATE UNIQUE INDEX totvs_mayor_una_foto_completa_idx
  ON public.totvs_mayor_cargas ((true)) WHERE estado='COMPLETA';

ALTER TABLE public.totvs_mayor_movimientos
  DROP CONSTRAINT totvs_mayor_movimientos_clave_origen_key;
ALTER TABLE public.totvs_mayor_movimientos
  ADD COLUMN huella_md5 text GENERATED ALWAYS AS (md5(huella_origen)) STORED;
ALTER TABLE public.totvs_mayor_movimientos
  ADD CONSTRAINT totvs_mayor_movimientos_clave_huella_key
    UNIQUE (clave_origen,huella_md5);
CREATE INDEX totvs_mayor_movimientos_clave_idx
  ON public.totvs_mayor_movimientos(clave_origen);

CREATE OR REPLACE FUNCTION public.totvs_importar_mayor_lote_v1(
  p_carga_id uuid,p_modo text,p_filas jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_total integer;
  v_unicas integer;
  v_insertadas integer;
  v_sin_cambios integer;
  v_versionadas integer;
  v_contables integer;
  v_descriptivas integer;
  v_importes integer;
  v_cuentas integer;
  v_centros integer;
  v_tipos integer;
  v_conflictos integer;
  v_cuarentena integer;
  v_vinculadas integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(),'admin.importaciones') THEN
    RAISE EXCEPTION 'Sin permiso para importar el Libro Mayor' USING ERRCODE='42501';
  END IF;
  IF p_carga_id IS NULL OR p_modo NOT IN ('validate','import') OR jsonb_typeof(p_filas)<>'array' THEN
    RAISE EXCEPTION 'Carga, modo o filas del Mayor invalidos' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.totvs_mayor_cargas
  WHERE id=p_carga_id AND creado_por=auth.uid() AND estado IN ('VALIDANDO','IMPORTANDO') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Carga del Mayor inexistente, ajena o cerrada' USING ERRCODE='22023'; END IF;
  v_total:=jsonb_array_length(p_filas);
  IF v_total<1 OR v_total>500 THEN
    RAISE EXCEPTION 'Cada lote del Mayor debe contener entre 1 y 500 filas' USING ERRCODE='22023';
  END IF;

  DROP TABLE IF EXISTS pg_temp.mayor_lote;
  CREATE TEMP TABLE mayor_lote ON COMMIT DROP AS
  SELECT * FROM jsonb_to_recordset(p_filas) AS x(
    clave_origen text,huella_origen text,sucursal text,anio_mes text,
    fecha_fuente text,fecha_movimiento date,lote text,sublote text,documento text,linea text,
    importe_pyg numeric,importe_usd numeric,historial text,cuenta_codigo text,
    cuenta_descripcion text,centro_costo text,centro_costo_descripcion text,
    item_contable text,cliente text,origen text,tipo_movimiento text,tipo_saldo text,
    contraparte_codigo text,contraparte_tienda text,documento_asociado text,
    tipo_asiento text,fecha_inclusion text,usuario_nombre text,asiento text,
    es_apertura boolean,archivo_origen text,fila_origen integer,datos_fuente jsonb
  );
  SELECT count(DISTINCT clave_origen) INTO v_unicas FROM mayor_lote;
  IF v_unicas<>v_total THEN
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
      OR es_apertura IS NULL OR nullif(btrim(archivo_origen),'') IS NULL OR fila_origen<2
      OR clave_origen IS DISTINCT FROM concat_ws('|',btrim(sucursal),btrim(fecha_fuente),btrim(lote),btrim(sublote),btrim(documento),btrim(linea))
  ) THEN
    RAISE EXCEPTION 'El lote del Mayor contiene campos obligatorios o clave invalidos' USING ERRCODE='22023';
  END IF;

  -- La huella es identidad de version, no un permiso para sobrescribir.
  -- Una clave puede cambiar entre cargas, pero nunca dos veces dentro de una.
  SELECT count(*) INTO v_conflictos FROM mayor_lote l
  WHERE EXISTS (
    SELECT 1 FROM public.totvs_mayor_carga_movimientos cm
    JOIN public.totvs_mayor_movimientos m ON m.id=cm.movimiento_id
    WHERE cm.carga_id=p_carga_id AND m.clave_origen=l.clave_origen
      AND m.huella_origen<>l.huella_origen
  ) OR EXISTS (
    SELECT 1 FROM public.totvs_mayor_movimientos m
    WHERE m.clave_origen=l.clave_origen
      AND m.huella_md5=md5(l.huella_origen)
      AND m.huella_origen<>l.huella_origen
  );
  SELECT count(*) FILTER (WHERE exacta.id IS NULL),
         count(*) FILTER (WHERE exacta.id IS NOT NULL AND
           (previa.id IS NULL OR previa.huella_origen=l.huella_origen)),
         count(*) FILTER (WHERE previa.id IS NOT NULL AND previa.huella_origen<>l.huella_origen),
         count(*) FILTER (WHERE previa.id IS NOT NULL AND previa.huella_origen<>l.huella_origen
           AND ROW(l.importe_pyg,l.importe_usd,l.cuenta_codigo,l.centro_costo,l.tipo_movimiento,l.tipo_saldo)
             IS DISTINCT FROM ROW(previa.importe_pyg,previa.importe_usd,previa.cuenta_codigo,
               previa.centro_costo,previa.tipo_movimiento,previa.tipo_saldo)),
         count(*) FILTER (WHERE previa.id IS NOT NULL AND previa.huella_origen<>l.huella_origen
           AND ROW(l.importe_pyg,l.importe_usd,l.cuenta_codigo,l.centro_costo,l.tipo_movimiento,l.tipo_saldo)
             IS NOT DISTINCT FROM ROW(previa.importe_pyg,previa.importe_usd,previa.cuenta_codigo,
               previa.centro_costo,previa.tipo_movimiento,previa.tipo_saldo)),
         count(*) FILTER (WHERE previa.id IS NOT NULL AND previa.huella_origen<>l.huella_origen
           AND ROW(l.importe_pyg,l.importe_usd) IS DISTINCT FROM ROW(previa.importe_pyg,previa.importe_usd)),
         count(*) FILTER (WHERE previa.id IS NOT NULL AND previa.huella_origen<>l.huella_origen
           AND l.cuenta_codigo IS DISTINCT FROM previa.cuenta_codigo),
         count(*) FILTER (WHERE previa.id IS NOT NULL AND previa.huella_origen<>l.huella_origen
           AND l.centro_costo IS DISTINCT FROM previa.centro_costo),
         count(*) FILTER (WHERE previa.id IS NOT NULL AND previa.huella_origen<>l.huella_origen
           AND ROW(l.tipo_movimiento,l.tipo_saldo) IS DISTINCT FROM ROW(previa.tipo_movimiento,previa.tipo_saldo)),
         count(*) FILTER (WHERE nullif(btrim(l.cuenta_codigo),'') IS NULL)
  INTO v_insertadas,v_sin_cambios,v_versionadas,v_contables,v_descriptivas,
    v_importes,v_cuentas,v_centros,v_tipos,v_cuarentena
  FROM mayor_lote l
  LEFT JOIN public.totvs_mayor_movimientos exacta
    ON exacta.clave_origen=l.clave_origen AND exacta.huella_origen=l.huella_origen
  LEFT JOIN LATERAL (
    SELECT m.* FROM public.totvs_mayor_movimientos m
    JOIN public.totvs_mayor_carga_movimientos cm ON cm.movimiento_id=m.id
    JOIN public.totvs_mayor_cargas c ON c.id=cm.carga_id
    WHERE m.clave_origen=l.clave_origen AND c.estado='COMPLETA'
    ORDER BY c.completado_en DESC,c.creado_en DESC,c.id DESC LIMIT 1
  ) previa ON true;

  IF p_modo='validate' THEN
    RETURN jsonb_build_object('modo','validate','total',v_total,'insertadas',v_insertadas,
      'sin_cambios',v_sin_cambios,'versionadas',v_versionadas,'cambios_contables',v_contables,
      'cambios_descriptivos',v_descriptivas,'cambios_importe',v_importes,
      'cambios_cuenta',v_cuentas,'cambios_centro',v_centros,'cambios_tipo',v_tipos,
      'conflictos',v_conflictos,
      'cuarentena',v_cuarentena,'escrituras',0);
  END IF;
  IF v_conflictos>0 THEN
    RAISE EXCEPTION '% claves del Mayor tienen dos versiones en la misma carga',v_conflictos
      USING ERRCODE='23505';
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
  FROM mayor_lote ON CONFLICT (clave_origen,huella_md5) DO NOTHING;

  INSERT INTO public.totvs_mayor_carga_movimientos(carga_id,movimiento_id)
  SELECT p_carga_id,m.id FROM mayor_lote l
  JOIN public.totvs_mayor_movimientos m
    ON m.clave_origen=l.clave_origen AND m.huella_origen=l.huella_origen
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_vinculadas=ROW_COUNT;

  INSERT INTO public.totvs_mayor_cuarentena(movimiento_id,motivo)
  SELECT m.id,'CUENTA_VACIA' FROM mayor_lote l
  JOIN public.totvs_mayor_movimientos m
    ON m.clave_origen=l.clave_origen AND m.huella_origen=l.huella_origen
  WHERE nullif(btrim(l.cuenta_codigo),'') IS NULL
  ON CONFLICT (movimiento_id) DO NOTHING;

  UPDATE public.totvs_mayor_cargas c SET
    estado='IMPORTANDO',
    filas_vinculadas=(SELECT count(*) FROM public.totvs_mayor_carga_movimientos cm WHERE cm.carga_id=c.id),
    filas_cuarentena=(SELECT count(*) FROM public.totvs_mayor_carga_movimientos cm
      JOIN public.totvs_mayor_cuarentena q ON q.movimiento_id=cm.movimiento_id WHERE cm.carga_id=c.id)
  WHERE c.id=p_carga_id;
  RETURN jsonb_build_object('modo','import','total',v_total,'insertadas',v_insertadas,
    'sin_cambios',v_sin_cambios,'versionadas',v_versionadas,'cambios_contables',v_contables,
    'cambios_descriptivos',v_descriptivas,'cambios_importe',v_importes,
    'cambios_cuenta',v_cuentas,'cambios_centro',v_centros,'cambios_tipo',v_tipos,
    'conflictos',0,'cuarentena',v_cuarentena,
    'vinculadas',v_vinculadas);
END;
$$;

CREATE OR REPLACE VIEW public.totvs_mayor_resumen_agregado AS
WITH clasificacion AS (
  SELECT DISTINCT ON (cuenta_codigo) cuenta_codigo,categoria,subcategoria,estado,version
  FROM public.totvs_mayor_cuentas_clasificacion ORDER BY cuenta_codigo,version DESC
), carga_activa AS (
  SELECT id FROM public.totvs_mayor_cargas WHERE estado='COMPLETA'
  ORDER BY completado_en DESC,creado_en DESC,id DESC LIMIT 1
), movimientos_elegibles AS (
  SELECT DISTINCT cm.movimiento_id FROM public.totvs_mayor_carga_movimientos cm
  JOIN carga_activa c ON c.id=cm.carga_id
)
SELECT date_trunc('month',m.fecha_movimiento)::date periodo,m.sucursal,m.centro_costo,m.tipo_saldo,m.es_apertura,
  m.cuenta_codigo,m.cuenta_descripcion,coalesce(cl.estado,'SIN_MAPEO') clasificacion_estado,
  cl.categoria,cl.subcategoria,cl.version clasificacion_version,
  coalesce(pe.estado,'SIN_CONFIRMAR') periodo_estado,
  count(*)::integer filas,sum(m.importe_pyg) importe_pyg,sum(m.importe_usd) importe_usd,
  sum(abs(m.importe_pyg)) importe_absoluto_pyg,sum(abs(m.importe_usd)) importe_absoluto_usd,
  sum(abs(m.importe_pyg)) FILTER (WHERE coalesce(cl.estado,'SIN_MAPEO')<>'CLARA') importe_excluido_pyg,
  sum(abs(m.importe_usd)) FILTER (WHERE coalesce(cl.estado,'SIN_MAPEO')<>'CLARA') importe_excluido_usd,
  count(*) FILTER (WHERE q.movimiento_id IS NOT NULL)::integer filas_cuarentena
FROM movimientos_elegibles me
JOIN public.totvs_mayor_movimientos m ON m.id=me.movimiento_id
LEFT JOIN clasificacion cl ON cl.cuenta_codigo=m.cuenta_codigo
LEFT JOIN public.totvs_mayor_periodos_estado pe ON pe.periodo=date_trunc('month',m.fecha_movimiento)::date
LEFT JOIN public.totvs_mayor_cuarentena q ON q.movimiento_id=m.id AND NOT q.resuelta
GROUP BY 1,2,3,4,5,6,7,8,9,10,11,pe.estado;

COMMENT ON VIEW public.totvs_mayor_resumen_agregado IS
  'Agregado de la ultima carga completa conciliada; conserva las fotos anteriores solo para auditoria.';
NOTIFY pgrst,'reload schema';
COMMIT;
