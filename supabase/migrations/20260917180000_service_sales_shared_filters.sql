BEGIN;
-- Filtros antes de agregación. No reescribe imports, reparto, ajustes o exclusiones.
-- Las RPC originales permanecen intactas y sirven cuando no hay filtros nuevos.
CREATE OR REPLACE FUNCTION public.ventas_servicios_validar_filtros(p_filtros jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE k text; v jsonb;
BEGIN
  IF p_filtros IS NULL OR jsonb_typeof(p_filtros)<>'object' THEN
    RAISE EXCEPTION 'Filtros inválidos' USING ERRCODE='22023';
  END IF;
  FOR k,v IN SELECT * FROM jsonb_each(p_filtros) LOOP
    IF k NOT IN ('cliente','propietario','factura','os','chasis','descripcion','codigo','componente','origen','documento','vinculo')
      OR jsonb_typeof(v)<>'string' THEN
      RAISE EXCEPTION 'Filtro inválido: %',k USING ERRCODE='22023';
    END IF;
  END LOOP;
  IF nullif(p_filtros->>'componente','') IS NOT NULL AND p_filtros->>'componente' NOT IN ('Servicio','Kilometraje','Repuestos','Terceros')
    OR nullif(p_filtros->>'origen','') IS NOT NULL AND p_filtros->>'origen' NOT IN ('historico','actual')
    OR nullif(p_filtros->>'documento','') IS NOT NULL AND p_filtros->>'documento' NOT IN ('factura','nc')
    OR nullif(p_filtros->>'vinculo','') IS NOT NULL AND p_filtros->>'vinculo' NOT IN ('con_os','sin_os') THEN
    RAISE EXCEPTION 'Opción de filtro inválida' USING ERRCODE='22023';
  END IF;
END;
$$;

-- Mismo criterio que Código de Detalle: factura específica primero, después
-- código operativo único de esa OS/componente; nunca un REP de otra línea.
CREATE OR REPLACE FUNCTION public.ventas_servicios_codigo_filtro(p_linea jsonb)
RETURNS text LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE financiero text:=btrim(p_linea->>'codigo'); concepto text:=p_linea->>'concepto';
  raw_os jsonb; operativo text;
BEGIN
  IF concepto='Servicio' AND upper(financiero) ~ '^MA[0-9]+$'
    OR concepto='Kilometraje' AND upper(financiero) ~ '^KM([0-9]+)?$'
    OR concepto='Terceros' AND upper(financiero) ~ '^SE([0-9]+)?$' THEN
    RETURN upper(financiero);
  END IF;
  IF concepto IN ('Servicio','Kilometraje','Terceros') THEN
    SELECT CASE WHEN count(*)=1 THEN jsonb_agg(o.raw_data)->0 END INTO raw_os
    FROM public.ordenes_servicio_importadas o
    WHERE upper(btrim(o.os_numero))=upper(btrim(p_linea->>'os_numero'));
    SELECT CASE WHEN count(DISTINCT codigo)=1 THEN min(codigo) END INTO operativo
    FROM (
      SELECT upper(btrim(valor)) AS codigo FROM (
        SELECT raw_os->>'CODIGO' AS valor UNION ALL SELECT raw_os->>'PRODUCTO'
        UNION ALL SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(raw_os->'productos_agregados')='array'
          THEN raw_os->'productos_agregados' ELSE '[]'::jsonb END)
      ) valores
    ) codigos
    WHERE concepto='Servicio' AND codigo ~ '^MA[0-9]+$'
      OR concepto='Kilometraje' AND codigo ~ '^KM([0-9]+)?$'
      OR concepto='Terceros' AND codigo ~ '^SE([0-9]+)?$';
    IF operativo IS NOT NULL THEN RETURN operativo; END IF;
  END IF;
  RETURN CASE WHEN financiero ~ '[[:alnum:]]' THEN financiero END;
