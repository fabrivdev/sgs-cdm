-- Persistencia idempotente del Kardex anal\u00edtico exportado por TOTVS.
-- Se ejecuta despu\u00e9s de 20260930120000_optimize_machine_order_confirmed_billing.sql.
-- La muestra validada usa TABLA + RECNO como clave estable. Los c\u00f3digos de
-- moneda y las tres bases de costo se conservan sin atribuirles una moneda
-- contable ni tratamiento de IVA que el archivo no declara.

BEGIN;

CREATE TABLE IF NOT EXISTS public.totvs_kardex_movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tabla_origen text NOT NULL,
  recno_origen text NOT NULL,
  fecha_movimiento date NOT NULL,
  filial text NOT NULL,
  deposito text NOT NULL,
  deposito_descripcion text,
  producto_codigo text NOT NULL,
  producto_descripcion text,
  cantidad numeric NOT NULL,
  costo_unitario_gs numeric NOT NULL DEFAULT 0,
  costo_unitario_moneda_2 numeric NOT NULL DEFAULT 0,
  costo_unitario_moneda_3 numeric NOT NULL DEFAULT 0,
  costo_total_gs numeric NOT NULL DEFAULT 0,
  costo_total_moneda_2 numeric NOT NULL DEFAULT 0,
  costo_total_moneda_3 numeric NOT NULL DEFAULT 0,
  movimiento_detalle text,
  especie_documento text NOT NULL,
  documento text NOT NULL,
  secuencia text NOT NULL,
  moneda_codigo text NOT NULL,
  tipo_cambio numeric NOT NULL DEFAULT 0,
  direccion text NOT NULL CHECK (direccion IN ('E','S')),
  serie text,
  contraparte_codigo text,
  contraparte_tienda text,
  grupo_producto text,
  cuenta_contable text,
  archivo_origen text NOT NULL,
  fila_origen integer NOT NULL CHECK (fila_origen >= 2),
  huella_origen text NOT NULL,
  datos_fuente jsonb NOT NULL DEFAULT '{}'::jsonb,
  carga_id uuid NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tabla_origen, recno_origen)
);

CREATE INDEX IF NOT EXISTS totvs_kardex_fecha_idx
  ON public.totvs_kardex_movimientos(fecha_movimiento);
CREATE INDEX IF NOT EXISTS totvs_kardex_producto_idx
  ON public.totvs_kardex_movimientos(producto_codigo, fecha_movimiento);
CREATE INDEX IF NOT EXISTS totvs_kardex_documento_idx
  ON public.totvs_kardex_movimientos(filial, documento, secuencia, producto_codigo);

ALTER TABLE public.totvs_kardex_movimientos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS totvs_kardex_select ON public.totvs_kardex_movimientos;
CREATE POLICY totvs_kardex_select ON public.totvs_kardex_movimientos
FOR SELECT TO authenticated
USING (
  public.has_section_access(auth.uid(), 'admin.importaciones')
  OR public.has_module_access(auth.uid(), 'parque')
  OR public.has_module_access(auth.uid(), 'repuestos')
);

REVOKE ALL ON TABLE public.totvs_kardex_movimientos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.totvs_kardex_movimientos TO authenticated;

CREATE OR REPLACE FUNCTION public.totvs_importar_kardex_lote_v1(
  p_carga_id uuid,
  p_filas jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total integer;
  v_unicas integer;
  v_insertadas integer;
  v_actualizadas integer;
  v_sin_cambios integer;
  v_conflictos integer;
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
       OR direccion NOT IN ('E','S')
       OR nullif(btrim(documento),'') IS NULL
       OR nullif(btrim(secuencia),'') IS NULL
       OR nullif(btrim(huella_origen),'') IS NULL
  ) THEN
    RAISE EXCEPTION 'El lote de Kardex contiene campos obligatorios inv\u00e1lidos' USING ERRCODE='22023';
  END IF;

  SELECT count(*) FILTER (WHERE actual.tabla_origen IS NULL),
         count(*) FILTER (WHERE actual.tabla_origen IS NOT NULL AND actual.huella_origen IS DISTINCT FROM lote.huella_origen),
         count(*) FILTER (WHERE actual.tabla_origen IS NOT NULL AND actual.huella_origen = lote.huella_origen)
  INTO v_insertadas, v_conflictos, v_sin_cambios
  FROM kardex_lote lote
  LEFT JOIN public.totvs_kardex_movimientos actual
   ON actual.tabla_origen=upper(btrim(lote.tabla_origen))
   AND actual.recno_origen=btrim(lote.recno_origen);

  IF v_conflictos > 0 THEN
    RAISE EXCEPTION '% claves TABLA + RECNO ya existen con otra huella; no se sobrescribi\u00f3 ninguna versi\u00f3n', v_conflictos
      USING ERRCODE='23505';
  END IF;
  v_actualizadas := 0;

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
    nullif(btrim(movimiento_detalle),''),upper(btrim(especie_documento)),btrim(documento),
    btrim(secuencia),btrim(moneda_codigo),coalesce(tipo_cambio,0),direccion,
    nullif(btrim(serie),''),nullif(btrim(contraparte_codigo),''),nullif(btrim(contraparte_tienda),''),
    nullif(btrim(grupo_producto),''),nullif(btrim(cuenta_contable),''),archivo_origen,fila_origen,
    huella_origen,coalesce(datos_fuente,'{}'::jsonb),p_carga_id
  FROM kardex_lote
  ON CONFLICT (tabla_origen,recno_origen) DO NOTHING;

  RETURN jsonb_build_object(
    'total',v_total,
    'insertadas',v_insertadas,
    'actualizadas',v_actualizadas,
    'sin_cambios',v_sin_cambios
  );
END;
$$;

REVOKE ALL ON FUNCTION public.totvs_importar_kardex_lote_v1(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.totvs_importar_kardex_lote_v1(uuid,jsonb) TO authenticated;

COMMENT ON TABLE public.totvs_kardex_movimientos IS
  'Movimientos del Kardex anal\u00edtico TOTVS al grano TABLA + RECNO; conserva c\u00f3digos monetarios y costos crudos sin inferir IVA.';
COMMENT ON FUNCTION public.totvs_importar_kardex_lote_v1(uuid,jsonb) IS
  'Carga idempotente de Kardex; rechaza una huella distinta para una clave existente hasta definir autoridad/versionado.';

NOTIFY pgrst, 'reload schema';

COMMIT;
