-- Snapshot fiel e idempotente de Cuentas por Cobrar a la Fecha (TOTVS SpreadsheetML).
-- Archivo preparado para revisión: agregarlo al repo NO lo aplica a ninguna base.
-- Mora usa el SALDO actual de NF USD; NCC y RA se conservan separados y no se descuentan nuevamente.

BEGIN;

CREATE TABLE public.totvs_cxc_cargas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  archivo_nombre text NOT NULL,
  archivo_sha256 text NOT NULL UNIQUE CHECK (archivo_sha256 ~ '^[0-9a-f]{64}$'),
  archivo_tamano bigint NOT NULL CHECK (archivo_tamano > 0),
  fecha_corte date NOT NULL,
  snapshot_version integer NOT NULL CHECK (snapshot_version >= 1),
  reemplaza_carga_id uuid REFERENCES public.totvs_cxc_cargas(id),
  corte_evidencia text NOT NULL CHECK (corte_evidencia='USER_CONFIRMED'),
  estado text NOT NULL DEFAULT 'VALIDANDO' CHECK (estado IN ('VALIDANDO','IMPORTANDO','COMPLETA','CONFLICTO','CANCELADA')),
  filas_documento integer NOT NULL DEFAULT 0 CHECK (filas_documento >= 0),
  filas_saldo_positivo integer NOT NULL DEFAULT 0 CHECK (filas_saldo_positivo >= 0),
  filas_saldo_cero integer NOT NULL DEFAULT 0 CHECK (filas_saldo_cero >= 0),
  filas_saldo_negativo integer NOT NULL DEFAULT 0 CHECK (filas_saldo_negativo >= 0),
  valor_bruto numeric(24,2) NOT NULL DEFAULT 0,
  saldo_neto_fuente numeric(24,2) NOT NULL DEFAULT 0,
  saldo_positivo numeric(24,2) NOT NULL DEFAULT 0,
  saldo_negativo numeric(24,2) NOT NULL DEFAULT 0,
  facturas_elegibles integer NOT NULL DEFAULT 0 CHECK (facturas_elegibles >= 0),
  saldo_pendiente_elegible_usd numeric(24,2) NOT NULL DEFAULT 0 CHECK (saldo_pendiente_elegible_usd >= 0),
  facturas_vencidas integer NOT NULL DEFAULT 0 CHECK (facturas_vencidas >= 0),
  saldo_vencido_usd numeric(24,2) NOT NULL DEFAULT 0 CHECK (saldo_vencido_usd >= 0),
  facturas_vence_hoy integer NOT NULL DEFAULT 0 CHECK (facturas_vence_hoy >= 0),
  saldo_vence_hoy_usd numeric(24,2) NOT NULL DEFAULT 0 CHECK (saldo_vence_hoy_usd >= 0),
  facturas_futuras integer NOT NULL DEFAULT 0 CHECK (facturas_futuras >= 0),
  saldo_futuro_usd numeric(24,2) NOT NULL DEFAULT 0 CHECK (saldo_futuro_usd >= 0),
  positivos_no_factura integer NOT NULL DEFAULT 0 CHECK (positivos_no_factura >= 0),
  saldo_positivo_no_factura_usd numeric(24,2) NOT NULL DEFAULT 0 CHECK (saldo_positivo_no_factura_usd >= 0),
  anticipos_cliente integer NOT NULL DEFAULT 0 CHECK (anticipos_cliente >= 0),
  saldo_anticipos_cliente_usd numeric(24,2) NOT NULL DEFAULT 0,
  anticipos_cliente_saldo_positivo integer NOT NULL DEFAULT 0 CHECK (anticipos_cliente_saldo_positivo >= 0),
  saldo_anticipos_positivo_usd numeric(24,2) NOT NULL DEFAULT 0 CHECK (saldo_anticipos_positivo_usd >= 0),
  anticipos_cliente_saldo_cero integer NOT NULL DEFAULT 0 CHECK (anticipos_cliente_saldo_cero >= 0),
  anticipos_cliente_saldo_negativo integer NOT NULL DEFAULT 0 CHECK (anticipos_cliente_saldo_negativo >= 0),
  saldo_anticipos_negativo_usd numeric(24,2) NOT NULL DEFAULT 0 CHECK (saldo_anticipos_negativo_usd <= 0),
  anticipos_cliente_vinculados integer NOT NULL DEFAULT 0 CHECK (anticipos_cliente_vinculados = 0),
  cobertura_aplicacion_anticipos text NOT NULL DEFAULT 'SIN_VINCULO_EXPLICITO'
    CHECK (cobertura_aplicacion_anticipos='SIN_VINCULO_EXPLICITO'),
  creado_por uuid NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  completado_en timestamptz,
  cancelado_en timestamptz
);

