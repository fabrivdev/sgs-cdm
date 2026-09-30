-- Fuentes operativas TOTVS verificadas el 2026-09-30.
-- Conservan moneda, TIPENT y campos fuente sin inferir IVA, chasis ni tipo de m\u00e1quina.

BEGIN;

CREATE TABLE IF NOT EXISTS public.totvs_importaciones_despacho (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sucursal text NOT NULL,
  proceso text NOT NULL,
  fecha_proceso date NOT NULL,
  despachante text,
  fecha_finalizacion date,
  item_proceso text NOT NULL,
  proveedor_codigo text,
  proveedor_nombre text,
  serie text,
  fecha_documento date,
  condicion_pago text,
  moneda text,
  timbrado text,
  numero_documento text NOT NULL,
  item_documento text NOT NULL,
  producto_codigo text NOT NULL,
  producto_descripcion text,
  fabricante_codigo text,
  cantidad numeric NOT NULL,
  precio_unitario numeric NOT NULL,
  generada text,
  tipo_entrada text,
  referencia_orden_compra text,
  archivo_origen text NOT NULL,
  fila_origen integer NOT NULL CHECK (fila_origen >= 2),
  huella_origen text NOT NULL,
  datos_fuente jsonb NOT NULL DEFAULT '{}'::jsonb,
  carga_id uuid NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sucursal, proceso, item_proceso, numero_documento, item_documento, producto_codigo)
);

CREATE INDEX IF NOT EXISTS totvs_importaciones_despacho_fecha_idx
  ON public.totvs_importaciones_despacho(fecha_proceso);
CREATE INDEX IF NOT EXISTS totvs_importaciones_despacho_producto_idx
  ON public.totvs_importaciones_despacho(producto_codigo, fecha_proceso);
CREATE INDEX IF NOT EXISTS totvs_importaciones_despacho_oc_idx
  ON public.totvs_importaciones_despacho(referencia_orden_compra);

ALTER TABLE public.totvs_importaciones_despacho ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS totvs_importaciones_despacho_select ON public.totvs_importaciones_despacho;
CREATE POLICY totvs_importaciones_despacho_select ON public.totvs_importaciones_despacho
FOR SELECT TO authenticated
USING (
  public.has_section_access(auth.uid(), 'admin.importaciones')
  OR public.has_module_access(auth.uid(), 'repuestos')
  OR public.has_module_access(auth.uid(), 'parque')
);
REVOKE ALL ON TABLE public.totvs_importaciones_despacho FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.totvs_importaciones_despacho TO authenticated;

CREATE TABLE IF NOT EXISTS public.totvs_pedidos_venta_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filial text NOT NULL,
  fecha_emision date NOT NULL,
  cliente_codigo text,
  cliente_nombre text,
  vendedor text,
  condicion_pago text,
  naturaleza text,
  genera text,
  moneda text,
  nro_pedido text NOT NULL,
  item text NOT NULL,
  producto_codigo text NOT NULL,
  fabricante_codigo text,
  descripcion text,
  unidad text,
  cantidad numeric NOT NULL,
  precio_unitario numeric NOT NULL,
  valor_total numeric NOT NULL,
  cantidad_entregada numeric NOT NULL,
  cantidad_pendiente numeric NOT NULL,
  estado text,
  nro_presupuesto text,
  item_presupuesto text,
  serie_factura text,
  factura text,
  tipo_entrada text,
  archivo_origen text NOT NULL,
  fila_origen integer NOT NULL CHECK (fila_origen >= 2),
  huella_origen text NOT NULL,
  datos_fuente jsonb NOT NULL DEFAULT '{}'::jsonb,
  carga_id uuid NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (filial, nro_pedido, item)
);

CREATE INDEX IF NOT EXISTS totvs_pedidos_venta_fecha_idx
  ON public.totvs_pedidos_venta_lineas(fecha_emision);
