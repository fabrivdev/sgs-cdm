BEGIN;
-- Requiere 20260915100000_unify_service_sales_identity_and_search.sql.
-- No modifica propietarios originales, facturas, OS, stock, permisos ni Comisiones.
-- Resuelve identidad actual por chasis, con stock propio como respaldo.
CREATE OR REPLACE FUNCTION public.cliente_nombre_canonico(p_nombre text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN public.ventas_servicios_texto_normalizado(p_nombre)
    ~ '^CAMPOS DEL MANANA( |$)' THEN 'CAMPOS DEL MAÑANA S.A.'
    ELSE nullif(btrim(p_nombre),'') END;
$$;

CREATE OR REPLACE FUNCTION public.ventas_servicios_maquinas_identidad()
RETURNS TABLE(chasis_clave text,propietario text,marca_parque text,
  tipo_maquina text,modelo_tipo text,fuente_propietario text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '60s'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(),'servicios.ventas') THEN
    RAISE EXCEPTION 'No tenes acceso a Ventas de Servicios' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  WITH candidatos AS (
    SELECT public.parque_normalizar_clave(p.serie) AS clave,
      public.cliente_nombre_canonico(c.nombre) AS dueno,
      nullif(btrim(coalesce(nullif(p.marca_nombre,''),p.marca::text)),'') AS marca,
      nullif(btrim(coalesce(nullif(p.subgrupo_personalizado,''),p.subgrupo::text)),'') AS tipo,
      nullif(btrim(p.modelo_tipo),'') AS modelo,
      CASE WHEN nullif(btrim(c.nombre),'') IS NOT NULL THEN 1 ELSE 3 END AS prioridad,
      'parque'::text AS fuente
    FROM public.parque_maquinas p LEFT JOIN public.clientes c ON c.id=p.cliente_id
    WHERE p.activo AND nullif(public.parque_normalizar_clave(p.serie),'') IS NOT NULL
    UNION ALL
    -- Sólo saldo positivo vigente: una fila agotada no demuestra propiedad actual.
    SELECT public.parque_normalizar_clave(s.chasis),'CAMPOS DEL MAÑANA S.A.',
      nullif(btrim(s.marca),''),nullif(btrim(s.tipo),''),nullif(btrim(s.modelo),''),2,'stock'
    FROM public.parque_stock_maquinas s
    WHERE s.saldo_actual>0 AND nullif(public.parque_normalizar_clave(s.chasis),'') IS NOT NULL
  ), seleccion AS (
    SELECT c.*,min(c.prioridad) OVER (PARTITION BY c.clave) AS elegida FROM candidatos c
  )
  SELECT c.clave,
    CASE WHEN count(DISTINCT public.ventas_servicios_texto_normalizado(c.dueno)) FILTER (WHERE c.dueno IS NOT NULL)=1
      THEN max(c.dueno) END,
    CASE WHEN count(DISTINCT public.ventas_servicios_texto_normalizado(c.marca)) FILTER (WHERE c.marca IS NOT NULL)=1
      THEN max(c.marca) END,
    CASE WHEN count(DISTINCT public.ventas_servicios_texto_normalizado(c.tipo)) FILTER (WHERE c.tipo IS NOT NULL)=1
      THEN max(c.tipo) END,
    CASE WHEN count(DISTINCT public.ventas_servicios_texto_normalizado(c.modelo)) FILTER (WHERE c.modelo IS NOT NULL)=1
      THEN max(c.modelo) END,
    CASE WHEN count(DISTINCT public.ventas_servicios_texto_normalizado(c.dueno)) FILTER (WHERE c.dueno IS NOT NULL)>1
      THEN 'ambiguo' ELSE max(c.fuente) END
  FROM seleccion c WHERE c.prioridad=c.elegida GROUP BY c.clave;
END;
$$;
REVOKE ALL ON FUNCTION public.ventas_servicios_maquinas_identidad() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ventas_servicios_maquinas_identidad() TO authenticated;

CREATE OR REPLACE FUNCTION public.ventas_servicios_movimientos_enriquecidos(
  p_desde date, p_hasta date, p_sucursal text DEFAULT NULL
)
RETURNS TABLE (
  linea_id text, fecha date, factura text, cliente text, sucursal text,
  concepto text, total_venta numeric, metodologia text, vinculada_os boolean,
  es_nota_credito boolean, os_numero text, codigo text, codigo_fabricante text,
  descripcion text, cantidad numeric, marca text, modelo text, chasis text,
  area_calculada text, nro_chasis text, propietario text, propietario_os text,
  cliente_os text, marca_parque text, tipo_maquina text, tipo_tiempo text,
  vinculo_os text, texto_busqueda text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '120s'
SET plan_cache_mode = 'force_custom_plan'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(),'servicios.ventas') THEN
    RAISE EXCEPTION 'No tenes acceso a Ventas de Servicios' USING ERRCODE='42501';
  END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_desde > p_hasta THEN
    RAISE EXCEPTION 'Rango de fechas invalido' USING ERRCODE='22023';
  END IF;
  RETURN QUERY
  WITH movimientos AS MATERIALIZED (
    SELECT b.* FROM public.ventas_area_movimientos_base(p_desde,p_hasta,p_sucursal,NULL) b
    WHERE b.area_calculada='servicios'
      AND b.concepto IN ('Servicio','Kilometraje','Repuestos','Terceros')
  ), ordenes_unicas AS MATERIALIZED (
    -- La PK original no impide duplicados que sólo difieran en espacios/case.
    SELECT o.* FROM (
      SELECT os.*,count(*) OVER (PARTITION BY upper(btrim(os.os_numero))) AS coincidencias
      FROM public.ordenes_servicio_importadas os
    ) o WHERE o.coincidencias=1
  ), documentos AS MATERIALIZED (
    SELECT DISTINCT b.factura, b.sucursal, extract(year FROM b.fecha)::integer AS anio
    FROM movimientos b WHERE b.metodologia='historico' AND b.factura IS NOT NULL
  ), referencias AS MATERIALIZED (
    -- Se desglosan las facturas de las OS una sola vez, no por línea facturada.
    SELECT os.os_numero, public.ventas_servicios_factura_clave(t.factura) AS factura_clave,
      extract(year FROM os.fecha_emision_factura AT TIME ZONE 'America/Asuncion')::integer AS anio,
      public.ventas_servicios_texto_normalizado(coalesce(
        nullif(btrim(os.raw_data->>'canonical_branch'),''), trabajo.sucursal::text)) AS sucursal_clave
    FROM public.ordenes_servicio_importadas os
    LEFT JOIN public.trabajos trabajo ON trabajo.id=os.trabajo_id
    CROSS JOIN LATERAL regexp_split_to_table(coalesce(os.factura,''),';') t(factura)
    WHERE os.fecha_emision_factura IS NOT NULL AND p_desde <= date '2026-06-30'
      AND nullif(btrim(t.factura),'') IS NOT NULL
  ), correspondencias AS MATERIALIZED (
    SELECT d.factura,d.sucursal,d.anio,
      CASE WHEN count(DISTINCT r.os_numero)=1 THEN min(r.os_numero) END AS os_numero,
      count(DISTINCT r.os_numero) AS candidatos
    FROM documentos d LEFT JOIN referencias r
      ON r.factura_clave=public.ventas_servicios_factura_clave(d.factura)
      AND r.anio=d.anio AND r.sucursal_clave<>''
      AND r.sucursal_clave=public.ventas_servicios_texto_normalizado(d.sucursal)
    GROUP BY d.factura,d.sucursal,d.anio
  ), maquinas AS MATERIALIZED (
    SELECT * FROM public.ventas_servicios_maquinas_identidad()
  ), enriquecidos AS (
    SELECT b.linea_id,b.fecha,b.factura,public.cliente_nombre_canonico(b.cliente) AS cliente,b.sucursal,b.concepto,b.total_venta,
      b.metodologia,(b.vinculada_os OR co.os_numero IS NOT NULL) AS vinculada_os,
      b.es_nota_credito,coalesce(b.os_numero,co.os_numero) AS os_numero,
      b.codigo,b.codigo_fabricante,b.descripcion,b.cantidad,b.marca,b.modelo,b.chasis,b.area_calculada,
      nullif(btrim(os.nro_chasis),'') AS nro_chasis,m.propietario,
      public.cliente_nombre_canonico(coalesce(nullif(btrim(os.raw_data->>'Nombre'),''),
        CASE WHEN os.raw_data->>'CLIFAC' IS NULL THEN nullif(btrim(os.cliente_nombre),'') END)) AS propietario_os,
      public.cliente_nombre_canonico(os.cliente_nombre) AS cliente_os,m.marca_parque,m.tipo_maquina,
      public.ventas_tipo_tiempo_normalizado(coalesce(nullif(fl.tipo_tiempo,''),
        nullif(fl.raw_data->>'canonical_time_type',''),os.tipo_tiempo)) AS tipo_tiempo,
      CASE WHEN b.os_numero IS NOT NULL THEN 'actual'
        WHEN co.os_numero IS NOT NULL THEN 'factura_sucursal_anio'
        WHEN co.candidatos>1 THEN 'ambiguo' ELSE 'sin_vinculo_verificable' END AS vinculo_os
    FROM movimientos b
    LEFT JOIN correspondencias co ON b.metodologia='historico' AND co.factura=b.factura
      AND co.sucursal IS NOT DISTINCT FROM b.sucursal AND co.anio=extract(year FROM b.fecha)::integer
    LEFT JOIN public.facturacion_lineas_importadas fl
      ON fl.id=CASE WHEN b.metodologia='actual' THEN b.linea_id::uuid ELSE NULL::uuid END
    LEFT JOIN ordenes_unicas os
      ON upper(btrim(os.os_numero))=upper(btrim(coalesce(b.os_numero,co.os_numero)))
    LEFT JOIN maquinas m ON m.chasis_clave=public.parque_normalizar_clave(os.nro_chasis)
  )
  SELECT e.*,public.ventas_servicios_texto_normalizado(concat_ws(' ',
    e.os_numero,e.factura,e.propietario,e.propietario_os,e.cliente_os,e.cliente,
    e.nro_chasis,e.tipo_tiempo,e.descripcion)) FROM enriquecidos e;
END;
$$;

create or replace function public.ventas_servicios_historial(p_chasis text, p_vista text default 'os')
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
set statement_timeout = '120s'
set plan_cache_mode = 'force_custom_plan'
as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.has_section_access(auth.uid(), 'servicios.ventas') then
    raise exception 'No tenes acceso a Ventas de Servicios' using errcode = '42501';
  end if;
  if nullif(public.parque_normalizar_clave(p_chasis),'') is null then
    raise exception 'Chasis requerido';
  end if;
  if p_vista = 'os' then
    select coalesce(jsonb_agg(to_jsonb(o) order by o.fecha_abierta_os desc nulls last, o.os_numero), '[]'::jsonb)
    into result from (
      select os_numero, fecha_abierta_os, fecha_cierre_os, tipo_tiempo, servicios_cantidad,
        km_cantidad, responsable, situacion_os, factura, raw_data
      from public.ordenes_servicio_importadas
      where nro_chasis is not null and public.parque_normalizar_clave(nro_chasis) = public.parque_normalizar_clave(p_chasis)
    ) o;
  elsif p_vista = 'maquina' then
    select jsonb_build_object('modelo_tipo',m.modelo_tipo,
      'clientes',jsonb_build_object('nombre',m.propietario),
      'fuente_propietario',m.fuente_propietario) into result
    from public.ventas_servicios_maquinas_identidad() m
    where m.chasis_clave=public.parque_normalizar_clave(p_chasis);
  elsif p_vista = 'repuestos' then
    with ordenes as materialized (
      select distinct os_numero from public.ordenes_servicio_importadas
      where nro_chasis is not null and public.parque_normalizar_clave(nro_chasis) = public.parque_normalizar_clave(p_chasis)
    )
    select coalesce(jsonb_agg(to_jsonb(p) order by p.fecha_factura desc, p.id), '[]'::jsonb) into result
    from (
      select f.id, f.fecha_factura, f.factura, f.cod_mercaderia, f.codigo_fabricante,
        f.mercaderia, f.observacion, f.cantidad, f.total_venta,
        jsonb_build_object('linked_service_order', f.raw_data->>'linked_service_order') as raw_data
      from ordenes o join public.facturacion_lineas_importadas f
        on f.raw_data->>'linked_service_order' = o.os_numero
      where lower(coalesce(nullif(f.grupo_normalizado,''), f.subgrupo_original,'')) like '%repuesto%'
    ) p;
  else
    raise exception 'Vista no válida';
  end if;
  return result;
end;
$$;

REVOKE ALL ON FUNCTION public.ventas_servicios_movimientos_enriquecidos(date,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ventas_servicios_movimientos_enriquecidos(date,date,text) TO authenticated;
REVOKE ALL ON FUNCTION public.ventas_servicios_historial(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ventas_servicios_historial(text,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
