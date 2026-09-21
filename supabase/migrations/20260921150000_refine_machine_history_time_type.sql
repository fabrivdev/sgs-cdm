BEGIN;

-- Complementa la clasificación del historial cuando el archivo legado no
-- guardó el nombre del cliente en la OS, pero sí dejó evidencia de facturación.
-- CAMPOS DEL MAÑANA continúa sin inferirse. No modifica datos persistidos.
CREATE OR REPLACE FUNCTION public.ventas_tipo_tiempo_historial_os(
  p_cliente text, p_tipo text, p_factura text, p_servicios_valor numeric
)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path=public,pg_temp AS $$
  WITH claves AS (
    SELECT public.ventas_servicios_texto_normalizado(p_tipo) AS tipo,
      public.ventas_servicios_texto_normalizado(
        public.cliente_nombre_canonico(p_cliente)) AS cliente
  )
  SELECT CASE
    WHEN tipo='CLIENTE' THEN 'Cliente'
    WHEN tipo='GARANTIA' THEN 'Garantia'
    WHEN tipo='INTERNO' THEN 'Interno'
    WHEN tipo NOT IN ('','NO INFORMADO','DESCONOCIDO','SIN TIPO')
      THEN nullif(btrim(p_tipo),'')
    WHEN cliente ~ '^CAMPOS DEL MANANA( |$)' THEN NULL
    WHEN public.ventas_tipo_tiempo_historico_cliente(p_cliente,p_tipo)='Cliente'
      THEN 'Cliente'
    WHEN nullif(btrim(p_factura),'') IS NOT NULL OR coalesce(p_servicios_valor,0)<>0
      THEN 'Cliente'
    ELSE NULL END
  FROM claves;
$$;
REVOKE ALL ON FUNCTION public.ventas_tipo_tiempo_historial_os(text,text,text,numeric)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.ventas_servicios_historial(
  p_chasis text, p_vista text DEFAULT 'os'
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '120s'
SET plan_cache_mode = 'force_custom_plan'
AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(), 'servicios.ventas') THEN
    RAISE EXCEPTION 'No tenes acceso a Ventas de Servicios' USING errcode = '42501';
  END IF;
  IF nullif(public.parque_normalizar_clave(p_chasis),'') IS NULL THEN
    RAISE EXCEPTION 'Chasis requerido';
  END IF;

  IF p_vista = 'os' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.fecha_abierta_os DESC NULLS LAST, o.os_numero), '[]'::jsonb)
    INTO result FROM (
      SELECT os_numero, fecha_abierta_os, fecha_cierre_os,
        coalesce(
          CASE WHEN coalesce(nullif(raw_data->>'import_era',''),
            CASE WHEN coalesce(fecha_abierta_os,fecha_emision_factura)::date <= DATE '2026-06-30'
              THEN 'legacy' END) = 'legacy'
          THEN public.ventas_tipo_tiempo_historial_os(
            cliente_nombre,tipo_tiempo,factura,servicios_valor)
          END,
          tipo_tiempo
        ) AS tipo_tiempo,
        servicios_cantidad, km_cantidad, responsable, situacion_os, factura, raw_data,
        servicios_valor, repuesto_valor, kilometro_valor, terceros_valor
      FROM public.ordenes_servicio_importadas
      WHERE nro_chasis IS NOT NULL
        AND public.parque_normalizar_clave(nro_chasis) = public.parque_normalizar_clave(p_chasis)
    ) o;
  ELSIF p_vista = 'maquina' THEN
    SELECT jsonb_build_object('modelo_tipo',m.modelo_tipo,
      'clientes',jsonb_build_object('nombre',m.propietario),
      'fuente_propietario',m.fuente_propietario) INTO result
    FROM public.ventas_servicios_maquinas_identidad() m
    WHERE m.chasis_clave=public.parque_normalizar_clave(p_chasis);
  ELSIF p_vista = 'repuestos' THEN
    WITH ordenes AS MATERIALIZED (
      SELECT DISTINCT os_numero FROM public.ordenes_servicio_importadas
      WHERE nro_chasis IS NOT NULL
        AND public.parque_normalizar_clave(nro_chasis) = public.parque_normalizar_clave(p_chasis)
    )
    SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.fecha_factura DESC, p.id), '[]'::jsonb) INTO result
    FROM (
      SELECT f.id, f.fecha_factura, f.factura, f.cod_mercaderia, f.codigo_fabricante,
        f.mercaderia, f.observacion, f.cantidad, f.total_venta,
        jsonb_build_object('linked_service_order', f.raw_data->>'linked_service_order') AS raw_data
      FROM ordenes o JOIN public.facturacion_lineas_importadas f
        ON f.raw_data->>'linked_service_order' = o.os_numero
      WHERE lower(coalesce(nullif(f.grupo_normalizado,''), f.subgrupo_original,'')) LIKE '%repuesto%'
    ) p;
  ELSE
    RAISE EXCEPTION 'Vista no válida';
  END IF;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.ventas_servicios_historial(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ventas_servicios_historial(text,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
