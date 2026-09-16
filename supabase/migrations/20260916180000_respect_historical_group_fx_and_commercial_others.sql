BEGIN;
-- No borra ni altera los archivos/filas originales. Reclasifica rubros.
-- Requiere las fuentes históricas completas y la conciliación de Dashboard.
DO $$ BEGIN
  IF to_regprocedure('public.dashboard_facturacion_fuente_v1(date,date)') IS NULL
    OR to_regclass('public.v_ventas_repuestos_historico_completo') IS NULL THEN
    RAISE EXCEPTION 'Aplicá primero 20260915160000 y 20260916160000.';
  END IF;
END $$;

-- Lista conservadora de conceptos comerciales que no son postventa.
-- No excluir repuestos desconocidos por falta de catálogo ni por su marca.
CREATE OR REPLACE FUNCTION public.ventas_es_otro_comercial(p_descripcion text,p_grupo text)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path=public,pg_temp AS $$
  SELECT lower(translate(concat_ws(' ',p_descripcion,p_grupo),
    'áéíóúÁÉÍÓÚ','aeiouAEIOU')) ~
    '(costos?|gastos?|cargos?|tasas?)[[:space:]]+(de[[:space:]]+)?envios?|costoenvio|(^|[^a-z])interes(es)?([^a-z]|$)|merchand|merchad';
$$;
REVOKE ALL ON FUNCTION public.ventas_es_otro_comercial(text,text) FROM PUBLIC,anon,authenticated;

