-- Fuentes TOTVS verificadas contra los SpreadsheetML reales el 2026-09-30.
-- Compras conserva ambos ejes monetarios y TIPCAM; no elige moneda contable ni recalcula importes.
-- Las dos columnas homónimas de retención del maestro se guardan como banderas 1/2 sin reinterpretar.

BEGIN;

CREATE TABLE IF NOT EXISTS public.totvs_facturas_compra_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filial text NOT NULL, fecha_emision date NOT NULL, fecha_digitacion date NOT NULL,
  proveedor_codigo text NOT NULL, proveedor_tienda text NOT NULL, proveedor_nombre text,
  moneda_origen text NOT NULL, especie text NOT NULL, modalidad text, documento_electronico text,
  timbrado text, serie text NOT NULL, documento text NOT NULL, item text NOT NULL,
  producto_codigo text NOT NULL, producto_descripcion text, cantidad numeric NOT NULL,
  valor_unitario_gs numeric NOT NULL, total_gs numeric NOT NULL,
  valor_unitario_usd numeric NOT NULL, total_usd numeric NOT NULL,
  tipo_entrada text, cuenta_contable text, centro_costo text, tipo_cambio numeric NOT NULL,
  pedido_compra text, item_pedido_compra text, fecha_vencimiento date, observacion text,
  nro_reintegro text, reintegro text, usuario_alta text,
  archivo_origen text NOT NULL, fila_origen integer NOT NULL CHECK (fila_origen >= 2),
  huella_origen text NOT NULL, datos_fuente jsonb NOT NULL DEFAULT '{}'::jsonb,
  carga_id uuid NOT NULL, creado_en timestamptz NOT NULL DEFAULT now(), actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (filial, proveedor_codigo, proveedor_tienda, serie, documento, item)
);
CREATE INDEX IF NOT EXISTS totvs_facturas_compra_fecha_idx ON public.totvs_facturas_compra_lineas(fecha_emision);
CREATE INDEX IF NOT EXISTS totvs_facturas_compra_producto_idx ON public.totvs_facturas_compra_lineas(producto_codigo, fecha_emision);
CREATE INDEX IF NOT EXISTS totvs_facturas_compra_proveedor_idx ON public.totvs_facturas_compra_lineas(proveedor_codigo, proveedor_tienda, fecha_emision);

CREATE TABLE IF NOT EXISTS public.totvs_proveedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL, tienda text NOT NULL, razon_social text NOT NULL, ruc text,
  nombre_fantasia text, direccion text, departamento text, municipio text, email text, telefono text, pais text,
  retencion_bandera_1 text, retencion_bandera_2 text, estado text,
  archivo_origen text NOT NULL, fila_origen integer NOT NULL CHECK (fila_origen >= 2),
  huella_origen text NOT NULL, datos_fuente jsonb NOT NULL DEFAULT '{}'::jsonb,
  carga_id uuid NOT NULL, creado_en timestamptz NOT NULL DEFAULT now(), actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (codigo, tienda)
);
CREATE INDEX IF NOT EXISTS totvs_proveedores_ruc_idx ON public.totvs_proveedores(ruc);
CREATE INDEX IF NOT EXISTS totvs_proveedores_nombre_idx ON public.totvs_proveedores(razon_social);

CREATE TABLE IF NOT EXISTS public.totvs_transferencias_transito (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origen text NOT NULL, destino text NOT NULL, fecha_emision date NOT NULL,
  serie_documento text NOT NULL, numero_documento text NOT NULL, item text NOT NULL,
  producto_codigo text NOT NULL, producto_descripcion text, cantidad numeric NOT NULL, observacion text,
  vigente boolean NOT NULL DEFAULT true,
  archivo_origen text NOT NULL, fila_origen integer NOT NULL CHECK (fila_origen >= 2),
  huella_origen text NOT NULL, datos_fuente jsonb NOT NULL DEFAULT '{}'::jsonb,
  carga_id uuid NOT NULL, creado_en timestamptz NOT NULL DEFAULT now(), actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (origen, destino, serie_documento, numero_documento, item)
);
CREATE INDEX IF NOT EXISTS totvs_transferencias_transito_vigente_idx ON public.totvs_transferencias_transito(producto_codigo, fecha_emision) WHERE vigente;

