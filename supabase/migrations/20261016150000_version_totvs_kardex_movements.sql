BEGIN;

DO $$
BEGIN
  IF md5(pg_get_functiondef('public.totvs_importar_kardex_lote_v1(uuid,jsonb)'::regprocedure))
     <> 'a6d52f1e8d9600586e71048219f90521' THEN
    RAISE EXCEPTION 'La función Kardex activa cambió desde la revisión auditada; no se reemplaza a ciegas'
      USING ERRCODE='55000';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.totvs_kardex_importador_versiones (
  version text PRIMARY KEY,
  definicion_rpc text NOT NULL,
  guardado_en timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.totvs_kardex_importador_versiones(version, definicion_rpc)
SELECT '20261016150000_anterior', pg_get_functiondef('public.totvs_importar_kardex_lote_v1(uuid,jsonb)'::regprocedure)
ON CONFLICT (version) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.totvs_kardex_movimientos_versiones (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  movimiento_id uuid NOT NULL REFERENCES public.totvs_kardex_movimientos(id) ON DELETE RESTRICT,
  carga_id uuid NOT NULL,
  tabla_origen text NOT NULL,
  recno_origen text NOT NULL,
  version_anterior jsonb NOT NULL,
  version_nueva jsonb NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (movimiento_id, carga_id)
);
CREATE INDEX IF NOT EXISTS totvs_kardex_movimientos_versiones_clave_idx
  ON public.totvs_kardex_movimientos_versiones(tabla_origen, recno_origen, creado_en DESC);
ALTER TABLE public.totvs_kardex_movimientos_versiones ENABLE ROW LEVEL SECURITY;
CREATE POLICY totvs_kardex_versiones_admin ON public.totvs_kardex_movimientos_versiones
  FOR SELECT TO authenticated USING (public.has_section_access(auth.uid(), 'admin.importaciones'));
REVOKE ALL ON public.totvs_kardex_movimientos_versiones FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.totvs_kardex_movimientos_versiones TO authenticated;
CREATE OR REPLACE FUNCTION public.totvs_importar_kardex_lote_v1(
  p_carga_id uuid,
  p_filas jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_total integer;
  v_unicas integer;
  v_insertadas integer;
  v_actualizadas integer;
  v_sin_cambios integer;
  v_esperadas integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(), 'admin.importaciones') THEN
    RAISE EXCEPTION 'Sin permiso para importar datos de TOTVS' USING ERRCODE='42501';
  END IF;
  IF p_carga_id IS NULL OR p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' THEN
    RAISE EXCEPTION 'Carga o filas de Kardex inv\u00e1lidas' USING ERRCODE='22023';
  END IF;

  v_total := jsonb_array_length(p_filas);
  IF v_total < 1 OR v_total > 500 THEN
    RAISE EXCEPTION 'Cada lote de Kardex debe contener entre 1 y 500 filas' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('totvs_importar_kardex_lote_v1', 0));

  DROP TABLE IF EXISTS pg_temp.kardex_lote;
  CREATE TEMP TABLE kardex_lote ON COMMIT DROP AS
  SELECT *
  FROM jsonb_to_recordset(p_filas) AS x(
    tabla_origen text,
    recno_origen text,
    fecha_movimiento date,
    filial text,
    deposito text,
    deposito_descripcion text,
    producto_codigo text,
    producto_descripcion text,
    cantidad numeric,
    costo_unitario_gs numeric,
    costo_unitario_moneda_2 numeric,
    costo_unitario_moneda_3 numeric,
    costo_total_gs numeric,
    costo_total_moneda_2 numeric,
    costo_total_moneda_3 numeric,
    movimiento_detalle text,
    especie_documento text,
    documento text,
    secuencia text,
    moneda_codigo text,
    tipo_cambio numeric,
    direccion text,
    serie text,
    contraparte_codigo text,
    contraparte_tienda text,
    grupo_producto text,
    cuenta_contable text,
    archivo_origen text,
    fila_origen integer,
    huella_origen text,
    datos_fuente jsonb
  );

  SELECT count(DISTINCT (upper(btrim(tabla_origen)), btrim(recno_origen)))
  INTO v_unicas FROM kardex_lote;
  IF v_unicas <> v_total THEN
    RAISE EXCEPTION 'El lote de Kardex contiene claves TABLA + RECNO duplicadas' USING ERRCODE='23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM kardex_lote
    WHERE nullif(btrim(tabla_origen),'') IS NULL
       OR nullif(btrim(recno_origen),'') IS NULL
       OR fecha_movimiento IS NULL
       OR nullif(btrim(filial),'') IS NULL
       OR nullif(btrim(deposito),'') IS NULL
       OR nullif(btrim(producto_codigo),'') IS NULL
       OR direccion IS NULL OR direccion NOT IN ('E','S')
       OR (NOT (upper(btrim(tabla_origen))='SB9' AND direccion='E')
           AND (nullif(btrim(documento),'') IS NULL OR nullif(btrim(especie_documento),'') IS NULL))
       OR nullif(btrim(secuencia),'') IS NULL
       OR nullif(btrim(huella_origen),'') IS NULL
  ) THEN
    RAISE EXCEPTION 'El lote de Kardex contiene campos obligatorios inv\u00e1lidos' USING ERRCODE='22023';
  END IF;

  SELECT count(*) FILTER (WHERE actual.tabla_origen IS NULL),
         count(*) FILTER (WHERE actual.tabla_origen IS NOT NULL AND actual.huella_origen IS DISTINCT FROM lote.huella_origen),
         count(*) FILTER (WHERE actual.tabla_origen IS NOT NULL AND actual.huella_origen = lote.huella_origen)
  INTO v_insertadas, v_esperadas, v_sin_cambios
  FROM kardex_lote lote
  LEFT JOIN public.totvs_kardex_movimientos actual
   ON actual.tabla_origen=upper(btrim(lote.tabla_origen))
   AND actual.recno_origen=btrim(lote.recno_origen);

  -- TABLA + RECNO identifica el movimiento; TOTVS puede revisar costos y
  -- descripciones en cortes posteriores. Conservamos ambas versiones.
  DROP TABLE IF EXISTS pg_temp.kardex_versiones_esperadas;
  CREATE TEMP TABLE kardex_versiones_esperadas ON COMMIT DROP AS
  SELECT actual.id, actual.tabla_origen, actual.recno_origen,
         to_jsonb(actual) AS version_anterior
  FROM kardex_lote lote
  JOIN public.totvs_kardex_movimientos actual
    ON actual.tabla_origen=upper(btrim(lote.tabla_origen))
   AND actual.recno_origen=btrim(lote.recno_origen)
  WHERE actual.huella_origen IS DISTINCT FROM lote.huella_origen;
  CREATE UNIQUE INDEX ON kardex_versiones_esperadas(id);

  WITH actualizadas AS (
    UPDATE public.totvs_kardex_movimientos actual
    SET fecha_movimiento=lote.fecha_movimiento,
        filial=btrim(lote.filial),
        deposito=btrim(lote.deposito),
        deposito_descripcion=nullif(btrim(lote.deposito_descripcion),''),
        producto_codigo=btrim(lote.producto_codigo),
        producto_descripcion=nullif(btrim(lote.producto_descripcion),''),
        cantidad=lote.cantidad,
        costo_unitario_gs=coalesce(lote.costo_unitario_gs,0),
        costo_unitario_moneda_2=coalesce(lote.costo_unitario_moneda_2,0),
        costo_unitario_moneda_3=coalesce(lote.costo_unitario_moneda_3,0),
        costo_total_gs=coalesce(lote.costo_total_gs,0),
        costo_total_moneda_2=coalesce(lote.costo_total_moneda_2,0),
        costo_total_moneda_3=coalesce(lote.costo_total_moneda_3,0),
        movimiento_detalle=nullif(btrim(lote.movimiento_detalle),''),
        especie_documento=coalesce(upper(btrim(lote.especie_documento)),''),
        documento=coalesce(btrim(lote.documento),''),
        secuencia=btrim(lote.secuencia),
        moneda_codigo=btrim(lote.moneda_codigo),
        tipo_cambio=coalesce(lote.tipo_cambio,0),
        direccion=lote.direccion,
        serie=nullif(btrim(lote.serie),''),
        contraparte_codigo=nullif(btrim(lote.contraparte_codigo),''),
        contraparte_tienda=nullif(btrim(lote.contraparte_tienda),''),
        grupo_producto=nullif(btrim(lote.grupo_producto),''),
        cuenta_contable=nullif(btrim(lote.cuenta_contable),''),
        archivo_origen=lote.archivo_origen,
        fila_origen=lote.fila_origen,
        huella_origen=lote.huella_origen,
        datos_fuente=coalesce(lote.datos_fuente,'{}'::jsonb),
        carga_id=p_carga_id,
        actualizado_en=now()
    FROM kardex_lote lote
    JOIN kardex_versiones_esperadas previa
      ON previa.tabla_origen=upper(btrim(lote.tabla_origen))
     AND previa.recno_origen=btrim(lote.recno_origen)
    WHERE actual.id=previa.id
    RETURNING actual.id, to_jsonb(actual) AS version_nueva
  ), auditadas AS (
    INSERT INTO public.totvs_kardex_movimientos_versiones (
      movimiento_id,carga_id,tabla_origen,recno_origen,version_anterior,version_nueva
    )
    SELECT previa.id,p_carga_id,previa.tabla_origen,previa.recno_origen,
           previa.version_anterior,actualizadas.version_nueva
    FROM actualizadas
    JOIN kardex_versiones_esperadas previa ON previa.id=actualizadas.id
    RETURNING movimiento_id
  )
  SELECT count(*) INTO v_actualizadas FROM auditadas;

  IF v_actualizadas <> v_esperadas THEN
    RAISE EXCEPTION 'La versión Kardex no quedó completa; se revierte el lote'
      USING ERRCODE='P0001';
  END IF;

  WITH insertadas AS (
  INSERT INTO public.totvs_kardex_movimientos (
    tabla_origen,recno_origen,fecha_movimiento,filial,deposito,deposito_descripcion,
    producto_codigo,producto_descripcion,cantidad,costo_unitario_gs,costo_unitario_moneda_2,
    costo_unitario_moneda_3,costo_total_gs,costo_total_moneda_2,costo_total_moneda_3,
    movimiento_detalle,especie_documento,documento,secuencia,moneda_codigo,tipo_cambio,
    direccion,serie,contraparte_codigo,contraparte_tienda,grupo_producto,cuenta_contable,
    archivo_origen,fila_origen,huella_origen,datos_fuente,carga_id
  )
  SELECT
    upper(btrim(tabla_origen)),btrim(recno_origen),fecha_movimiento,btrim(filial),btrim(deposito),
    nullif(btrim(deposito_descripcion),''),btrim(producto_codigo),nullif(btrim(producto_descripcion),''),
    cantidad,coalesce(costo_unitario_gs,0),coalesce(costo_unitario_moneda_2,0),
    coalesce(costo_unitario_moneda_3,0),coalesce(costo_total_gs,0),
    coalesce(costo_total_moneda_2,0),coalesce(costo_total_moneda_3,0),
    nullif(btrim(movimiento_detalle),''),coalesce(upper(btrim(especie_documento)),''),coalesce(btrim(documento),''),
    btrim(secuencia),btrim(moneda_codigo),coalesce(tipo_cambio,0),direccion,
    nullif(btrim(serie),''),nullif(btrim(contraparte_codigo),''),nullif(btrim(contraparte_tienda),''),
    nullif(btrim(grupo_producto),''),nullif(btrim(cuenta_contable),''),archivo_origen,fila_origen,
    huella_origen,coalesce(datos_fuente,'{}'::jsonb),p_carga_id
  FROM kardex_lote
  ON CONFLICT (tabla_origen,recno_origen) DO NOTHING
  RETURNING id
  ) SELECT count(*) INTO v_esperadas FROM insertadas;

  IF v_esperadas <> v_insertadas THEN
    RAISE EXCEPTION 'Las inserciones Kardex no quedaron completas; se revierte el lote'
      USING ERRCODE='P0001';
  END IF;

  RETURN jsonb_build_object(
    'total',v_total,
    'insertadas',v_insertadas,
    'actualizadas',v_actualizadas,
    'sin_cambios',v_sin_cambios
  );
END;
$$;

COMMIT;