create or replace function public.ventas_area_movimientos_base(
  p_desde date,
  p_hasta date,
  p_sucursal text default null,
  p_buscar text default null
)
returns table (
  linea_id text,
  fecha date,
  factura text,
  cliente text,
  sucursal text,
  concepto text,
  total_venta numeric,
  metodologia text,
  vinculada_os boolean,
  es_nota_credito boolean,
  os_numero text,
  codigo text,
  codigo_fabricante text,
  descripcion text,
  cantidad numeric,
  marca text,
  modelo text,
  chasis text,
  area_calculada text
)
language sql
stable
security definer
set search_path = public, pg_temp
set statement_timeout = '120s'
set plan_cache_mode = 'force_custom_plan'
as $$
  with movimientos as (
    select
      f.id::text as linea_id,
      f.fecha::date as fecha,
      nullif(trim(f.cod_factura), '') as factura,
      f.entidad_nombre as cliente,
      f.sucursal::text as sucursal,
      case
        -- GRUPO FX es la clasificación comercial del histórico de Servicios.
        -- Un grupo genérico SERVICE/SERVICIOS no prueba que sea mano de obra.
        when upper(btrim(coalesce(f.grupo_fx,''))) = 'MANO DE OBRA' then 'Servicio'
        when upper(btrim(coalesce(f.grupo_fx,''))) = 'KILOMETRAJE' then 'Kilometraje'
        when lower(btrim(coalesce(f.grupo_fx,''))) like '%tercero%' then 'Terceros'
        when lower(btrim(coalesce(nullif(btrim(f.grupo_fx),''),f.grupo,''))) like '%maquin%' then 'Maquinarias'
        when lower(btrim(coalesce(nullif(btrim(f.grupo_fx),''),f.grupo,''))) like '%repuesto%' then 'Repuestos'
        else 'Otros'
      end as concepto,
      coalesce(f.total_venta, 0)::numeric as total_venta,
      'historico'::text as metodologia,
      false as vinculada_os,
      false as es_nota_credito,
      null::text as os_numero,
      null::text as codigo,
      null::text as codigo_fabricante,
      nullif(trim(coalesce(f.grupo_fx, f.grupo)), '') as descripcion,
      coalesce(f.cantidad, 0)::numeric as cantidad,
      null::text as marca,
      '{}'::jsonb as raw_data
    from public.facturacion f
    where f.fecha::date between p_desde and least(p_hasta, date '2026-06-30')
      and not coalesce(f.excluido_de_reportes, false)
      and upper(trim(coalesce(f.moneda, 'USD'))) = 'USD'

    union all

    select
      f.id::text,
      f.fecha_factura::date,
      coalesce(nullif(trim(f.factura), ''), nullif(trim(f.codigo_interno_factura), '')),
      f.entidad_nombre,
      f.sucursal::text,
      case
        when public.ventas_es_otro_comercial(
          concat_ws(' ',f.mercaderia,f.observacion),
          concat_ws(' ',f.grupo_normalizado,f.subgrupo_original)
        ) then 'Otros'
        when left(upper(trim(coalesce(f.cod_mercaderia, ''))), 5) = 'VEIC_'
          or (
            lower(coalesce(f.mercaderia, '') || ' ' || coalesce(f.observacion, '')) like '%tipo:%'
            and lower(coalesce(f.mercaderia, '') || ' ' || coalesce(f.observacion, '')) like '%modelo:%'
            and (
              lower(coalesce(f.mercaderia, '') || ' ' || coalesce(f.observacion, '')) like '%casis:%'
              or lower(coalesce(f.mercaderia, '') || ' ' || coalesce(f.observacion, '')) like '%chasis:%'
            )
          )
        then 'Maquinarias'
        when lower(trim(coalesce(f.grupo_normalizado, f.subgrupo_original, ''))) like '%maquin%' then 'Maquinarias'
        when lower(trim(coalesce(f.grupo_normalizado, f.subgrupo_original, ''))) like '%repuesto%' then 'Repuestos'
        when lower(trim(coalesce(f.grupo_normalizado, f.subgrupo_original, ''))) like '%kilometr%' then 'Kilometraje'
        when lower(trim(
          coalesce(f.grupo_normalizado, f.subgrupo_original, '') || ' ' ||
          coalesce(f.mercaderia, '') || ' ' || coalesce(f.observacion, '')
        )) like '%tercero%' then 'Terceros'
        when lower(trim(coalesce(f.grupo_normalizado, f.subgrupo_original, ''))) like '%servic%'
          or lower(trim(coalesce(f.grupo_normalizado, f.subgrupo_original, ''))) like '%mano de obra%' then 'Servicio'
        else 'Otros'
      end,
      coalesce(f.total_venta, 0)::numeric,
      'actual'::text,
      nullif(trim(coalesce(f.raw_data ->> 'linked_service_order', '')), '') is not null,
      coalesce(f.raw_data ->> 'canonical_document_kind', '') = 'NotaCredito'
        or upper(coalesce(public.valor_json_insensible(f.raw_data, array['ESPECIE']), '')) like '%NCC%'
        or coalesce(f.total_venta, 0) < 0,
      nullif(trim(coalesce(f.raw_data ->> 'linked_service_order', '')), ''),
      nullif(trim(f.cod_mercaderia), ''),
      nullif(trim(f.codigo_fabricante), ''),
      coalesce(nullif(trim(f.mercaderia), ''), nullif(trim(f.observacion), ''), nullif(trim(f.subgrupo_original), '')),
      coalesce(f.cantidad, 0)::numeric,
      f.marca_normalizada::text,
      coalesce(f.raw_data, '{}'::jsonb)
    from public.facturacion_lineas_importadas f
    where f.fecha_factura is not null
      and f.fecha_factura::date between greatest(p_desde, date '2026-07-01') and p_hasta
      and upper(trim(coalesce(f.moneda, 'USD'))) = 'USD'
  ), clasificados as (
    select
      m.*,
      case
        when m.metodologia = 'historico' then case
          when m.concepto = 'Maquinarias' then 'maquinas'
          when m.concepto = 'Repuestos' then 'repuestos'
          when m.concepto in ('Servicio', 'Kilometraje', 'Terceros') then 'servicios'
          else 'otros'
        end
        when m.concepto = 'Maquinarias' then 'maquinas'
        when m.concepto = 'Otros' then 'otros'
        when m.vinculada_os then 'servicios'
        when m.concepto = 'Repuestos' then 'repuestos'
        when m.es_nota_credito and m.concepto in ('Servicio', 'Kilometraje', 'Terceros') then 'servicios'
        when m.concepto in ('Servicio', 'Kilometraje', 'Terceros') then 'revision'
        else 'otros'
      end as area_calculada
    from movimientos m
  ), filtrados as (
    select *
    from clasificados c
    where (
        p_sucursal is null or trim(p_sucursal) = '' or upper(trim(p_sucursal)) = 'TODAS'
        or upper(coalesce(c.sucursal, '')) = upper(trim(p_sucursal))
      )
      and (
        p_buscar is null or trim(p_buscar) = ''
        or coalesce(c.factura, '') ilike '%' || trim(p_buscar) || '%'
        or coalesce(c.cliente, '') ilike '%' || trim(p_buscar) || '%'
        or c.concepto ilike '%' || trim(p_buscar) || '%'
        or coalesce(c.os_numero, '') ilike '%' || trim(p_buscar) || '%'
        or coalesce(c.codigo, '') ilike '%' || trim(p_buscar) || '%'
        or coalesce(c.codigo_fabricante, '') ilike '%' || trim(p_buscar) || '%'
        or coalesce(c.descripcion, '') ilike '%' || trim(p_buscar) || '%'
        or c.raw_data::text ilike '%' || trim(p_buscar) || '%'
      )
  )
  select
    f.linea_id, f.fecha, f.factura, f.cliente, f.sucursal, f.concepto,
    f.total_venta, f.metodologia, f.vinculada_os, f.es_nota_credito,
    f.os_numero, f.codigo, f.codigo_fabricante, f.descripcion, f.cantidad, f.marca,
    case when f.metodologia = 'actual' and f.concepto = 'Maquinarias' then
      regexp_replace(
        coalesce(
          nullif(trim(public.valor_json_insensible(f.raw_data, array['MODELO', 'MODEL'])), ''),
          nullif(trim((regexp_match(coalesce(f.descripcion, ''), '(?i)MODELO[[:space:]]*:[[:space:]]*([^|;]+)'))[1]), ''),
          f.descripcion
        ),
        '[[:space:]]*[-·]?[[:space:]]*(CHASIS|CASIS)[[:space:]]*:.*$', '', 'i'
      )
    else null end as modelo,
    case when f.metodologia = 'actual' and f.concepto = 'Maquinarias'
      then public.extraer_chasis_venta_maquina(f.descripcion, f.raw_data, f.os_numero)
      else null end as chasis,
    f.area_calculada
  from filtrados f;