ALTER TABLE public.totvs_facturas_compra_lineas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.totvs_proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.totvs_transferencias_transito ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS totvs_facturas_compra_select ON public.totvs_facturas_compra_lineas;
CREATE POLICY totvs_facturas_compra_select ON public.totvs_facturas_compra_lineas FOR SELECT TO authenticated USING (
  public.has_section_access(auth.uid(), 'admin.importaciones') OR public.has_module_access(auth.uid(), 'repuestos')
);
DROP POLICY IF EXISTS totvs_proveedores_select ON public.totvs_proveedores;
CREATE POLICY totvs_proveedores_select ON public.totvs_proveedores FOR SELECT TO authenticated USING (
  public.has_section_access(auth.uid(), 'admin.importaciones') OR public.has_module_access(auth.uid(), 'repuestos')
);
DROP POLICY IF EXISTS totvs_transferencias_transito_select ON public.totvs_transferencias_transito;
CREATE POLICY totvs_transferencias_transito_select ON public.totvs_transferencias_transito FOR SELECT TO authenticated USING (
  public.has_section_access(auth.uid(), 'admin.importaciones') OR public.has_module_access(auth.uid(), 'repuestos')
);
REVOKE ALL ON TABLE public.totvs_facturas_compra_lineas, public.totvs_proveedores, public.totvs_transferencias_transito FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.totvs_facturas_compra_lineas, public.totvs_proveedores, public.totvs_transferencias_transito TO authenticated;