CREATE INDEX IF NOT EXISTS totvs_pedidos_venta_producto_idx
  ON public.totvs_pedidos_venta_lineas(producto_codigo, fecha_emision);
CREATE INDEX IF NOT EXISTS totvs_pedidos_venta_pendiente_idx
  ON public.totvs_pedidos_venta_lineas(fecha_emision) WHERE cantidad_pendiente <> 0;

ALTER TABLE public.totvs_pedidos_venta_lineas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS totvs_pedidos_venta_select ON public.totvs_pedidos_venta_lineas;
CREATE POLICY totvs_pedidos_venta_select ON public.totvs_pedidos_venta_lineas
FOR SELECT TO authenticated
USING (
  public.has_section_access(auth.uid(), 'admin.importaciones')
  OR public.has_module_access(auth.uid(), 'repuestos')
  OR public.has_module_access(auth.uid(), 'parque')
);
REVOKE ALL ON TABLE public.totvs_pedidos_venta_lineas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.totvs_pedidos_venta_lineas TO authenticated;

CREATE OR REPLACE FUNCTION public.totvs_importar_despacho_lote_v1(p_carga_id uuid, p_filas jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_total integer;
  v_unicas integer;
  v_insertadas integer;
  v_actualizadas integer;
  v_sin_cambios integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(), 'admin.importaciones') THEN
    RAISE EXCEPTION 'Sin permiso para importar datos de TOTVS' USING ERRCODE='42501';
  END IF;
  IF p_carga_id IS NULL OR p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' THEN
    RAISE EXCEPTION 'Carga o filas de despacho inv\u00e1lidas' USING ERRCODE='22023';
  END IF;
  v_total := jsonb_array_length(p_filas);
  IF v_total < 1 OR v_total > 500 THEN
    RAISE EXCEPTION 'Cada lote de despacho debe contener entre 1 y 500 filas' USING ERRCODE='22023';
  END IF;

  CREATE TEMP TABLE despacho_lote ON COMMIT DROP AS
  SELECT * FROM jsonb_to_recordset(p_filas) AS x(
    sucursal text, proceso text, fecha_proceso date, despachante text, fecha_finalizacion date,
    item_proceso text, proveedor_codigo text, proveedor_nombre text, serie text,
    fecha_documento date, condicion_pago text, moneda text, timbrado text,
    numero_documento text, item_documento text, producto_codigo text,
    producto_descripcion text, fabricante_codigo text, cantidad numeric, precio_unitario numeric,
    generada text, tipo_entrada text, referencia_orden_compra text, archivo_origen text,
    fila_origen integer, huella_origen text, datos_fuente jsonb
  );

  SELECT count(DISTINCT (btrim(sucursal),btrim(proceso),btrim(item_proceso),btrim(numero_documento),btrim(item_documento),btrim(producto_codigo)))
  INTO v_unicas FROM despacho_lote;
  IF v_unicas <> v_total THEN
    RAISE EXCEPTION 'El lote de despacho contiene claves repetidas' USING ERRCODE='23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM despacho_lote WHERE
      nullif(btrim(sucursal),'') IS NULL OR nullif(btrim(proceso),'') IS NULL
      OR fecha_proceso IS NULL OR nullif(btrim(item_proceso),'') IS NULL
      OR nullif(btrim(numero_documento),'') IS NULL OR nullif(btrim(item_documento),'') IS NULL
      OR nullif(btrim(producto_codigo),'') IS NULL OR cantidad IS NULL OR precio_unitario IS NULL
      OR nullif(btrim(archivo_origen),'') IS NULL OR fila_origen < 2
      OR nullif(btrim(huella_origen),'') IS NULL
  ) THEN
    RAISE EXCEPTION 'El lote de despacho contiene campos obligatorios inv\u00e1lidos' USING ERRCODE='22023';
  END IF;

  SELECT count(*) FILTER (WHERE actual.id IS NULL),
         count(*) FILTER (WHERE actual.id IS NOT NULL AND actual.huella_origen IS DISTINCT FROM lote.huella_origen),
         count(*) FILTER (WHERE actual.id IS NOT NULL AND actual.huella_origen = lote.huella_origen)
  INTO v_insertadas,v_actualizadas,v_sin_cambios
  FROM despacho_lote lote
  LEFT JOIN public.totvs_importaciones_despacho actual
    ON actual.sucursal=btrim(lote.sucursal) AND actual.proceso=btrim(lote.proceso)
   AND actual.item_proceso=btrim(lote.item_proceso) AND actual.numero_documento=btrim(lote.numero_documento)
   AND actual.item_documento=btrim(lote.item_documento) AND actual.producto_codigo=btrim(lote.producto_codigo);

  INSERT INTO public.totvs_importaciones_despacho (
    sucursal,proceso,fecha_proceso,despachante,fecha_finalizacion,item_proceso,
    proveedor_codigo,proveedor_nombre,serie,fecha_documento,condicion_pago,moneda,timbrado,
    numero_documento,item_documento,producto_codigo,producto_descripcion,fabricante_codigo,
    cantidad,precio_unitario,generada,tipo_entrada,referencia_orden_compra,
    archivo_origen,fila_origen,huella_origen,datos_fuente,carga_id
  )
  SELECT btrim(sucursal),btrim(proceso),fecha_proceso,nullif(btrim(despachante),''),fecha_finalizacion,
    btrim(item_proceso),nullif(btrim(proveedor_codigo),''),nullif(btrim(proveedor_nombre),''),
    nullif(btrim(serie),''),fecha_documento,nullif(btrim(condicion_pago),''),nullif(btrim(moneda),''),
    nullif(btrim(timbrado),''),btrim(numero_documento),btrim(item_documento),btrim(producto_codigo),
    nullif(btrim(producto_descripcion),''),nullif(btrim(fabricante_codigo),''),cantidad,precio_unitario,
    nullif(btrim(generada),''),nullif(btrim(tipo_entrada),''),nullif(btrim(referencia_orden_compra),''),
    archivo_origen,fila_origen,huella_origen,coalesce(datos_fuente,'{}'::jsonb),p_carga_id
  FROM despacho_lote
  ON CONFLICT (sucursal,proceso,item_proceso,numero_documento,item_documento,producto_codigo) DO UPDATE SET
    fecha_proceso=EXCLUDED.fecha_proceso,despachante=EXCLUDED.despachante,
    fecha_finalizacion=EXCLUDED.fecha_finalizacion,proveedor_codigo=EXCLUDED.proveedor_codigo,
    proveedor_nombre=EXCLUDED.proveedor_nombre,serie=EXCLUDED.serie,
    fecha_documento=EXCLUDED.fecha_documento,condicion_pago=EXCLUDED.condicion_pago,
    moneda=EXCLUDED.moneda,timbrado=EXCLUDED.timbrado,producto_descripcion=EXCLUDED.producto_descripcion,
    fabricante_codigo=EXCLUDED.fabricante_codigo,cantidad=EXCLUDED.cantidad,
    precio_unitario=EXCLUDED.precio_unitario,generada=EXCLUDED.generada,
    tipo_entrada=EXCLUDED.tipo_entrada,referencia_orden_compra=EXCLUDED.referencia_orden_compra,
    archivo_origen=EXCLUDED.archivo_origen,fila_origen=EXCLUDED.fila_origen,
    huella_origen=EXCLUDED.huella_origen,datos_fuente=EXCLUDED.datos_fuente,
    carga_id=EXCLUDED.carga_id,actualizado_en=now()
  WHERE public.totvs_importaciones_despacho.huella_origen IS DISTINCT FROM EXCLUDED.huella_origen;

  RETURN jsonb_build_object('total',v_total,'insertadas',v_insertadas,'actualizadas',v_actualizadas,'sin_cambios',v_sin_cambios);