$$;

revoke all on function public.ventas_area_movimientos_base(date, date, text, text) from public, anon, authenticated;


CREATE OR REPLACE VIEW public.v_ventas_repuestos_historico_completo
WITH (security_invoker = true) AS
SELECT f.id::text AS linea_id, f.fecha_factura::date AS fecha,
  coalesce(nullif(btrim(f.factura),''),nullif(btrim(f.codigo_interno_factura),'')) AS factura,
  f.entidad_nombre AS cliente,
  CASE upper(btrim(coalesce(f.raw_data->>'sucursal_original','')))
    WHEN 'CENTRAL' THEN 'Santa Rita' WHEN 'SANTA RITA' THEN 'Santa Rita'
    WHEN 'SR' THEN 'Santa Rita' WHEN 'KATUETE' THEN 'Katuete'
    WHEN 'KT' THEN 'Katuete' WHEN 'CAMPO 9' THEN 'Campo 9'
    WHEN 'CAMPO9' THEN 'Campo 9' WHEN 'C9' THEN 'Campo 9'
    WHEN 'MISIONES' THEN 'Misiones' WHEN 'MS' THEN 'Misiones'
    WHEN 'LOMA PLATA' THEN 'Loma Plata'
    WHEN 'SANTA ROSA DEL AGUARAY' THEN 'Santa Rosa' WHEN 'SANTA ROSA' THEN 'Santa Rosa'
    ELSE coalesce(nullif(btrim(f.raw_data->>'sucursal_original'),''),'Sucursal no informada')
  END AS sucursal,
  coalesce(p.codigo_interno,nullif(btrim(f.cod_mercaderia),'')) AS codigo,
  coalesce(nullif(btrim(f.codigo_fabricante),''),p.codigo_fabricante) AS codigo_fabricante,
  coalesce(nullif(btrim(f.mercaderia),''),p.descripcion,'Descripción no informada') AS descripcion,
  f.cod_mercaderia AS codigo_legacy,
  f.cantidad * coalesce(conv.factor_cantidad,1) AS cantidad,
  coalesce(f.total_venta,0) AS importe,
  upper(coalesce(f.raw_data->>'movimiento','S'))='E' OR f.total_venta<0 AS es_nota_credito,
  f.fecha_factura,
  CASE WHEN public.ventas_es_otro_comercial(
    concat_ws(' ',f.mercaderia,f.observacion),
    concat_ws(' ',f.subgrupo_original,f.grupo_normalizado,f.raw_data->>'grupo_original')
  ) THEN 'Otros' ELSE 'Repuestos' END AS concepto
FROM public.facturacion_lineas_importadas f
LEFT JOIN public.repuestos_ventas_vinculacion v
  ON v.linea_id=f.id AND v.estado_vinculo='CONFIRMADA'