CREATE OR REPLACE FUNCTION public.totvs_importar_facturas_compra_lote_v1(p_carga_id uuid, p_filas jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_total integer; v_unicas integer; v_insertadas integer; v_actualizadas integer; v_sin_cambios integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(), 'admin.importaciones') THEN RAISE EXCEPTION 'Sin permiso para importar datos de TOTVS' USING ERRCODE='42501'; END IF;
  IF p_carga_id IS NULL OR p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' THEN RAISE EXCEPTION 'Carga o filas de compras inválidas' USING ERRCODE='22023'; END IF;
  v_total := jsonb_array_length(p_filas);
  IF v_total < 1 OR v_total > 500 THEN RAISE EXCEPTION 'Cada lote de compras debe contener entre 1 y 500 filas' USING ERRCODE='22023'; END IF;
  DROP TABLE IF EXISTS pg_temp.facturas_compra_lote;
  CREATE TEMP TABLE facturas_compra_lote ON COMMIT DROP AS SELECT * FROM jsonb_to_recordset(p_filas) AS x(
    filial text, fecha_emision date, fecha_digitacion date, proveedor_codigo text, proveedor_tienda text,
    proveedor_nombre text, moneda_origen text, especie text, modalidad text, documento_electronico text,
    timbrado text, serie text, documento text, item text, producto_codigo text, producto_descripcion text,
    cantidad numeric, valor_unitario_gs numeric, total_gs numeric, valor_unitario_usd numeric, total_usd numeric,
    tipo_entrada text, cuenta_contable text, centro_costo text, tipo_cambio numeric, pedido_compra text,
    item_pedido_compra text, fecha_vencimiento date, observacion text, nro_reintegro text, reintegro text,
    usuario_alta text, archivo_origen text, fila_origen integer, huella_origen text, datos_fuente jsonb
  );
  SELECT count(DISTINCT (btrim(filial),btrim(proveedor_codigo),btrim(proveedor_tienda),btrim(serie),btrim(documento),btrim(item))) INTO v_unicas FROM facturas_compra_lote;
  IF v_unicas <> v_total THEN RAISE EXCEPTION 'El lote de compras contiene claves repetidas' USING ERRCODE='23505'; END IF;
  IF EXISTS (SELECT 1 FROM facturas_compra_lote WHERE nullif(btrim(filial),'') IS NULL OR fecha_emision IS NULL OR fecha_digitacion IS NULL
    OR nullif(btrim(proveedor_codigo),'') IS NULL OR nullif(btrim(proveedor_tienda),'') IS NULL OR nullif(btrim(moneda_origen),'') IS NULL
    OR nullif(btrim(especie),'') IS NULL OR serie IS NULL OR nullif(btrim(documento),'') IS NULL OR nullif(btrim(item),'') IS NULL
    OR nullif(btrim(producto_codigo),'') IS NULL OR cantidad IS NULL OR valor_unitario_gs IS NULL OR total_gs IS NULL
    OR valor_unitario_usd IS NULL OR total_usd IS NULL OR tipo_cambio IS NULL OR nullif(btrim(archivo_origen),'') IS NULL
    OR fila_origen < 2 OR nullif(btrim(huella_origen),'') IS NULL) THEN
    RAISE EXCEPTION 'El lote de compras contiene campos obligatorios inválidos' USING ERRCODE='22023';
  END IF;
  SELECT count(*) FILTER (WHERE a.id IS NULL), count(*) FILTER (WHERE a.id IS NOT NULL AND a.huella_origen IS DISTINCT FROM l.huella_origen),
    count(*) FILTER (WHERE a.id IS NOT NULL AND a.huella_origen = l.huella_origen)
  INTO v_insertadas,v_actualizadas,v_sin_cambios FROM facturas_compra_lote l LEFT JOIN public.totvs_facturas_compra_lineas a
    ON a.filial=btrim(l.filial) AND a.proveedor_codigo=btrim(l.proveedor_codigo) AND a.proveedor_tienda=btrim(l.proveedor_tienda)
    AND a.serie=btrim(l.serie) AND a.documento=btrim(l.documento) AND a.item=btrim(l.item);
  INSERT INTO public.totvs_facturas_compra_lineas (
    filial,fecha_emision,fecha_digitacion,proveedor_codigo,proveedor_tienda,proveedor_nombre,moneda_origen,especie,modalidad,
    documento_electronico,timbrado,serie,documento,item,producto_codigo,producto_descripcion,cantidad,valor_unitario_gs,total_gs,
    valor_unitario_usd,total_usd,tipo_entrada,cuenta_contable,centro_costo,tipo_cambio,pedido_compra,item_pedido_compra,
    fecha_vencimiento,observacion,nro_reintegro,reintegro,usuario_alta,archivo_origen,fila_origen,huella_origen,datos_fuente,carga_id
  ) SELECT btrim(filial),fecha_emision,fecha_digitacion,btrim(proveedor_codigo),btrim(proveedor_tienda),nullif(btrim(proveedor_nombre),''),
    btrim(moneda_origen),btrim(especie),nullif(btrim(modalidad),''),nullif(btrim(documento_electronico),''),nullif(btrim(timbrado),''),
    btrim(serie),btrim(documento),btrim(item),btrim(producto_codigo),nullif(btrim(producto_descripcion),''),cantidad,valor_unitario_gs,total_gs,
    valor_unitario_usd,total_usd,nullif(btrim(tipo_entrada),''),nullif(btrim(cuenta_contable),''),nullif(btrim(centro_costo),''),tipo_cambio,
    nullif(btrim(pedido_compra),''),nullif(btrim(item_pedido_compra),''),fecha_vencimiento,nullif(btrim(observacion),''),nullif(btrim(nro_reintegro),''),
    nullif(btrim(reintegro),''),nullif(btrim(usuario_alta),''),archivo_origen,fila_origen,huella_origen,coalesce(datos_fuente,'{}'::jsonb),p_carga_id
  FROM facturas_compra_lote
  ON CONFLICT (filial,proveedor_codigo,proveedor_tienda,serie,documento,item) DO UPDATE SET
    fecha_emision=EXCLUDED.fecha_emision,fecha_digitacion=EXCLUDED.fecha_digitacion,proveedor_nombre=EXCLUDED.proveedor_nombre,
    moneda_origen=EXCLUDED.moneda_origen,especie=EXCLUDED.especie,modalidad=EXCLUDED.modalidad,documento_electronico=EXCLUDED.documento_electronico,
    timbrado=EXCLUDED.timbrado,producto_codigo=EXCLUDED.producto_codigo,producto_descripcion=EXCLUDED.producto_descripcion,cantidad=EXCLUDED.cantidad,
    valor_unitario_gs=EXCLUDED.valor_unitario_gs,total_gs=EXCLUDED.total_gs,valor_unitario_usd=EXCLUDED.valor_unitario_usd,total_usd=EXCLUDED.total_usd,
    tipo_entrada=EXCLUDED.tipo_entrada,cuenta_contable=EXCLUDED.cuenta_contable,centro_costo=EXCLUDED.centro_costo,tipo_cambio=EXCLUDED.tipo_cambio,
    pedido_compra=EXCLUDED.pedido_compra,item_pedido_compra=EXCLUDED.item_pedido_compra,fecha_vencimiento=EXCLUDED.fecha_vencimiento,
    observacion=EXCLUDED.observacion,nro_reintegro=EXCLUDED.nro_reintegro,reintegro=EXCLUDED.reintegro,usuario_alta=EXCLUDED.usuario_alta,
    archivo_origen=EXCLUDED.archivo_origen,fila_origen=EXCLUDED.fila_origen,huella_origen=EXCLUDED.huella_origen,datos_fuente=EXCLUDED.datos_fuente,
    carga_id=EXCLUDED.carga_id,actualizado_en=now()
  WHERE public.totvs_facturas_compra_lineas.huella_origen IS DISTINCT FROM EXCLUDED.huella_origen;
  RETURN jsonb_build_object('total',v_total,'insertadas',v_insertadas,'actualizadas',v_actualizadas,'sin_cambios',v_sin_cambios);
