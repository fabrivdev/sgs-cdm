BEGIN;

-- Una refacturacion puede contener lineas de postventa validas sin OS. La
-- ausencia del vinculo no convierte una linea explicita de TOTVS en "Otros".
-- Se limita al grupo 008 - SERVICIOS (incluida la grafia SEVICIOS del origen)
-- y conserva las exclusiones comerciales ya acordadas.
CREATE OR REPLACE FUNCTION public.ventas_es_refacturacion_servicio_sin_os(
  p_concepto text,
  p_codigo text,
  p_descripcion text,
  p_raw_data jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path=public,pg_temp
AS $$
  WITH evidencia AS (
    SELECT btrim(coalesce(
      public.valor_json_insensible(coalesce(p_raw_data,'{}'::jsonb),
        ARRAY['GRUPO','product_group']),
      ''
    )) AS grupo
  )
  SELECT p_concepto IN ('Servicio','Kilometraje','Terceros')
    AND upper(grupo) ~ '^008[[:space:]]*-[[:space:]]*SE(R)?VICIOS([[:space:]]|$)'
    AND NOT public.ventas_es_otro_comercial(
      concat_ws(' ',p_descripcion,p_codigo),grupo
    )
  FROM evidencia;
$$;
REVOKE ALL ON FUNCTION public.ventas_es_refacturacion_servicio_sin_os(text,text,text,jsonb)
  FROM PUBLIC,anon,authenticated;

-- En una refacturacion de postventa a un tercero, Cliente es el respaldo de
-- tiempo cuando no existe otra evidencia. No aplica a CAMPOS DEL MANANA ni
-- reemplaza Cliente/Garantia/Interno explicitamente informados.
CREATE OR REPLACE FUNCTION public.ventas_tipo_tiempo_refacturacion_cliente(
  p_cliente text,
  p_tipo text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path=public,pg_temp
AS $$
  WITH claves AS (
    SELECT public.ventas_tipo_tiempo_normalizado(p_tipo) AS tipo,
      public.ventas_servicios_texto_normalizado(
        public.cliente_nombre_canonico(p_cliente)) AS cliente
  )
  SELECT CASE
    WHEN tipo<>'No informado' THEN tipo
    WHEN cliente<>'' AND cliente NOT IN (
      'CLIENTE NO INFORMADO','NO INFORMADO','SIN CLIENTE','PROPIETARIO NO INFORMADO'
    ) AND cliente !~ '^CAMPOS DEL MANANA( |$)' THEN 'Cliente'
    ELSE 'No informado'
  END
  FROM claves;
$$;
REVOKE ALL ON FUNCTION public.ventas_tipo_tiempo_refacturacion_cliente(text,text)
  FROM PUBLIC,anon,authenticated;

-- Parches fail-closed sobre las definiciones vigentes. No reescriben imports
-- ni inventan OS; amplian la poblacion financiera y su tipo de reporte.
DO $migration$
DECLARE definicion text; anterior text; nueva text;
BEGIN
  SELECT pg_get_functiondef(
    'public.ventas_area_movimientos_base(date,date,text,text)'::regprocedure)
    INTO definicion;
  definicion := replace(definicion,E'\r\n',E'\n');
  IF strpos(definicion,'ventas_es_refacturacion_servicio_sin_os')=0 THEN
    anterior := $old$        when m.es_nota_credito and m.concepto in ('Servicio', 'Kilometraje', 'Terceros') then 'servicios'
        when m.concepto in ('Servicio', 'Kilometraje', 'Terceros') then 'revision'$old$;
    nueva := $new$        when m.es_nota_credito and m.concepto in ('Servicio', 'Kilometraje', 'Terceros') then 'servicios'
        when public.ventas_es_refacturacion_servicio_sin_os(
          m.concepto,m.codigo,m.descripcion,m.raw_data
        ) then 'servicios'
        when m.concepto in ('Servicio', 'Kilometraje', 'Terceros') then 'revision'$new$;
    IF strpos(definicion,anterior)=0 THEN
      RAISE EXCEPTION 'Clasificacion de ventas inesperada; aplicar primero 20260916180000';
    END IF;
    EXECUTE replace(definicion,anterior,nueva);
  END IF;

  SELECT pg_get_functiondef(
    'public.dashboard_facturacion_fuente_v1(date,date)'::regprocedure)
    INTO definicion;
  definicion := replace(definicion,E'\r\n',E'\n');
  IF strpos(definicion,'ventas_tipo_tiempo_refacturacion_cliente')=0 THEN
    anterior := $old$    WHEN s.metodologia='actual' THEN nullif(btrim(f.tipo_tiempo::text),'')$old$;
    nueva := $new$    WHEN s.metodologia='actual' AND s.area_calculada='servicios'
      AND nullif(btrim(coalesce(f.raw_data->>'linked_service_order','')),'') IS NULL
      THEN public.ventas_tipo_tiempo_refacturacion_cliente(s.cliente,f.tipo_tiempo::text)
    WHEN s.metodologia='actual' THEN nullif(btrim(f.tipo_tiempo::text),'')$new$;
    IF strpos(definicion,anterior)=0 THEN
      RAISE EXCEPTION 'Dashboard no tiene la definicion esperada; aplicar primero 20260916180000';
    END IF;
    EXECUTE replace(definicion,anterior,nueva);
  END IF;

  SELECT pg_get_functiondef(
    'public.ventas_servicios_movimientos_enriquecidos(date,date,text)'::regprocedure)
    INTO definicion;
  definicion := replace(definicion,E'\r\n',E'\n');
  IF strpos(definicion,'ventas_tipo_tiempo_refacturacion_cliente')=0 THEN
    anterior := $old$public.ventas_tipo_tiempo_normalizado(coalesce(nullif(fl.tipo_tiempo,''),
          nullif(fl.raw_data->>'canonical_time_type',''),os.tipo_tiempo))$old$;
    nueva := $new$CASE WHEN b.metodologia='actual' AND NOT b.vinculada_os
        AND b.concepto IN ('Servicio','Kilometraje','Terceros') THEN
        public.ventas_tipo_tiempo_refacturacion_cliente(b.cliente,
          coalesce(nullif(fl.tipo_tiempo,''),
            nullif(fl.raw_data->>'canonical_time_type',''),os.tipo_tiempo))
      ELSE public.ventas_tipo_tiempo_normalizado(coalesce(nullif(fl.tipo_tiempo,''),
        nullif(fl.raw_data->>'canonical_time_type',''),os.tipo_tiempo)) END$new$;
    IF strpos(definicion,anterior)=0 THEN
      RAISE EXCEPTION 'Servicios no tiene la definicion esperada; aplicar primero 20260915120000';
    END IF;
    EXECUTE replace(definicion,anterior,nueva);
  END IF;
END;
$migration$;

NOTIFY pgrst,'reload schema';
COMMIT;
