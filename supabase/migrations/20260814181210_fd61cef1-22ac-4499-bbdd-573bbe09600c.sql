CREATE OR REPLACE FUNCTION public.repuestos_sucursal_legacy(p_valor text)
RETURNS public.sucursal
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE upper(trim(regexp_replace(coalesce(p_valor, ''), '\s+', ' ', 'g')))
    WHEN 'CENTRAL' THEN 'Santa Rita'::public.sucursal
    WHEN 'SANTA RITA' THEN 'Santa Rita'::public.sucursal
    WHEN 'SANTA ROSA DEL AGUARAY' THEN 'Santa Rosa'::public.sucursal
    WHEN 'SANTA ROSA' THEN 'Santa Rosa'::public.sucursal
    WHEN 'CAMPO 9' THEN 'Campo 9'::public.sucursal
    WHEN 'CAMPO NUEVE' THEN 'Campo 9'::public.sucursal
    WHEN 'MISIONES' THEN 'Misiones'::public.sucursal
    WHEN 'LOMA PLATA' THEN 'Loma Plata'::public.sucursal
    WHEN 'KATUETE' THEN 'Katuete'::public.sucursal
    WHEN 'KATUETÉ' THEN 'Katuete'::public.sucursal
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.repuestos_importar_facturacion_historica_lote(p_carga_id uuid, p_filas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    sucursal,
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
    public.repuestos_sucursal_legacy(x.sucursal),
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
$function$;