END; $$;

CREATE OR REPLACE FUNCTION public.totvs_importar_proveedores_lote_v1(p_carga_id uuid, p_filas jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_total integer; v_unicas integer; v_insertadas integer; v_actualizadas integer; v_sin_cambios integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(), 'admin.importaciones') THEN RAISE EXCEPTION 'Sin permiso para importar datos de TOTVS' USING ERRCODE='42501'; END IF;
  IF p_carga_id IS NULL OR p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' THEN RAISE EXCEPTION 'Carga o proveedores inválidos' USING ERRCODE='22023'; END IF;
  v_total := jsonb_array_length(p_filas); IF v_total < 1 OR v_total > 500 THEN RAISE EXCEPTION 'Cada lote de proveedores debe contener entre 1 y 500 filas' USING ERRCODE='22023'; END IF;
  DROP TABLE IF EXISTS pg_temp.proveedores_lote;
  CREATE TEMP TABLE proveedores_lote ON COMMIT DROP AS SELECT * FROM jsonb_to_recordset(p_filas) AS x(
    codigo text, tienda text, razon_social text, ruc text, nombre_fantasia text, direccion text, departamento text,
    municipio text, email text, telefono text, pais text, retencion_bandera_1 text, retencion_bandera_2 text, estado text,
    archivo_origen text, fila_origen integer, huella_origen text, datos_fuente jsonb
  );
  SELECT count(DISTINCT (btrim(codigo),btrim(tienda))) INTO v_unicas FROM proveedores_lote;
  IF v_unicas <> v_total THEN RAISE EXCEPTION 'El lote de proveedores contiene claves repetidas' USING ERRCODE='23505'; END IF;
  IF EXISTS (SELECT 1 FROM proveedores_lote WHERE nullif(btrim(codigo),'') IS NULL OR nullif(btrim(tienda),'') IS NULL
    OR nullif(btrim(razon_social),'') IS NULL OR nullif(btrim(archivo_origen),'') IS NULL OR fila_origen < 2 OR nullif(btrim(huella_origen),'') IS NULL) THEN
    RAISE EXCEPTION 'El lote de proveedores contiene campos obligatorios inválidos' USING ERRCODE='22023'; END IF;
  SELECT count(*) FILTER (WHERE a.id IS NULL), count(*) FILTER (WHERE a.id IS NOT NULL AND a.huella_origen IS DISTINCT FROM l.huella_origen),
    count(*) FILTER (WHERE a.id IS NOT NULL AND a.huella_origen = l.huella_origen)
  INTO v_insertadas,v_actualizadas,v_sin_cambios FROM proveedores_lote l LEFT JOIN public.totvs_proveedores a ON a.codigo=btrim(l.codigo) AND a.tienda=btrim(l.tienda);
  INSERT INTO public.totvs_proveedores (codigo,tienda,razon_social,ruc,nombre_fantasia,direccion,departamento,municipio,email,telefono,pais,
    retencion_bandera_1,retencion_bandera_2,estado,archivo_origen,fila_origen,huella_origen,datos_fuente,carga_id)
  SELECT btrim(codigo),btrim(tienda),btrim(razon_social),nullif(btrim(ruc),''),nullif(btrim(nombre_fantasia),''),nullif(btrim(direccion),''),
    nullif(btrim(departamento),''),nullif(btrim(municipio),''),nullif(btrim(email),''),nullif(btrim(telefono),''),nullif(btrim(pais),''),
    nullif(btrim(retencion_bandera_1),''),nullif(btrim(retencion_bandera_2),''),nullif(btrim(estado),''),archivo_origen,fila_origen,huella_origen,
    coalesce(datos_fuente,'{}'::jsonb),p_carga_id FROM proveedores_lote
  ON CONFLICT (codigo,tienda) DO UPDATE SET razon_social=EXCLUDED.razon_social,ruc=EXCLUDED.ruc,nombre_fantasia=EXCLUDED.nombre_fantasia,
    direccion=EXCLUDED.direccion,departamento=EXCLUDED.departamento,municipio=EXCLUDED.municipio,email=EXCLUDED.email,telefono=EXCLUDED.telefono,
    pais=EXCLUDED.pais,retencion_bandera_1=EXCLUDED.retencion_bandera_1,retencion_bandera_2=EXCLUDED.retencion_bandera_2,estado=EXCLUDED.estado,
    archivo_origen=EXCLUDED.archivo_origen,fila_origen=EXCLUDED.fila_origen,huella_origen=EXCLUDED.huella_origen,datos_fuente=EXCLUDED.datos_fuente,
    carga_id=EXCLUDED.carga_id,actualizado_en=now() WHERE public.totvs_proveedores.huella_origen IS DISTINCT FROM EXCLUDED.huella_origen;
  RETURN jsonb_build_object('total',v_total,'insertadas',v_insertadas,'actualizadas',v_actualizadas,'sin_cambios',v_sin_cambios);