END;
$$;
REVOKE ALL ON FUNCTION public.ventas_servicios_codigo_filtro(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ventas_servicios_codigo_filtro(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.ventas_servicios_cumple_filtros(p_linea jsonb,p_filtros jsonb)
RETURNS boolean LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM (VALUES
      ('cliente','cliente'),('propietario','propietario'),('factura','factura'),
      ('os','os_numero'),('chasis','nro_chasis'),('descripcion','descripcion')
    ) AS campos(filtro,campo)
    WHERE nullif(btrim(p_filtros->>filtro),'') IS NOT NULL
      AND strpos(public.ventas_servicios_texto_normalizado(coalesce(p_linea->>campo,'')),
        public.ventas_servicios_texto_normalizado(p_filtros->>filtro))=0
  )
  -- No consultar OS para resolver códigos si ese filtro no está solicitado.
  AND CASE WHEN nullif(btrim(p_filtros->>'codigo'),'') IS NULL THEN true ELSE
    strpos(public.ventas_servicios_texto_normalizado(coalesce(public.ventas_servicios_codigo_filtro(p_linea),'')),
      public.ventas_servicios_texto_normalizado(p_filtros->>'codigo'))>0 END
  AND (nullif(p_filtros->>'componente','') IS NULL OR p_linea->>'concepto'=p_filtros->>'componente')
  AND (nullif(p_filtros->>'origen','') IS NULL OR p_linea->>'metodologia'=p_filtros->>'origen')
  AND (nullif(p_filtros->>'documento','') IS NULL
    OR coalesce((p_linea->>'es_nota_credito')::boolean,false)=(p_filtros->>'documento'='nc'))
  AND (nullif(p_filtros->>'vinculo','') IS NULL
    OR (nullif(btrim(p_linea->>'os_numero'),'') IS NOT NULL)=(p_filtros->>'vinculo'='con_os'));
$$;
REVOKE ALL ON FUNCTION public.ventas_servicios_validar_filtros(jsonb),public.ventas_servicios_cumple_filtros(jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ventas_servicios_validar_filtros(jsonb),public.ventas_servicios_cumple_filtros(jsonb,jsonb) TO authenticated;

-- Clonar la definición vigente, no restaurar una versión histórica que pierda
-- cantidades/códigos, tipos corregidos o reparaciones ya aplicadas. Transformación
-- limitada y fail-closed: exactamente una base enriquecida por reporte, permisos
-- de servicios.ventas presentes y prerequisitos verificables. No toca originales.
DO $migration$
DECLARE
  source text; source_oid oid; definition text; next_definition text; target text;
  signature text; matches integer;
  base_pattern text := '(from\s+public\.ventas_servicios_movimientos_enriquecidos\(p_desde\s*,\s*p_hasta\s*,\s*p_sucursal\)\s+b\s+where\s+)';
BEGIN
  FOREACH source IN ARRAY ARRAY[
    'public.ventas_servicios_panorama_v2(date,date,text,text,text,text,text,text)',
    'public.ventas_servicios_indicadores_v1(date,date,text,text,text,text,text)',
    'public.ventas_servicios_tecnicos_v1(date,date,text,text,text,text,text)',
    'public.ventas_servicios_lineas_v2(date,date,text,text,text,text)'
  ] LOOP
    source_oid := to_regprocedure(source);
    IF source_oid IS NULL THEN RAISE EXCEPTION 'Falta la RPC requerida: %',source; END IF;
    definition := pg_get_functiondef(source_oid);
    IF strpos(definition,'servicios.ventas')=0 OR strpos(lower(definition),'auth.uid()')=0
      OR strpos(lower(definition),'security definer')=0 THEN
      RAISE EXCEPTION 'Definición sin autorización esperada: %',source;
    END IF;
    IF source LIKE '%lineas_v2(%' AND (strpos(definition,'''codigo''')=0 OR strpos(definition,'''cantidad_os''')=0) THEN
      RAISE EXCEPTION 'Aplicá primero 20260917170000_service_invoice_line_product_code.sql';
    END IF;
    IF source LIKE '%indicadores_v1(%' AND strpos(definition,'''por_marca_tipo''')=0 THEN
      RAISE EXCEPTION 'Aplicá primero 20260915110000_restore_service_summary_brand_breakdown.sql';
    END IF;
    SELECT count(*) INTO matches FROM regexp_matches(definition,base_pattern,'gi');
    IF matches<>1 THEN RAISE EXCEPTION 'Base inesperada (% coincidencias): %',matches,source; END IF;
    target := split_part(source,'(',1)||'_filtrado';
    next_definition := replace(definition,split_part(source,'(',1)||'(',target||'(');
    next_definition := regexp_replace(next_definition,'(\)\s+RETURNS)',', p_filtros jsonb DEFAULT ''{}''::jsonb\1','i');
    next_definition := regexp_replace(next_definition,base_pattern,
      '\1public.ventas_servicios_cumple_filtros(to_jsonb(b),p_filtros) AND ','i');
    next_definition := regexp_replace(next_definition,'(\n\s*WITH base\s+AS)',
      E'\n  PERFORM public.ventas_servicios_validar_filtros(p_filtros);\\1','i');
    IF strpos(next_definition,'PERFORM public.ventas_servicios_validar_filtros')=0
      OR next_definition=definition THEN RAISE EXCEPTION 'No se pudo transformar: %',source; END IF;
    EXECUTE next_definition;
    SELECT format('%s(%s,jsonb)',target,oidvectortypes(proargtypes)) INTO signature FROM pg_proc WHERE oid=source_oid;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',signature);
  END LOOP;
END;
$migration$;
NOTIFY pgrst,'reload schema';
COMMIT;