CREATE TABLE public.totvs_cxc_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave_origen text NOT NULL,
  huella_origen text NOT NULL,
  snapshot_sha256 text NOT NULL CHECK (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  fecha_corte date NOT NULL,
  sucursal text NOT NULL,
  documento text NOT NULL,
  tipo_documento text NOT NULL,
  naturaleza_documento text NOT NULL CHECK (naturaleza_documento IN ('INVOICE','CUSTOMER_CREDIT_NOTE','CUSTOMER_ADVANCE','OTHER')),
  serie text NOT NULL,
  cuota text,
  fecha_emision date NOT NULL,
  fecha_vencimiento date NOT NULL,
  fecha_vencimiento_original date,
  valor_original numeric(24,2) NOT NULL,
  saldo_pendiente numeric(24,2) NOT NULL,
  moneda_codigo text NOT NULL CHECK (moneda_codigo IN ('1','2','3')),
  moneda text NOT NULL CHECK (moneda IN ('PYG','USD','EUR')),
  tasa_moneda numeric(24,8) NOT NULL CHECK (tasa_moneda >= 0),
  modalidad text NOT NULL,
  cliente_codigo text NOT NULL,
  cliente_nombre text NOT NULL,
  asesor text NOT NULL,
  condicion text NOT NULL,
  elegible_kpi boolean NOT NULL,
  archivo_origen text NOT NULL,
  fila_origen integer NOT NULL CHECK (fila_origen >= 2),
  datos_fuente jsonb NOT NULL DEFAULT '{}'::jsonb,
  primera_carga_id uuid NOT NULL REFERENCES public.totvs_cxc_cargas(id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (moneda_codigo='2' AND moneda='USD'),
  CHECK (naturaleza_documento = CASE tipo_documento WHEN 'NF' THEN 'INVOICE' WHEN 'NCC' THEN 'CUSTOMER_CREDIT_NOTE' WHEN 'RA' THEN 'CUSTOMER_ADVANCE' ELSE 'OTHER' END),
  CHECK (elegible_kpi = (moneda='USD' AND tipo_documento='NF' AND saldo_pendiente>0)),
  UNIQUE (snapshot_sha256, clave_origen)
);

CREATE TABLE public.totvs_cxc_carga_documentos (
  carga_id uuid NOT NULL REFERENCES public.totvs_cxc_cargas(id) ON DELETE CASCADE,
  documento_id uuid NOT NULL REFERENCES public.totvs_cxc_documentos(id) ON DELETE CASCADE,
  PRIMARY KEY (carga_id, documento_id)
);

CREATE INDEX totvs_cxc_cargas_corte_idx ON public.totvs_cxc_cargas(fecha_corte DESC, snapshot_version DESC) WHERE estado='COMPLETA';
CREATE INDEX totvs_cxc_documentos_corte_vencimiento_idx ON public.totvs_cxc_documentos(fecha_corte, moneda, elegible_kpi, fecha_vencimiento);
CREATE INDEX totvs_cxc_documentos_cliente_idx ON public.totvs_cxc_documentos(fecha_corte, cliente_codigo);
CREATE INDEX totvs_cxc_documentos_sucursal_idx ON public.totvs_cxc_documentos(fecha_corte, sucursal);
CREATE INDEX totvs_cxc_carga_documentos_documento_idx ON public.totvs_cxc_carga_documentos(documento_id);

ALTER TABLE public.totvs_cxc_cargas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.totvs_cxc_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.totvs_cxc_carga_documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY totvs_cxc_cargas_admin ON public.totvs_cxc_cargas FOR SELECT TO authenticated
USING (public.has_section_access(auth.uid(), 'admin.importaciones'));
CREATE POLICY totvs_cxc_documentos_admin ON public.totvs_cxc_documentos FOR SELECT TO authenticated
USING (public.has_section_access(auth.uid(), 'admin.importaciones'));
CREATE POLICY totvs_cxc_carga_documentos_admin ON public.totvs_cxc_carga_documentos FOR SELECT TO authenticated
USING (public.has_section_access(auth.uid(), 'admin.importaciones'));

REVOKE ALL ON TABLE public.totvs_cxc_cargas, public.totvs_cxc_documentos, public.totvs_cxc_carga_documentos
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.totvs_cxc_cargas, public.totvs_cxc_documentos, public.totvs_cxc_carga_documentos
TO authenticated;

CREATE OR REPLACE FUNCTION public.totvs_iniciar_cxc_carga_v1(p_metadata jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_carga public.totvs_cxc_cargas%ROWTYPE; v_version integer; v_reemplaza uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(), 'admin.importaciones') THEN
    RAISE EXCEPTION 'Sin permiso para importar cuentas por cobrar' USING ERRCODE='42501';
  END IF;
  IF p_metadata IS NULL
    OR nullif(btrim(p_metadata->>'archivo_nombre'),'') IS NULL
    OR coalesce(p_metadata->>'archivo_sha256','') !~ '^[0-9a-f]{64}$'
    OR coalesce((p_metadata->>'archivo_tamano')::bigint,0) <= 0
    OR nullif(p_metadata->>'fecha_corte','') IS NULL
    OR p_metadata->>'corte_evidencia'<>'USER_CONFIRMED' THEN
    RAISE EXCEPTION 'Metadata de cuentas por cobrar inválida' USING ERRCODE='22023';
  END IF;
  LOCK TABLE public.totvs_cxc_cargas IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO v_carga FROM public.totvs_cxc_cargas
  WHERE archivo_sha256=p_metadata->>'archivo_sha256';
  IF FOUND THEN
    IF v_carga.fecha_corte IS DISTINCT FROM (p_metadata->>'fecha_corte')::date THEN
      RAISE EXCEPTION 'El mismo archivo ya fue identificado con otro corte' USING ERRCODE='23514';
    END IF;
    IF v_carga.creado_por IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'El mismo snapshot pertenece a otra carga/usuario' USING ERRCODE='42501';
    END IF;
    IF v_carga.estado IN ('CANCELADA','CONFLICTO') THEN
      UPDATE public.totvs_cxc_cargas SET estado='VALIDANDO',cancelado_en=NULL,completado_en=NULL
      WHERE id=v_carga.id RETURNING * INTO v_carga;
    END IF;
    RETURN jsonb_build_object('carga_id',v_carga.id,'estado',v_carga.estado,'reutilizada',true,
      'snapshot_version',v_carga.snapshot_version,'reemplaza_carga_id',v_carga.reemplaza_carga_id);
  END IF;
  SELECT coalesce(max(snapshot_version),0)+1 INTO v_version FROM public.totvs_cxc_cargas
  WHERE fecha_corte=(p_metadata->>'fecha_corte')::date;
  SELECT id INTO v_reemplaza FROM public.totvs_cxc_cargas
  WHERE fecha_corte=(p_metadata->>'fecha_corte')::date AND estado='COMPLETA'
  ORDER BY snapshot_version DESC LIMIT 1;
  INSERT INTO public.totvs_cxc_cargas(archivo_nombre,archivo_sha256,archivo_tamano,fecha_corte,snapshot_version,
    reemplaza_carga_id,corte_evidencia,creado_por)
  VALUES (btrim(p_metadata->>'archivo_nombre'),p_metadata->>'archivo_sha256',(p_metadata->>'archivo_tamano')::bigint,
    (p_metadata->>'fecha_corte')::date,v_version,v_reemplaza,p_metadata->>'corte_evidencia',auth.uid()) RETURNING * INTO v_carga;
  RETURN jsonb_build_object('carga_id',v_carga.id,'estado',v_carga.estado,'reutilizada',false,
    'snapshot_version',v_carga.snapshot_version,'reemplaza_carga_id',v_carga.reemplaza_carga_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.totvs_importar_cxc_lote_v1(p_carga_id uuid,p_modo text,p_filas jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_carga public.totvs_cxc_cargas%ROWTYPE;
  v_total integer;
  v_unicas integer;
  v_insertadas integer;
  v_sin_cambios integer;
  v_conflictos integer;
  v_vinculadas integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(), 'admin.importaciones') THEN
    RAISE EXCEPTION 'Sin permiso para importar cuentas por cobrar' USING ERRCODE='42501';
  END IF;
  IF p_carga_id IS NULL OR p_modo NOT IN ('validate','import') OR jsonb_typeof(p_filas)<>'array' THEN
    RAISE EXCEPTION 'Carga, modo o filas de cuentas por cobrar inválidos' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_carga FROM public.totvs_cxc_cargas
  WHERE id=p_carga_id AND creado_por=auth.uid() AND estado IN ('VALIDANDO','IMPORTANDO') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Carga de cuentas por cobrar inexistente, ajena o cerrada' USING ERRCODE='22023'; END IF;

  v_total:=jsonb_array_length(p_filas);
  IF v_total<1 OR v_total>500 THEN RAISE EXCEPTION 'Cada lote debe contener entre 1 y 500 filas' USING ERRCODE='22023'; END IF;

  DROP TABLE IF EXISTS pg_temp.cxc_lote;
  CREATE TEMP TABLE cxc_lote ON COMMIT DROP AS
  SELECT * FROM jsonb_to_recordset(p_filas) AS x(
    clave_origen text,huella_origen text,fecha_corte date,sucursal text,documento text,tipo_documento text,naturaleza_documento text,
    serie text,cuota text,fecha_emision date,fecha_vencimiento date,fecha_vencimiento_original date,
    valor_original numeric,saldo_pendiente numeric,moneda_codigo text,moneda text,tasa_moneda numeric,
    modalidad text,cliente_codigo text,cliente_nombre text,asesor text,condicion text,elegible_kpi boolean,
    archivo_origen text,fila_origen integer,datos_fuente jsonb
  );

  SELECT count(DISTINCT clave_origen) INTO v_unicas FROM cxc_lote;
  IF v_unicas<>v_total THEN RAISE EXCEPTION 'El lote contiene claves repetidas' USING ERRCODE='23505'; END IF;
  IF EXISTS (
    SELECT 1 FROM cxc_lote
    WHERE nullif(btrim(clave_origen),'') IS NULL OR nullif(btrim(huella_origen),'') IS NULL
      OR fecha_corte IS DISTINCT FROM v_carga.fecha_corte OR nullif(btrim(sucursal),'') IS NULL
      OR nullif(btrim(documento),'') IS NULL OR nullif(btrim(tipo_documento),'') IS NULL
      OR naturaleza_documento IS DISTINCT FROM CASE tipo_documento WHEN 'NF' THEN 'INVOICE' WHEN 'NCC' THEN 'CUSTOMER_CREDIT_NOTE' WHEN 'RA' THEN 'CUSTOMER_ADVANCE' ELSE 'OTHER' END
      OR nullif(btrim(serie),'') IS NULL OR fecha_emision IS NULL OR fecha_vencimiento IS NULL
      OR valor_original IS NULL OR saldo_pendiente IS NULL OR moneda_codigo IS DISTINCT FROM '2'
      OR moneda IS DISTINCT FROM 'USD'
      OR tasa_moneda IS NULL OR tasa_moneda<0 OR nullif(btrim(modalidad),'') IS NULL
      OR nullif(btrim(cliente_codigo),'') IS NULL OR nullif(btrim(cliente_nombre),'') IS NULL
      OR nullif(btrim(asesor),'') IS NULL OR nullif(btrim(condicion),'') IS NULL
      OR elegible_kpi IS DISTINCT FROM (moneda='USD' AND tipo_documento='NF' AND saldo_pendiente>0)
      OR nullif(btrim(archivo_origen),'') IS NULL OR fila_origen<2
      OR clave_origen IS DISTINCT FROM concat_ws('|',fecha_corte::text,btrim(sucursal),btrim(tipo_documento),
        btrim(serie),btrim(documento),coalesce(btrim(cuota),''),btrim(cliente_codigo))
  ) THEN RAISE EXCEPTION 'El lote contiene campos, moneda, elegibilidad o clave inválidos' USING ERRCODE='22023'; END IF;

  SELECT count(*) FILTER (WHERE actual.id IS NULL),
    count(*) FILTER (WHERE actual.id IS NOT NULL AND actual.huella_origen=lote.huella_origen),
    count(*) FILTER (WHERE actual.id IS NOT NULL AND actual.huella_origen IS DISTINCT FROM lote.huella_origen)
  INTO v_insertadas,v_sin_cambios,v_conflictos
  FROM cxc_lote lote LEFT JOIN public.totvs_cxc_documentos actual
    ON actual.snapshot_sha256=v_carga.archivo_sha256 AND actual.clave_origen=lote.clave_origen;

  IF p_modo='validate' THEN
    RETURN jsonb_build_object('modo','validate','total',v_total,'insertadas',v_insertadas,'sin_cambios',v_sin_cambios,'conflictos',v_conflictos,'escrituras',0);
  END IF;
  IF v_conflictos>0 THEN
    UPDATE public.totvs_cxc_cargas SET estado='CONFLICTO' WHERE id=p_carga_id;
    RAISE EXCEPTION '% claves del mismo corte ya existen con otra huella',v_conflictos USING ERRCODE='23505';
  END IF;

  INSERT INTO public.totvs_cxc_documentos(
    clave_origen,huella_origen,snapshot_sha256,fecha_corte,sucursal,documento,tipo_documento,naturaleza_documento,serie,cuota,fecha_emision,
    fecha_vencimiento,fecha_vencimiento_original,valor_original,saldo_pendiente,moneda_codigo,moneda,
    tasa_moneda,modalidad,cliente_codigo,cliente_nombre,asesor,condicion,elegible_kpi,archivo_origen,
    fila_origen,datos_fuente,primera_carga_id
  ) SELECT clave_origen,huella_origen,v_carga.archivo_sha256,fecha_corte,btrim(sucursal),btrim(documento),btrim(tipo_documento),naturaleza_documento,btrim(serie),
    nullif(btrim(cuota),''),fecha_emision,fecha_vencimiento,fecha_vencimiento_original,valor_original,saldo_pendiente,
    moneda_codigo,moneda,tasa_moneda,btrim(modalidad),btrim(cliente_codigo),btrim(cliente_nombre),btrim(asesor),
    btrim(condicion),elegible_kpi,btrim(archivo_origen),fila_origen,coalesce(datos_fuente,'{}'::jsonb),p_carga_id
  FROM cxc_lote ON CONFLICT (snapshot_sha256,clave_origen) DO NOTHING;

  INSERT INTO public.totvs_cxc_carga_documentos(carga_id,documento_id)
  SELECT p_carga_id,d.id FROM cxc_lote lote JOIN public.totvs_cxc_documentos d
    ON d.snapshot_sha256=v_carga.archivo_sha256 AND d.clave_origen=lote.clave_origen AND d.huella_origen=lote.huella_origen
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_vinculadas=ROW_COUNT;
  UPDATE public.totvs_cxc_cargas SET estado='IMPORTANDO' WHERE id=p_carga_id;
  RETURN jsonb_build_object('modo','import','total',v_total,'insertadas',v_insertadas,'sin_cambios',v_sin_cambios,'conflictos',0,'vinculadas',v_vinculadas);
END;
$$;

CREATE OR REPLACE FUNCTION public.totvs_finalizar_cxc_carga_v1(p_carga_id uuid,p_control jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(), 'admin.importaciones') THEN
    RAISE EXCEPTION 'Sin permiso para finalizar cuentas por cobrar' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.totvs_cxc_cargas WHERE id=p_carga_id AND creado_por=auth.uid() AND estado IN ('VALIDANDO','IMPORTANDO') FOR UPDATE;
  IF NOT FOUND OR p_control IS NULL THEN RAISE EXCEPTION 'Carga o control inválido' USING ERRCODE='22023'; END IF;

  SELECT c.fecha_corte,
    count(*)::integer documentos,
    count(*) FILTER (WHERE d.saldo_pendiente>0)::integer filas_positivas,
    count(*) FILTER (WHERE d.saldo_pendiente=0)::integer filas_cero,
    count(*) FILTER (WHERE d.saldo_pendiente<0)::integer filas_negativas,
    coalesce(sum(d.valor_original),0) valor_bruto,coalesce(sum(d.saldo_pendiente),0) saldo_neto,
    coalesce(sum(d.saldo_pendiente) FILTER (WHERE d.saldo_pendiente>0),0) saldo_positivo,
    coalesce(sum(d.saldo_pendiente) FILTER (WHERE d.saldo_pendiente<0),0) saldo_negativo,
    count(*) FILTER (WHERE d.elegible_kpi)::integer elegibles,
    coalesce(sum(d.saldo_pendiente) FILTER (WHERE d.elegible_kpi),0) pendiente_elegible,
    count(*) FILTER (WHERE d.elegible_kpi AND d.fecha_vencimiento<c.fecha_corte)::integer vencidas,
    coalesce(sum(d.saldo_pendiente) FILTER (WHERE d.elegible_kpi AND d.fecha_vencimiento<c.fecha_corte),0) saldo_vencido,
    count(*) FILTER (WHERE d.elegible_kpi AND d.fecha_vencimiento=c.fecha_corte)::integer vence_hoy,
    coalesce(sum(d.saldo_pendiente) FILTER (WHERE d.elegible_kpi AND d.fecha_vencimiento=c.fecha_corte),0) saldo_vence_hoy,
    count(*) FILTER (WHERE d.elegible_kpi AND d.fecha_vencimiento>c.fecha_corte)::integer futuras,
    coalesce(sum(d.saldo_pendiente) FILTER (WHERE d.elegible_kpi AND d.fecha_vencimiento>c.fecha_corte),0) saldo_futuro,
    count(*) FILTER (WHERE d.moneda='USD' AND d.tipo_documento<>'NF' AND d.saldo_pendiente>0)::integer positivos_no_factura,
    coalesce(sum(d.saldo_pendiente) FILTER (WHERE d.moneda='USD' AND d.tipo_documento<>'NF' AND d.saldo_pendiente>0),0) saldo_positivo_no_factura,
    count(*) FILTER (WHERE d.naturaleza_documento='CUSTOMER_ADVANCE')::integer anticipos,
    coalesce(sum(d.saldo_pendiente) FILTER (WHERE d.naturaleza_documento='CUSTOMER_ADVANCE'),0) saldo_anticipos,
    count(*) FILTER (WHERE d.naturaleza_documento='CUSTOMER_ADVANCE' AND d.saldo_pendiente>0)::integer anticipos_positivos,
    coalesce(sum(d.saldo_pendiente) FILTER (WHERE d.naturaleza_documento='CUSTOMER_ADVANCE' AND d.saldo_pendiente>0),0) saldo_anticipos_positivo,
    count(*) FILTER (WHERE d.naturaleza_documento='CUSTOMER_ADVANCE' AND d.saldo_pendiente=0)::integer anticipos_cero,
    count(*) FILTER (WHERE d.naturaleza_documento='CUSTOMER_ADVANCE' AND d.saldo_pendiente<0)::integer anticipos_negativos,
    coalesce(sum(d.saldo_pendiente) FILTER (WHERE d.naturaleza_documento='CUSTOMER_ADVANCE' AND d.saldo_pendiente<0),0) saldo_anticipos_negativo
  INTO v FROM public.totvs_cxc_cargas c
  JOIN public.totvs_cxc_carga_documentos cd ON cd.carga_id=c.id
  JOIN public.totvs_cxc_documentos d ON d.id=cd.documento_id WHERE c.id=p_carga_id GROUP BY c.fecha_corte;

  IF v.documentos IS DISTINCT FROM (p_control->>'documentos')::integer
    OR v.filas_positivas IS DISTINCT FROM (p_control->>'filas_saldo_positivo')::integer
    OR v.filas_cero IS DISTINCT FROM (p_control->>'filas_saldo_cero')::integer
    OR v.filas_negativas IS DISTINCT FROM (p_control->>'filas_saldo_negativo')::integer
    OR v.elegibles IS DISTINCT FROM (p_control->>'facturas_elegibles')::integer
    OR v.vencidas IS DISTINCT FROM (p_control->>'facturas_vencidas')::integer
    OR v.vence_hoy IS DISTINCT FROM (p_control->>'facturas_vence_hoy')::integer
    OR v.futuras IS DISTINCT FROM (p_control->>'facturas_futuras')::integer
    OR v.positivos_no_factura IS DISTINCT FROM (p_control->>'positivos_no_factura')::integer
    OR v.anticipos IS DISTINCT FROM (p_control->>'anticipos_cliente')::integer
    OR v.anticipos_positivos IS DISTINCT FROM (p_control->>'anticipos_cliente_saldo_positivo')::integer
    OR v.anticipos_cero IS DISTINCT FROM (p_control->>'anticipos_cliente_saldo_cero')::integer
    OR v.anticipos_negativos IS DISTINCT FROM (p_control->>'anticipos_cliente_saldo_negativo')::integer
    OR (p_control->>'anticipos_cliente_vinculados')::integer IS DISTINCT FROM 0
    OR p_control->>'cobertura_aplicacion_anticipos' IS DISTINCT FROM 'SIN_VINCULO_EXPLICITO'
    OR abs(v.valor_bruto-(p_control->>'valor_bruto')::numeric)>0.01
    OR abs(v.saldo_neto-(p_control->>'saldo_neto_fuente')::numeric)>0.01
    OR abs(v.saldo_positivo-(p_control->>'saldo_positivo')::numeric)>0.01
    OR abs(v.saldo_negativo-(p_control->>'saldo_negativo')::numeric)>0.01
    OR abs(v.pendiente_elegible-(p_control->>'saldo_pendiente_elegible_usd')::numeric)>0.01
    OR abs(v.saldo_vencido-(p_control->>'saldo_vencido_usd')::numeric)>0.01
    OR abs(v.saldo_vence_hoy-(p_control->>'saldo_vence_hoy_usd')::numeric)>0.01
    OR abs(v.saldo_futuro-(p_control->>'saldo_futuro_usd')::numeric)>0.01
    OR abs(v.saldo_positivo_no_factura-(p_control->>'saldo_positivo_no_factura_usd')::numeric)>0.01
    OR abs(v.saldo_anticipos-(p_control->>'saldo_anticipos_cliente_usd')::numeric)>0.01
    OR abs(v.saldo_anticipos_positivo-(p_control->>'saldo_anticipos_positivo_usd')::numeric)>0.01
    OR abs(v.saldo_anticipos_negativo-(p_control->>'saldo_anticipos_negativo_usd')::numeric)>0.01 THEN
    RAISE EXCEPTION 'La carga de cuentas por cobrar no concilia con sus controles' USING ERRCODE='23514';
  END IF;

  UPDATE public.totvs_cxc_cargas SET estado='COMPLETA',filas_documento=v.documentos,
    filas_saldo_positivo=v.filas_positivas,filas_saldo_cero=v.filas_cero,filas_saldo_negativo=v.filas_negativas,
    valor_bruto=v.valor_bruto,saldo_neto_fuente=v.saldo_neto,saldo_positivo=v.saldo_positivo,saldo_negativo=v.saldo_negativo,
    facturas_elegibles=v.elegibles,saldo_pendiente_elegible_usd=v.pendiente_elegible,
    facturas_vencidas=v.vencidas,saldo_vencido_usd=v.saldo_vencido,
    facturas_vence_hoy=v.vence_hoy,saldo_vence_hoy_usd=v.saldo_vence_hoy,
    facturas_futuras=v.futuras,saldo_futuro_usd=v.saldo_futuro,
    positivos_no_factura=v.positivos_no_factura,saldo_positivo_no_factura_usd=v.saldo_positivo_no_factura,
    anticipos_cliente=v.anticipos,saldo_anticipos_cliente_usd=v.saldo_anticipos,
    anticipos_cliente_saldo_positivo=v.anticipos_positivos,saldo_anticipos_positivo_usd=v.saldo_anticipos_positivo,
    anticipos_cliente_saldo_cero=v.anticipos_cero,anticipos_cliente_saldo_negativo=v.anticipos_negativos,
    saldo_anticipos_negativo_usd=v.saldo_anticipos_negativo,anticipos_cliente_vinculados=0,
    cobertura_aplicacion_anticipos='SIN_VINCULO_EXPLICITO',
    completado_en=now() WHERE id=p_carga_id;
  RETURN jsonb_build_object('carga_id',p_carga_id,'estado','COMPLETA','documentos',v.documentos,'fecha_corte',v.fecha_corte);
END;
$$;

CREATE OR REPLACE FUNCTION public.totvs_cancelar_cxc_carga_v1(p_carga_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(), 'admin.importaciones') THEN
    RAISE EXCEPTION 'Sin permiso para cancelar cuentas por cobrar' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.totvs_cxc_cargas WHERE id=p_carga_id AND creado_por=auth.uid() AND estado IN ('VALIDANDO','IMPORTANDO','CONFLICTO') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Carga inexistente, ajena o no cancelable' USING ERRCODE='22023'; END IF;
  DELETE FROM public.totvs_cxc_carga_documentos WHERE carga_id=p_carga_id;
  DELETE FROM public.totvs_cxc_documentos d WHERE NOT EXISTS (SELECT 1 FROM public.totvs_cxc_carga_documentos cd WHERE cd.documento_id=d.id);
  UPDATE public.totvs_cxc_cargas SET estado='CANCELADA',cancelado_en=now() WHERE id=p_carga_id;
END;
$$;

CREATE OR REPLACE VIEW public.totvs_cxc_resumen_agregado AS
SELECT c.id carga_id,c.fecha_corte,c.snapshot_version,c.reemplaza_carga_id,c.completado_en,d.sucursal,d.moneda,
  count(*)::integer filas_documento,count(DISTINCT d.cliente_codigo)::integer clientes,
  count(*) FILTER (WHERE d.elegible_kpi)::integer facturas_elegibles,
  coalesce(sum(d.saldo_pendiente) FILTER (WHERE d.elegible_kpi),0)::numeric(24,2) saldo_pendiente_elegible,
  count(*) FILTER (WHERE d.elegible_kpi AND d.fecha_vencimiento<c.fecha_corte)::integer facturas_vencidas,
  coalesce(sum(d.saldo_pendiente) FILTER (WHERE d.elegible_kpi AND d.fecha_vencimiento<c.fecha_corte),0)::numeric(24,2) saldo_vencido,
  count(*) FILTER (WHERE d.elegible_kpi AND d.fecha_vencimiento=c.fecha_corte)::integer facturas_vence_hoy,
  coalesce(sum(d.saldo_pendiente) FILTER (WHERE d.elegible_kpi AND d.fecha_vencimiento=c.fecha_corte),0)::numeric(24,2) saldo_vence_hoy,
  count(*) FILTER (WHERE d.elegible_kpi AND d.fecha_vencimiento>c.fecha_corte)::integer facturas_futuras,
  coalesce(sum(d.saldo_pendiente) FILTER (WHERE d.elegible_kpi AND d.fecha_vencimiento>c.fecha_corte),0)::numeric(24,2) saldo_futuro,
  count(*) FILTER (WHERE d.saldo_pendiente=0)::integer filas_saldo_cero,
  count(*) FILTER (WHERE d.saldo_pendiente<0)::integer filas_saldo_negativo,
  coalesce(sum(d.saldo_pendiente) FILTER (WHERE d.saldo_pendiente<0),0)::numeric(24,2) saldo_negativo,
  count(*) FILTER (WHERE d.moneda='USD' AND d.tipo_documento<>'NF' AND d.saldo_pendiente>0)::integer positivos_no_factura,
  coalesce(sum(d.saldo_pendiente) FILTER (WHERE d.moneda='USD' AND d.tipo_documento<>'NF' AND d.saldo_pendiente>0),0)::numeric(24,2) saldo_positivo_no_factura,
  count(*) FILTER (WHERE d.naturaleza_documento='CUSTOMER_ADVANCE')::integer anticipos_cliente,
  coalesce(sum(d.saldo_pendiente) FILTER (WHERE d.naturaleza_documento='CUSTOMER_ADVANCE'),0)::numeric(24,2) saldo_anticipos_cliente,
  count(*) FILTER (WHERE d.naturaleza_documento='CUSTOMER_ADVANCE' AND d.saldo_pendiente>0)::integer anticipos_cliente_saldo_positivo,
  coalesce(sum(d.saldo_pendiente) FILTER (WHERE d.naturaleza_documento='CUSTOMER_ADVANCE' AND d.saldo_pendiente>0),0)::numeric(24,2) saldo_anticipos_positivo,
  count(*) FILTER (WHERE d.naturaleza_documento='CUSTOMER_ADVANCE' AND d.saldo_pendiente=0)::integer anticipos_cliente_saldo_cero,
  count(*) FILTER (WHERE d.naturaleza_documento='CUSTOMER_ADVANCE' AND d.saldo_pendiente<0)::integer anticipos_cliente_saldo_negativo,
  coalesce(sum(d.saldo_pendiente) FILTER (WHERE d.naturaleza_documento='CUSTOMER_ADVANCE' AND d.saldo_pendiente<0),0)::numeric(24,2) saldo_anticipos_negativo,
  CASE WHEN coalesce(sum(d.saldo_pendiente) FILTER (WHERE d.elegible_kpi),0)>0
    THEN round(100*sum(d.saldo_pendiente) FILTER (WHERE d.elegible_kpi AND d.fecha_vencimiento<c.fecha_corte)
      / sum(d.saldo_pendiente) FILTER (WHERE d.elegible_kpi),2) END porcentaje_saldo_vencido
FROM public.totvs_cxc_cargas c
JOIN public.totvs_cxc_carga_documentos cd ON cd.carga_id=c.id
JOIN public.totvs_cxc_documentos d ON d.id=cd.documento_id
WHERE c.estado='COMPLETA'
GROUP BY c.id,c.fecha_corte,c.snapshot_version,c.reemplaza_carga_id,c.completado_en,d.sucursal,d.moneda;

REVOKE ALL ON public.totvs_cxc_resumen_agregado FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.totvs_consultar_cxc_resumen_v1(p_corte date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_carga uuid; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_section_access(auth.uid(),'admin.importaciones') OR public.has_role(auth.uid(),'gerencia'::public.app_role)
  ) THEN RAISE EXCEPTION 'Sin permiso para consultar agregados de cuentas por cobrar' USING ERRCODE='42501'; END IF;
  SELECT id INTO v_carga FROM public.totvs_cxc_cargas
  WHERE estado='COMPLETA' AND (p_corte IS NULL OR fecha_corte=p_corte)
  ORDER BY fecha_corte DESC,snapshot_version DESC LIMIT 1;
  IF v_carga IS NULL THEN RETURN jsonb_build_object('carga_id',NULL,'fecha_corte',p_corte,'moneda','USD','sucursales','[]'::jsonb); END IF;
  SELECT jsonb_build_object(
    'carga_id',v_carga,'fecha_corte',max(r.fecha_corte),'snapshot_version',max(r.snapshot_version),
    'reemplaza_carga_id',max(r.reemplaza_carga_id::text)::uuid,'moneda','USD',
    'saldo_pendiente_elegible_usd',sum(r.saldo_pendiente_elegible),
    'saldo_vencido_usd',sum(r.saldo_vencido),
    'porcentaje_saldo_vencido',CASE WHEN sum(r.saldo_pendiente_elegible)>0 THEN round(100*sum(r.saldo_vencido)/sum(r.saldo_pendiente_elegible),2) END,
    'facturas_elegibles',sum(r.facturas_elegibles),'facturas_vencidas',sum(r.facturas_vencidas),
    'facturas_vence_hoy',sum(r.facturas_vence_hoy),'saldo_vence_hoy_usd',sum(r.saldo_vence_hoy),
    'facturas_futuras',sum(r.facturas_futuras),'saldo_futuro_usd',sum(r.saldo_futuro),
    'filas_saldo_cero',sum(r.filas_saldo_cero),'filas_saldo_negativo',sum(r.filas_saldo_negativo),
    'saldo_negativo_usd',sum(r.saldo_negativo),'positivos_no_factura',sum(r.positivos_no_factura),
    'saldo_positivo_no_factura_usd',sum(r.saldo_positivo_no_factura),
    'anticipos_cliente',sum(r.anticipos_cliente),'saldo_anticipos_cliente_usd',sum(r.saldo_anticipos_cliente),
    'anticipos_cliente_saldo_positivo',sum(r.anticipos_cliente_saldo_positivo),
    'saldo_anticipos_positivo_usd',sum(r.saldo_anticipos_positivo),
    'anticipos_cliente_saldo_cero',sum(r.anticipos_cliente_saldo_cero),
    'anticipos_cliente_saldo_negativo',sum(r.anticipos_cliente_saldo_negativo),
    'saldo_anticipos_negativo_usd',sum(r.saldo_anticipos_negativo),
    'anticipos_cliente_vinculados',0,'cobertura_aplicacion_anticipos','SIN_VINCULO_EXPLICITO',
    'sucursales',jsonb_agg(to_jsonb(r)-'carga_id'-'completado_en'-'reemplaza_carga_id' ORDER BY r.sucursal)
  ) INTO v_result FROM public.totvs_cxc_resumen_agregado r WHERE r.carga_id=v_carga AND r.moneda='USD';
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.totvs_iniciar_cxc_carga_v1(jsonb),
  public.totvs_importar_cxc_lote_v1(uuid,text,jsonb),public.totvs_finalizar_cxc_carga_v1(uuid,jsonb),
  public.totvs_cancelar_cxc_carga_v1(uuid),public.totvs_consultar_cxc_resumen_v1(date)
FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.totvs_iniciar_cxc_carga_v1(jsonb),
  public.totvs_importar_cxc_lote_v1(uuid,text,jsonb),public.totvs_finalizar_cxc_carga_v1(uuid,jsonb),
  public.totvs_cancelar_cxc_carga_v1(uuid),public.totvs_consultar_cxc_resumen_v1(date)
TO authenticated;

COMMENT ON TABLE public.totvs_cxc_documentos IS 'Snapshot documental TOTVS: VALOR y SALDO se preservan separados; NCC/RA y saldos negativos no se aplican a facturas sin vínculo fuente.';
COMMENT ON VIEW public.totvs_cxc_resumen_agregado IS 'Contrato gerencial agregado por carga/sucursal/moneda. Vencido = NF USD con SALDO>0 y vencimiento anterior al corte; vence hoy no está vencido.';
COMMENT ON FUNCTION public.totvs_consultar_cxc_resumen_v1(date) IS 'Devuelve solo la última carga completa del corte solicitado (o el último corte), sin detalle de clientes.';

NOTIFY pgrst,'reload schema';
COMMIT;