END; $$;

CREATE OR REPLACE FUNCTION public.totvs_importar_transferencias_transito_lote_v1(p_carga_id uuid, p_filas jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_total integer; v_unicas integer; v_insertadas integer; v_actualizadas integer; v_sin_cambios integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(), 'admin.importaciones') THEN RAISE EXCEPTION 'Sin permiso para importar datos de TOTVS' USING ERRCODE='42501'; END IF;
  IF p_carga_id IS NULL OR p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' THEN RAISE EXCEPTION 'Carga o transferencias inválidas' USING ERRCODE='22023'; END IF;
  v_total := jsonb_array_length(p_filas); IF v_total < 1 OR v_total > 500 THEN RAISE EXCEPTION 'Cada lote de transferencias debe contener entre 1 y 500 filas' USING ERRCODE='22023'; END IF;
  DROP TABLE IF EXISTS pg_temp.transferencias_lote;
  CREATE TEMP TABLE transferencias_lote ON COMMIT DROP AS SELECT * FROM jsonb_to_recordset(p_filas) AS x(
    origen text, destino text, fecha_emision date, serie_documento text, numero_documento text, item text,
    producto_codigo text, producto_descripcion text, cantidad numeric, observacion text,
    archivo_origen text, fila_origen integer, huella_origen text, datos_fuente jsonb
  );
  SELECT count(DISTINCT (btrim(origen),btrim(destino),btrim(serie_documento),btrim(numero_documento),btrim(item))) INTO v_unicas FROM transferencias_lote;
  IF v_unicas <> v_total THEN RAISE EXCEPTION 'El lote de transferencias contiene claves repetidas' USING ERRCODE='23505'; END IF;
  IF EXISTS (SELECT 1 FROM transferencias_lote WHERE nullif(btrim(origen),'') IS NULL OR nullif(btrim(destino),'') IS NULL OR fecha_emision IS NULL
    OR nullif(btrim(serie_documento),'') IS NULL OR nullif(btrim(numero_documento),'') IS NULL OR nullif(btrim(item),'') IS NULL
    OR nullif(btrim(producto_codigo),'') IS NULL OR cantidad IS NULL OR nullif(btrim(archivo_origen),'') IS NULL OR fila_origen < 2
    OR nullif(btrim(huella_origen),'') IS NULL) THEN RAISE EXCEPTION 'El lote de transferencias contiene campos obligatorios inválidos' USING ERRCODE='22023'; END IF;
  SELECT count(*) FILTER (WHERE a.id IS NULL), count(*) FILTER (WHERE a.id IS NOT NULL AND (a.huella_origen IS DISTINCT FROM l.huella_origen OR NOT a.vigente)),
    count(*) FILTER (WHERE a.id IS NOT NULL AND a.huella_origen = l.huella_origen AND a.vigente)
  INTO v_insertadas,v_actualizadas,v_sin_cambios FROM transferencias_lote l LEFT JOIN public.totvs_transferencias_transito a
    ON a.origen=btrim(l.origen) AND a.destino=btrim(l.destino) AND a.serie_documento=btrim(l.serie_documento)
    AND a.numero_documento=btrim(l.numero_documento) AND a.item=btrim(l.item);
  INSERT INTO public.totvs_transferencias_transito (origen,destino,fecha_emision,serie_documento,numero_documento,item,producto_codigo,
    producto_descripcion,cantidad,observacion,vigente,archivo_origen,fila_origen,huella_origen,datos_fuente,carga_id)
  SELECT btrim(origen),btrim(destino),fecha_emision,btrim(serie_documento),btrim(numero_documento),btrim(item),btrim(producto_codigo),
    nullif(btrim(producto_descripcion),''),cantidad,nullif(btrim(observacion),''),true,archivo_origen,fila_origen,huella_origen,
    coalesce(datos_fuente,'{}'::jsonb),p_carga_id FROM transferencias_lote
  ON CONFLICT (origen,destino,serie_documento,numero_documento,item) DO UPDATE SET fecha_emision=EXCLUDED.fecha_emision,
    producto_codigo=EXCLUDED.producto_codigo,producto_descripcion=EXCLUDED.producto_descripcion,cantidad=EXCLUDED.cantidad,
    observacion=EXCLUDED.observacion,vigente=true,archivo_origen=EXCLUDED.archivo_origen,fila_origen=EXCLUDED.fila_origen,
    huella_origen=EXCLUDED.huella_origen,datos_fuente=EXCLUDED.datos_fuente,carga_id=EXCLUDED.carga_id,
    actualizado_en=CASE
      WHEN public.totvs_transferencias_transito.huella_origen IS DISTINCT FROM EXCLUDED.huella_origen
        OR NOT public.totvs_transferencias_transito.vigente THEN now()
      ELSE public.totvs_transferencias_transito.actualizado_en
    END;
  RETURN jsonb_build_object('total',v_total,'insertadas',v_insertadas,'actualizadas',v_actualizadas,'sin_cambios',v_sin_cambios);
