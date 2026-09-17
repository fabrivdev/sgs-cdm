BEGIN;
-- Código de producto real, aditivo al contrato financiero. Puede aplicarse sin
-- la migración de cantidad anterior: conserva también cantidad_os/unidad_cantidad.
-- La cantidad financiera no se reescribe. Se agrega la cantidad operacional de
-- la OS como referencia: horas-reloj ya calculadas por el importador o km OS.
-- No sumar jornadas/técnicos ni inferir cantidades dividiendo importes/tarifas.
CREATE OR REPLACE FUNCTION public.ventas_servicios_lineas_v2(
  p_desde date, p_hasta date, p_sucursal text DEFAULT NULL,
  p_tipo_tiempo text DEFAULT NULL, p_marca text DEFAULT NULL,
  p_tipo_maquina text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '120s'
SET plan_cache_mode = 'force_custom_plan'
AS $$
DECLARE v_resultado jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(),'servicios.ventas') THEN
    RAISE EXCEPTION 'No tenes acceso a Ventas de Servicios' USING ERRCODE='42501';
  END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_desde > p_hasta THEN
    RAISE EXCEPTION 'Rango de fechas invalido' USING ERRCODE='22023';
  END IF;
  WITH base AS MATERIALIZED (
    SELECT b.* FROM public.ventas_servicios_movimientos_enriquecidos(p_desde,p_hasta,p_sucursal) b
    WHERE (p_marca IS NULL OR coalesce(b.marca_parque,'Sin identificar')=p_marca)
      AND (p_tipo_maquina IS NULL OR coalesce(b.tipo_maquina,'Sin identificar')=p_tipo_maquina)
  ), filtrada AS MATERIALIZED (
    SELECT * FROM base b
    WHERE p_tipo_tiempo IS NULL OR trim(p_tipo_tiempo)='' OR upper(trim(p_tipo_tiempo))='TODOS'
      OR b.tipo_tiempo=public.ventas_tipo_tiempo_normalizado(p_tipo_tiempo)
  ), ordenes_os AS MATERIALIZED (
    -- Una sola coincidencia normalizada. Las colisiones quedan desconocidas y
    -- nunca multiplican líneas ni toman cantidades de otra OS.
    SELECT upper(btrim(o.os_numero)) AS os_clave,
      CASE WHEN count(*)=1 THEN max(o.servicios_cantidad) END AS horas_os,
      CASE WHEN count(*)=1 THEN max(o.km_cantidad) END AS km_os,
      CASE WHEN count(*)=1 THEN (jsonb_agg(o.raw_data)->0) END AS raw_os
    FROM public.ordenes_servicio_importadas o
    WHERE upper(btrim(o.os_numero)) IN (
      SELECT upper(btrim(f.os_numero)) FROM filtrada f WHERE f.os_numero IS NOT NULL
    )
    GROUP BY upper(btrim(o.os_numero))
  ), cantidades_os AS (
    SELECT o.*,c.codigos
    FROM ordenes_os o
    CROSS JOIN LATERAL (
      SELECT jsonb_object_agg(t.concepto,t.codigo) AS codigos
      FROM (
        SELECT CASE
          WHEN v.codigo ~ '^MA[0-9]+$' THEN 'Servicio'
          WHEN v.codigo ~ '^KM([0-9]+)?$' THEN 'Kilometraje'
          WHEN v.codigo ~ '^SE([0-9]+)?$' THEN 'Terceros'
        END AS concepto,
        CASE WHEN count(DISTINCT v.codigo)=1 THEN min(v.codigo) END AS codigo
        FROM (
          SELECT upper(btrim(valor)) AS codigo
          FROM (
            SELECT o.raw_os->>'CODIGO' AS valor
            UNION ALL SELECT o.raw_os->>'PRODUCTO'
            UNION ALL
            SELECT jsonb_array_elements_text(CASE
              WHEN jsonb_typeof(o.raw_os->'productos_agregados')='array'
              THEN o.raw_os->'productos_agregados' ELSE '[]'::jsonb END)
          ) candidatos
        ) v
        WHERE v.codigo ~ '^(MA[0-9]+|KM([0-9]+)?|SE([0-9]+)?)$'
        GROUP BY 1
      ) t
    ) c
  ), lineas AS (
    SELECT f.*,
      CASE f.concepto WHEN 'Servicio' THEN o.horas_os WHEN 'Kilometraje' THEN o.km_os END AS cantidad_os,
      CASE f.concepto WHEN 'Servicio' THEN 'h' WHEN 'Kilometraje' THEN 'km' ELSE 'unid.' END AS unidad_cantidad,
      CASE
        -- Código específico de factura: identifica la línea en OS mixtas.
        WHEN (f.concepto='Servicio' AND upper(btrim(f.codigo)) ~ '^MA[0-9]+$')
          OR (f.concepto='Kilometraje' AND upper(btrim(f.codigo)) ~ '^KM([0-9]+)?$')
          OR (f.concepto='Terceros' AND upper(btrim(f.codigo)) ~ '^SE([0-9]+)?$')
        THEN upper(btrim(f.codigo))
        WHEN f.concepto IN ('Servicio','Kilometraje','Terceros')
          AND o.codigos->>f.concepto IS NOT NULL THEN o.codigos->>f.concepto
        -- Conservar el código financiero real; no adivinar ni tomar REP ajenos.
        WHEN btrim(f.codigo) ~ '[[:alnum:]]' THEN btrim(f.codigo)
      END AS codigo_detalle
    FROM filtrada f LEFT JOIN cantidades_os o ON o.os_clave=upper(btrim(f.os_numero))
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',l.linea_id,'fecha',l.fecha,'factura',coalesce(l.factura,'Sin numero'),'os',l.os_numero,
    'cliente',coalesce(l.cliente,'Sin cliente'),'sucursal',coalesce(l.sucursal,'Sin sucursal'),
    'tipo_tiempo',l.tipo_tiempo,'propietario',coalesce(l.propietario,'Propietario no informado'),
    'marca',coalesce(l.marca_parque,'Sin identificar'),'tipo_maquina',coalesce(l.tipo_maquina,'Sin identificar'),
    'propietario_os',l.propietario_os,'cliente_os',l.cliente_os,'chasis',l.nro_chasis,
    'descripcion',l.descripcion,'texto_busqueda',l.texto_busqueda,'es_nota_credito',l.es_nota_credito,
    'vinculo_os',l.vinculo_os,
    'componente',CASE WHEN l.concepto='Servicio' THEN 'Mano de obra' ELSE l.concepto END,
    'total_venta',l.total_venta,'cantidad',l.cantidad,
    'cantidad_os',l.cantidad_os,'unidad_cantidad',l.unidad_cantidad,
    'codigo',l.codigo_detalle
  ) ORDER BY l.fecha DESC,l.factura,l.linea_id),'[]'::jsonb)
  INTO v_resultado FROM lineas l;
  RETURN v_resultado;
END;
$$;
REVOKE ALL ON FUNCTION public.ventas_servicios_lineas_v2(date,date,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ventas_servicios_lineas_v2(date,date,text,text,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