END;
$$;

CREATE OR REPLACE FUNCTION public.totvs_importar_pedidos_venta_lote_v1(p_carga_id uuid, p_filas jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_total integer;
  v_unicas integer;
  v_insertadas integer;
  v_actualizadas integer;
  v_sin_cambios integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(), 'admin.importaciones') THEN
    RAISE EXCEPTION 'Sin permiso para importar datos de TOTVS' USING ERRCODE='42501';
  END IF;
  IF p_carga_id IS NULL OR p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' THEN
    RAISE EXCEPTION 'Carga o filas de pedidos de venta inv\u00e1lidas' USING ERRCODE='22023';
  END IF;
  v_total := jsonb_array_length(p_filas);
  IF v_total < 1 OR v_total > 500 THEN
    RAISE EXCEPTION 'Cada lote de pedidos de venta debe contener entre 1 y 500 filas' USING ERRCODE='22023';
  END IF;

  CREATE TEMP TABLE pedidos_venta_lote ON COMMIT DROP AS
  SELECT * FROM jsonb_to_recordset(p_filas) AS x(
    filial text, fecha_emision date, cliente_codigo text, cliente_nombre text, vendedor text,
    condicion_pago text, naturaleza text, genera text, moneda text, nro_pedido text, item text,
    producto_codigo text, fabricante_codigo text, descripcion text, unidad text, cantidad numeric,
    precio_unitario numeric, valor_total numeric, cantidad_entregada numeric, cantidad_pendiente numeric,
    estado text, nro_presupuesto text, item_presupuesto text, serie_factura text, factura text,
    tipo_entrada text, archivo_origen text, fila_origen integer, huella_origen text, datos_fuente jsonb
  );

  SELECT count(DISTINCT (btrim(filial),btrim(nro_pedido),btrim(item)))
  INTO v_unicas FROM pedidos_venta_lote;
  IF v_unicas <> v_total THEN
    RAISE EXCEPTION 'El lote de pedidos de venta contiene claves repetidas' USING ERRCODE='23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pedidos_venta_lote WHERE nullif(btrim(filial),'') IS NULL
      OR fecha_emision IS NULL OR nullif(btrim(nro_pedido),'') IS NULL OR nullif(btrim(item),'') IS NULL
      OR nullif(btrim(producto_codigo),'') IS NULL OR cantidad IS NULL OR precio_unitario IS NULL
      OR valor_total IS NULL OR cantidad_entregada IS NULL OR cantidad_pendiente IS NULL
      OR nullif(btrim(archivo_origen),'') IS NULL OR fila_origen < 2 OR nullif(btrim(huella_origen),'') IS NULL
  ) THEN
    RAISE EXCEPTION 'El lote de pedidos de venta contiene campos obligatorios inv\u00e1lidos' USING ERRCODE='22023';
  END IF;

  SELECT count(*) FILTER (WHERE actual.id IS NULL),
         count(*) FILTER (WHERE actual.id IS NOT NULL AND actual.huella_origen IS DISTINCT FROM lote.huella_origen),
         count(*) FILTER (WHERE actual.id IS NOT NULL AND actual.huella_origen = lote.huella_origen)
  INTO v_insertadas,v_actualizadas,v_sin_cambios
  FROM pedidos_venta_lote lote
  LEFT JOIN public.totvs_pedidos_venta_lineas actual
    ON actual.filial=btrim(lote.filial) AND actual.nro_pedido=btrim(lote.nro_pedido) AND actual.item=btrim(lote.item);

  INSERT INTO public.totvs_pedidos_venta_lineas (
    filial,fecha_emision,cliente_codigo,cliente_nombre,vendedor,condicion_pago,naturaleza,genera,moneda,
    nro_pedido,item,producto_codigo,fabricante_codigo,descripcion,unidad,cantidad,precio_unitario,valor_total,
    cantidad_entregada,cantidad_pendiente,estado,nro_presupuesto,item_presupuesto,serie_factura,factura,
    tipo_entrada,archivo_origen,fila_origen,huella_origen,datos_fuente,carga_id
  )
  SELECT btrim(filial),fecha_emision,nullif(btrim(cliente_codigo),''),nullif(btrim(cliente_nombre),''),
    nullif(btrim(vendedor),''),nullif(btrim(condicion_pago),''),nullif(btrim(naturaleza),''),
    nullif(btrim(genera),''),nullif(btrim(moneda),''),btrim(nro_pedido),btrim(item),btrim(producto_codigo),
    nullif(btrim(fabricante_codigo),''),nullif(btrim(descripcion),''),nullif(btrim(unidad),''),
    cantidad,precio_unitario,valor_total,cantidad_entregada,cantidad_pendiente,nullif(btrim(estado),''),
    nullif(btrim(nro_presupuesto),''),nullif(btrim(item_presupuesto),''),nullif(btrim(serie_factura),''),
    nullif(btrim(factura),''),nullif(btrim(tipo_entrada),''),archivo_origen,fila_origen,huella_origen,
    coalesce(datos_fuente,'{}'::jsonb),p_carga_id
  FROM pedidos_venta_lote
  ON CONFLICT (filial,nro_pedido,item) DO UPDATE SET
    fecha_emision=EXCLUDED.fecha_emision,cliente_codigo=EXCLUDED.cliente_codigo,
    cliente_nombre=EXCLUDED.cliente_nombre,vendedor=EXCLUDED.vendedor,
    condicion_pago=EXCLUDED.condicion_pago,naturaleza=EXCLUDED.naturaleza,genera=EXCLUDED.genera,
    moneda=EXCLUDED.moneda,producto_codigo=EXCLUDED.producto_codigo,
    fabricante_codigo=EXCLUDED.fabricante_codigo,descripcion=EXCLUDED.descripcion,unidad=EXCLUDED.unidad,
    cantidad=EXCLUDED.cantidad,precio_unitario=EXCLUDED.precio_unitario,valor_total=EXCLUDED.valor_total,
    cantidad_entregada=EXCLUDED.cantidad_entregada,cantidad_pendiente=EXCLUDED.cantidad_pendiente,
    estado=EXCLUDED.estado,nro_presupuesto=EXCLUDED.nro_presupuesto,item_presupuesto=EXCLUDED.item_presupuesto,
    serie_factura=EXCLUDED.serie_factura,factura=EXCLUDED.factura,tipo_entrada=EXCLUDED.tipo_entrada,
    archivo_origen=EXCLUDED.archivo_origen,fila_origen=EXCLUDED.fila_origen,
    huella_origen=EXCLUDED.huella_origen,datos_fuente=EXCLUDED.datos_fuente,
    carga_id=EXCLUDED.carga_id,actualizado_en=now()
  WHERE public.totvs_pedidos_venta_lineas.huella_origen IS DISTINCT FROM EXCLUDED.huella_origen;

  RETURN jsonb_build_object('total',v_total,'insertadas',v_insertadas,'actualizadas',v_actualizadas,'sin_cambios',v_sin_cambios);
END;
$$;

REVOKE ALL ON FUNCTION public.totvs_importar_despacho_lote_v1(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.totvs_importar_despacho_lote_v1(uuid,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.totvs_importar_pedidos_venta_lote_v1(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.totvs_importar_pedidos_venta_lote_v1(uuid,jsonb) TO authenticated;

COMMENT ON TABLE public.totvs_importaciones_despacho IS
  'Detalle agregado de Importaciones - Despacho TOTVS; no representa unidades de m\u00e1quinas ni chasis.';
COMMENT ON TABLE public.totvs_pedidos_venta_lineas IS
  'L\u00edneas de pedidos de venta TOTVS con cobertura seg\u00fan archivo, sin asumir acumulado anual.';

NOTIFY pgrst, 'reload schema';

COMMIT;