END; $$;

CREATE OR REPLACE FUNCTION public.totvs_finalizar_transferencias_transito_v1(p_carga_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(), 'admin.importaciones') THEN RAISE EXCEPTION 'Sin permiso para importar datos de TOTVS' USING ERRCODE='42501'; END IF;
  IF p_carga_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.totvs_transferencias_transito WHERE carga_id=p_carga_id) THEN
    RAISE EXCEPTION 'Carga de transferencias inexistente o vacía' USING ERRCODE='22023';
  END IF;
  UPDATE public.totvs_transferencias_transito SET vigente=(carga_id=p_carga_id), actualizado_en=now() WHERE vigente IS DISTINCT FROM (carga_id=p_carga_id);
END; $$;

REVOKE ALL ON FUNCTION public.totvs_importar_facturas_compra_lote_v1(uuid,jsonb), public.totvs_importar_proveedores_lote_v1(uuid,jsonb),
  public.totvs_importar_transferencias_transito_lote_v1(uuid,jsonb), public.totvs_finalizar_transferencias_transito_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.totvs_importar_facturas_compra_lote_v1(uuid,jsonb), public.totvs_importar_proveedores_lote_v1(uuid,jsonb),
  public.totvs_importar_transferencias_transito_lote_v1(uuid,jsonb), public.totvs_finalizar_transferencias_transito_v1(uuid) TO authenticated;

COMMENT ON TABLE public.totvs_facturas_compra_lineas IS 'Líneas TOTVS de facturas/NCP de compra; Gs, USD, MONORI y TIPCAM se preservan sin conversión.';
COMMENT ON TABLE public.totvs_proveedores IS 'Maestro TOTVS incremental por Codigo+Tienda; banderas de retención duplicadas preservadas sin reinterpretar.';
COMMENT ON TABLE public.totvs_transferencias_transito IS 'Historial de fotos TOTVS de transferencias entre sucursales; vigente identifica la última carga completa.';

NOTIFY pgrst, 'reload schema';
COMMIT;