LEFT JOIN public.productos p ON p.codigo_interno=v.producto_codigo
LEFT JOIN LATERAL (
  SELECT r.factor_cantidad FROM public.repuestos_conversiones_unidad_historica r
  WHERE r.activa AND r.codigo_legacy_norm=public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia)
    AND (r.fecha_desde IS NULL OR f.fecha_factura::date>=r.fecha_desde)
    AND (r.fecha_hasta_exclusiva IS NULL OR f.fecha_factura::date<r.fecha_hasta_exclusiva)
    AND (r.precio_unitario_min IS NULL OR abs(f.total_venta/nullif(f.cantidad,0))>=r.precio_unitario_min)
    AND (r.precio_unitario_max IS NULL OR abs(f.total_venta/nullif(f.cantidad,0))<=r.precio_unitario_max)
  ORDER BY r.id LIMIT 1
) conv ON true
WHERE f.origen_sistema='legacy_historico_detallado'
  AND f.fecha_factura < timestamptz '2026-07-01 00:00:00+00'
  AND upper(btrim(coalesce(f.moneda,'USD')))='USD';
REVOKE ALL ON public.v_ventas_repuestos_historico_completo FROM PUBLIC,anon,authenticated;


CREATE OR REPLACE FUNCTION public.ventas_repuestos_movimientos_v1(
  p_desde date, p_hasta date, p_sucursal text, p_buscar text
) RETURNS TABLE(id text,fecha date,factura text,cliente text,sucursal text,
  metodologia text,codigo text,codigo_fabricante text,descripcion text,
  cantidad numeric,importe numeric,es_nota_credito boolean,documento text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH fuentes AS (
    SELECT h.linea_id,h.fecha,h.factura,h.cliente,h.sucursal,'historico'::text AS metodologia,
      h.codigo,h.codigo_fabricante,h.descripcion,h.cantidad,h.importe,h.es_nota_credito,h.codigo_legacy
    FROM public.v_ventas_repuestos_historico_completo h
    WHERE h.concepto='Repuestos'
      AND h.fecha_factura >= p_desde::timestamptz
      AND h.fecha_factura < (least(p_hasta,date '2026-06-30')+1)::timestamptz
    UNION ALL
    SELECT m.linea_id,m.fecha,m.factura,m.cliente,m.sucursal,m.metodologia,
      m.codigo,m.codigo_fabricante,m.descripcion,m.cantidad,m.total_venta,
      m.es_nota_credito OR m.total_venta<0,m.codigo
    FROM public.ventas_area_movimientos_base(greatest(p_desde,date '2026-07-01'),p_hasta,NULL,NULL) m
    WHERE m.area_calculada='repuestos' AND m.fecha>=date '2026-07-01'
  ), canonico AS (
    SELECT *,coalesce(public.cliente_nombre_canonico(cliente),'Cliente no informado') AS cliente_final
    FROM fuentes
  )
  SELECT metodologia||':'||linea_id,fecha,factura,cliente_final,sucursal,
    metodologia,codigo,codigo_fabricante,descripcion,
    CASE WHEN es_nota_credito THEN -abs(cantidad) ELSE cantidad END,importe,es_nota_credito,
    jsonb_build_array(metodologia,fecha,sucursal,coalesce(factura,'linea:'||linea_id),es_nota_credito)::text
  FROM canonico
  WHERE (nullif(btrim(p_sucursal),'') IS NULL OR upper(btrim(p_sucursal))='TODAS'
    OR upper(sucursal)=upper(btrim(p_sucursal)))
    AND (nullif(btrim(p_buscar),'') IS NULL OR concat_ws(' ',cliente_final,cliente,factura,
      codigo,codigo_fabricante,codigo_legacy,descripcion) ILIKE '%'||btrim(p_buscar)||'%');
$$;
REVOKE ALL ON FUNCTION public.ventas_repuestos_movimientos_v1(date,date,text,text)
  FROM PUBLIC,anon,authenticated;


CREATE OR REPLACE FUNCTION public.dashboard_facturacion_fuente_v1(p_desde date,p_hasta date)
RETURNS TABLE(id text,fecha date,sucursal text,tipo text,cliente_id uuid,
  entidad_nombre text,total_venta numeric,cantidad numeric,grupo text,grupo_fx text,
  cod_factura text,tipo_tiempo text,marca text,origen_sistema text,raw_data jsonb,
  concepto text,area_calculada text,codigo_fabricante text,cod_mercaderia text,mercaderia text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
WITH base AS MATERIALIZED (
  SELECT * FROM public.ventas_area_movimientos_base(p_desde,p_hasta,NULL,NULL)
), fuente AS MATERIALIZED (
  SELECT m.metodologia||':'||m.linea_id AS id,m.linea_id,m.fecha,m.sucursal,m.cliente,
    m.total_venta,m.cantidad,m.concepto,m.area_calculada,m.metodologia,
    m.factura,m.codigo,m.codigo_fabricante,m.descripcion,m.marca
  FROM base m
  -- Nunca sumar el resumen histórico de repuestos además del detalle completo.
  WHERE (m.metodologia<>'historico' OR m.area_calculada<>'repuestos')
    -- El detalle completo también es la fuente única de los Otros de esa hoja.
    -- No volver a sumar su resumen clásico, incluso si su concepto es Otros.
    AND NOT (m.metodologia='historico' AND EXISTS (
      SELECT 1 FROM public.facturacion r
      WHERE r.id::text=m.linea_id AND r.tipo::text='Repuesto'
    ))
  UNION ALL
  SELECT 'historico:'||h.linea_id,h.linea_id,h.fecha,h.sucursal,h.cliente,h.importe,
    CASE WHEN h.es_nota_credito THEN -abs(h.cantidad) ELSE h.cantidad END,
    h.concepto,CASE WHEN h.concepto='Repuestos' THEN 'repuestos' ELSE 'otros' END,
    'historico',h.factura,h.codigo,h.codigo_fabricante,h.descripcion,NULL
  FROM public.v_ventas_repuestos_historico_completo h
  WHERE h.fecha_factura>=p_desde::timestamptz
    AND h.fecha_factura<(least(p_hasta,date '2026-06-30')+1)::timestamptz
), historico AS MATERIALIZED (
  SELECT f.*,public.cliente_nombre_canonico(f.entidad_nombre) AS cliente_clave,
    upper(btrim(f.sucursal::text)) AS sucursal_clave
  FROM public.facturacion_lineas_importadas f
  JOIN fuente s ON s.linea_id=f.id::text AND s.metodologia='historico' AND s.area_calculada='repuestos'
), grid AS MATERIALIZED (
  SELECT g.*,public.cliente_nombre_canonico(g.entidad_nombre) AS cliente_clave,
    upper(btrim(g.sucursal::text)) AS sucursal_clave
  FROM public.facturacion_lineas_importadas g
  WHERE g.origen_sistema='grid_campos'
    AND g.fecha_factura>=p_desde::timestamptz
    AND g.fecha_factura<(least(p_hasta,date '2026-06-30')+1)::timestamptz
    AND upper(btrim(coalesce(g.moneda,'USD')))='USD'
), registradas AS MATERIALIZED (
  SELECT g.id AS grid_id,h.id AS historico_id,g.tipo_tiempo::text AS tipo_grid
  FROM grid g JOIN public.repuestos_ventas_duplicadas d ON d.linea_id=g.id
  JOIN historico h ON h.id=d.linea_canonica_id
  WHERE abs(g.total_venta-h.total_venta)<=0.01 AND g.cantidad=h.cantidad
    AND g.fecha_factura::date=h.fecha_factura::date
    AND g.cliente_clave=h.cliente_clave
    AND nullif(g.sucursal_clave,'')=h.sucursal_clave
), candidatos AS MATERIALIZED (
  SELECT g.id AS grid_id,h.id AS historico_id,g.tipo_tiempo::text AS tipo_grid
  FROM grid g JOIN historico h
    ON g.fecha_factura::date=h.fecha_factura::date
    AND g.cliente_clave=h.cliente_clave
    AND nullif(g.sucursal_clave,'')=h.sucursal_clave
    AND ((nullif(upper(btrim(g.cod_mercaderia)),'')=upper(btrim(h.cod_mercaderia)))
      OR (nullif(upper(btrim(g.codigo_fabricante)),'')=upper(btrim(h.codigo_fabricante))))
    AND ((nullif(upper(btrim(g.factura)),'')=upper(btrim(h.factura)))
      OR (nullif(upper(btrim(g.codigo_interno_factura)),'')=upper(btrim(h.codigo_interno_factura))))
    AND g.cantidad=h.cantidad AND abs(g.total_venta-h.total_venta)<=0.01
  WHERE NOT EXISTS(SELECT 1 FROM public.repuestos_ventas_duplicadas d WHERE d.linea_id=g.id)
), candidatos_controlados AS (
  SELECT c.*,count(*) OVER(PARTITION BY grid_id) AS destinos,
    count(*) OVER(PARTITION BY historico_id) AS origenes
  FROM candidatos c
), relaciones AS (
  SELECT * FROM registradas
  UNION ALL
  SELECT grid_id,historico_id,tipo_grid FROM candidatos_controlados c
  WHERE destinos=1 AND origenes=1
    AND NOT EXISTS(SELECT 1 FROM public.repuestos_ventas_duplicadas d
      JOIN public.facturacion_lineas_importadas g ON g.id=d.linea_id AND g.origen_sistema='grid_campos'
      WHERE d.linea_canonica_id=c.historico_id)
), metadatos AS (
  -- Una fila por destino, nunca una expansión de movimientos monetarios.
  -- Si hay conflicto de tipos, no imponer ninguno de los candidatos.
  SELECT historico_id,
    CASE WHEN count(DISTINCT nullif(btrim(tipo_grid),''))=1
      THEN min(nullif(btrim(tipo_grid),'')) END AS tipo_grid,
    count(DISTINCT nullif(btrim(tipo_grid),''))>1 AS conflicto
  FROM relaciones GROUP BY historico_id
)
SELECT s.id,s.fecha,s.sucursal,
  CASE WHEN s.concepto='Repuestos' THEN 'Repuesto' ELSE 'Servicio' END,
  CASE WHEN public.cliente_nombre_canonico(s.cliente)<>s.cliente THEN NULL ELSE l.cliente_id END,
  coalesce(public.cliente_nombre_canonico(s.cliente),'Cliente no informado'),
  s.total_venta,s.cantidad,
  coalesce(f.subgrupo_original,l.grupo,s.descripcion),s.concepto,
  coalesce(nullif(btrim(f.codigo_interno_factura),''),s.factura,'linea:'||s.id),
  CASE WHEN md.conflicto THEN NULL
    WHEN md.tipo_grid IS NOT NULL THEN md.tipo_grid
    WHEN s.metodologia='actual' THEN nullif(btrim(f.tipo_tiempo::text),'')
    -- El resumen histórico no informa el tipo de tiempo de la OS.
    WHEN s.area_calculada='repuestos' THEN nullif(btrim(f.tipo_tiempo::text),'')
    ELSE NULL END,
  coalesce(s.marca,f.marca_normalizada::text,
    CASE WHEN upper(coalesce(l.grupo,s.descripcion,'')) LIKE '%CLAAS%' THEN 'CLAAS'
      WHEN upper(coalesce(l.grupo,s.descripcion,'')) LIKE '%HORSCH%' THEN 'HORSCH' ELSE 'OTROS' END),
  coalesce(f.origen_sistema,'legacy'),
  -- No enviar el XML/Excel completo por cada fila paginada. El original
  -- permanece intacto en la tabla; códigos y descripción van en sus columnas.
  jsonb_strip_nulls(jsonb_build_object(
    'linked_service_order',f.raw_data->'linked_service_order',
    'canonical_document_kind',f.raw_data->'canonical_document_kind',
    'dashboard_time_type_source',CASE WHEN md.conflicto THEN 'conflicto_grid'
      WHEN md.tipo_grid IS NOT NULL THEN 'grid_inferido'
      WHEN f.tipo_tiempo IS NOT NULL THEN 'importado' ELSE 'no_informado' END)),
  s.concepto,s.area_calculada,s.codigo_fabricante,s.codigo,s.descripcion
FROM fuente s
LEFT JOIN public.facturacion_lineas_importadas f ON f.id::text=s.linea_id
  AND (s.metodologia='actual' OR s.area_calculada='repuestos'
    OR f.origen_sistema='legacy_historico_detallado')
LEFT JOIN public.facturacion l ON l.id::text=s.linea_id
  AND s.metodologia='historico' AND s.area_calculada<>'repuestos' AND f.id IS NULL
LEFT JOIN metadatos md ON md.historico_id=f.id
ORDER BY s.fecha DESC,s.id;
$$;
REVOKE ALL ON FUNCTION public.dashboard_facturacion_fuente_v1(date,date) FROM PUBLIC,anon,authenticated;


NOTIFY pgrst,'reload schema';
COMMIT;
