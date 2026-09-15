BEGIN;
-- Requiere los reportes v2 de 0005_parts_sales_brand_sellers.sql.
-- Solo recupera metadatos: nunca inserta movimientos ni cambia importes/cantidades.
CREATE OR REPLACE FUNCTION public.ventas_repuestos_normalizar_vendedor(p_nombre text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
  WITH limpio AS (
    SELECT upper(regexp_replace(regexp_replace(btrim(coalesce(p_nombre,'')),
      '^[0-9]+([[:space:]]*[-–—:][[:space:]]*|[[:space:]]+)', ''), '[[:space:]]+', ' ', 'g')) nombre
  ), clave AS (SELECT nombre,translate(nombre,'ÁÉÍÓÚÜÑ','AEIOUUN') valor FROM limpio)
  SELECT CASE
    WHEN nombre='' OR nombre ~ '^[0-9]+$' THEN NULL
    WHEN valor IN ('CARLOS JAVIER BENITEZ ZARZA','CARLOS BENITEZ') THEN 'CARLOS BENITEZ'
    WHEN valor IN ('OSCAR DANIEL BENITEZ MEZA','OSCAR BENITEZ') THEN 'OSCAR BENITEZ'
    WHEN valor IN ('LUIS ANDRES CANETE RODRIGUEZ','ANDRES CANETE','LUIS CANETE') THEN 'LUIS CAÑETE'
    WHEN valor IN ('JUAN DANIEL APODACA FERREIRA','JUAN APODACA') THEN 'JUAN APODACA'
    WHEN valor IN ('RUBEN JUAN ANTONIO CENTURION RAMOS','RUBEN CENTURION') THEN 'RUBEN CENTURION'
    WHEN valor IN ('HELWIN LOPEZ BORGES','HELWIN LOPEZ') THEN 'HELWIN LOPEZ'
    WHEN valor IN ('ABEL LOPEZ GONZALEZ','ABEL LOPEZ') THEN 'ABEL LOPEZ'
    WHEN valor IN ('ARNALDO JOSE ALMADA GONZALEZ','ARNALDO ALMADA','ARNADLO ALMADA') THEN 'ARNALDO ALMADA'
    WHEN valor='RUBEN ROTELA' THEN 'RUBEN ROTELA'
    ELSE nombre -- No adivinar el apellido de identidades desconocidas.
  END FROM clave;
$$;
REVOKE ALL ON FUNCTION public.ventas_repuestos_normalizar_vendedor(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.ventas_repuestos_movimientos_v2(
  p_desde date,p_hasta date,p_sucursal text,p_buscar text
) RETURNS TABLE(id text,fecha date,factura text,cliente text,sucursal text,
  metodologia text,codigo text,codigo_fabricante text,descripcion text,
  cantidad numeric,importe numeric,es_nota_credito boolean,documento text,marca text,vendedor text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT m.id,m.fecha,m.factura,m.cliente,m.sucursal,m.metodologia,m.codigo,
    m.codigo_fabricante,m.descripcion,m.cantidad,m.importe,m.es_nota_credito,m.documento,
    CASE
      WHEN upper(coalesce(f.marca_normalizada::text,f.raw_data->>'marca',f.subgrupo_original,'')) LIKE '%CLAAS%' THEN 'CLAAS'
      WHEN upper(coalesce(f.marca_normalizada::text,f.raw_data->>'marca',f.subgrupo_original,'')) LIKE '%HORSCH%'
        OR upper(coalesce(f.subgrupo_original,'')) LIKE '%PLANTADOR%'
        OR upper(coalesce(f.subgrupo_original,'')) LIKE '%PULVERIZ%' THEN 'HORSCH'
      ELSE 'OTROS'
    END,
    public.ventas_repuestos_normalizar_vendedor(coalesce(nullif(btrim(f.vendedor),''),j.nombre))
  FROM public.ventas_repuestos_movimientos_v1(p_desde,p_hasta,p_sucursal,p_buscar) m
  LEFT JOIN public.facturacion_lineas_importadas f
    ON f.id::text=substring(m.id from position(':' in m.id)+1)
  LEFT JOIN LATERAL (
    SELECT nullif(btrim(value),'') nombre FROM jsonb_each_text(coalesce(f.raw_data,'{}'::jsonb))
    WHERE upper(key) IN ('VENDEDOR','NOMVEN','NOMBRE VENDEDOR','NOMVEND','VEND','NOM. VENDEDOR')
      AND nullif(btrim(value),'') IS NOT NULL
    ORDER BY CASE upper(key) WHEN 'VENDEDOR' THEN 0 ELSE 1 END,key LIMIT 1
  ) j ON true;
$$;
REVOKE ALL ON FUNCTION public.ventas_repuestos_movimientos_v2(date,date,text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.repuestos_completar_vendedores_historicos(p_carga_id uuid,p_filas jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET statement_timeout='25s' AS $$
DECLARE v_actualizadas integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede completar vendedores históricos' USING errcode='42501'; END IF;
  PERFORM 1 FROM public.repuestos_facturacion_historica_cargas
    WHERE id=p_carga_id AND activo AND estado='COMPLETADO' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La carga histórica no está activa y completa'; END IF;
  IF jsonb_typeof(p_filas) IS DISTINCT FROM 'array' OR jsonb_array_length(p_filas) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Enviá entre 1 y 1000 líneas por lote'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_to_recordset(p_filas) x(linea_clave text,vendedor text,cantidad numeric,total_venta numeric)
    WHERE nullif(btrim(x.linea_clave),'') IS NULL OR nullif(btrim(x.vendedor),'') IS NULL
      OR x.cantidad IS NULL OR x.total_venta IS NULL OR NOT EXISTS(
        SELECT 1 FROM public.facturacion_lineas_importadas f
        WHERE f.origen_sistema='legacy_historico_detallado'
          AND f.raw_data->>'carga_id'=p_carga_id::text AND f.raw_data->>'linea_clave'=btrim(x.linea_clave)
          AND f.cantidad=x.cantidad AND f.total_venta=x.total_venta)) THEN
    RAISE EXCEPTION 'El archivo no coincide con el histórico cargado. No se insertan ni modifican movimientos'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_to_recordset(p_filas) x(linea_clave text)
    GROUP BY btrim(x.linea_clave) HAVING count(*)>1) THEN RAISE EXCEPTION 'Claves de línea duplicadas'; END IF;
  UPDATE public.facturacion_lineas_importadas f
    SET vendedor=btrim(x.vendedor),raw_data=f.raw_data||jsonb_build_object('vendedor',btrim(x.vendedor))
    FROM jsonb_to_recordset(p_filas) x(linea_clave text,vendedor text)
    WHERE f.origen_sistema='legacy_historico_detallado' AND f.raw_data->>'carga_id'=p_carga_id::text
      AND f.raw_data->>'linea_clave'=btrim(x.linea_clave)
      AND (f.vendedor IS DISTINCT FROM btrim(x.vendedor) OR f.raw_data->>'vendedor' IS DISTINCT FROM btrim(x.vendedor));
  GET DIAGNOSTICS v_actualizadas=ROW_COUNT;
  RETURN jsonb_build_object('actualizadas',v_actualizadas,'verificadas',jsonb_array_length(p_filas));
END;
$$;
REVOKE ALL ON FUNCTION public.repuestos_completar_vendedores_historicos(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.repuestos_completar_vendedores_historicos(uuid,jsonb) TO authenticated;
-- Las futuras NC complementarias también conservan el vendedor del archivo.
-- Mantiene intactas validaciones, inserción idempotente y reglas financieras.
DO $$
DECLARE v_def text;
BEGIN
  v_def:=pg_get_functiondef('public.repuestos_completar_notas_credito_historicas(uuid,jsonb,jsonb)'::regprocedure);
  IF strpos(v_def,'''movimiento'',''E'',''vendedor''')=0 THEN
    IF strpos(v_def,'''movimiento'',''E'')')=0 OR strpos(v_def,'valor_unitario numeric,total_venta numeric)')=0 THEN
      RAISE EXCEPTION 'El complemento de NC cambió de estructura; revisar antes de modificarlo';
    END IF;
    v_def:=replace(v_def,'''movimiento'',''E'')','''movimiento'',''E'',''vendedor'',nullif(btrim(x.vendedor),''''))');
    v_def:=replace(v_def,'valor_unitario numeric,total_venta numeric)','valor_unitario numeric,total_venta numeric,vendedor text)');
    EXECUTE v_def;
  END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
