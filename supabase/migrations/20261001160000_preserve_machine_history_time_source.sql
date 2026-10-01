BEGIN;

CREATE OR REPLACE FUNCTION public.ventas_historial_tipo_tiempo_procedencia(
  p_tipo text
)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN public.ventas_servicios_texto_normalizado(p_tipo) ~ '(CONFIRM|PENDIENT|REVIS)'
      THEN 'revision_pendiente'
    WHEN public.ventas_servicios_texto_normalizado(p_tipo) IN (
      '', 'NO INFORMADO', 'DESCONOCIDO', 'SIN TIPO'
    ) THEN 'no_informado_origen'
    ELSE 'origen_explicito'
  END;
$$;

CREATE OR REPLACE FUNCTION public.ventas_historial_vinculo_os_publicable(
  p_coincidencias_numero bigint,
  p_factura_sucursal text,
  p_os_sucursal text,
  p_os_chasis text,
  p_chasis_solicitado text
)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT nullif(public.parque_normalizar_clave(p_os_chasis),'') IS NOT NULL
    AND public.parque_normalizar_clave(p_os_chasis)
      = public.parque_normalizar_clave(p_chasis_solicitado)
    AND CASE
      WHEN public.ventas_servicios_texto_normalizado(p_factura_sucursal)<>''
        AND public.ventas_servicios_texto_normalizado(p_os_sucursal)<>''
        THEN public.ventas_servicios_texto_normalizado(p_factura_sucursal)
          = public.ventas_servicios_texto_normalizado(p_os_sucursal)
      ELSE coalesce(p_coincidencias_numero,0)=1
    END;
$$;

REVOKE ALL ON FUNCTION public.ventas_historial_tipo_tiempo_procedencia(text)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ventas_historial_vinculo_os_publicable(bigint,text,text,text,text)
  FROM PUBLIC,anon,authenticated;

-- Read-only history correction. It does not rewrite imported orders, time
-- categories, commissions or payments. A billed legacy order without an
-- explicit time type remains unclassified instead of being inferred as Cliente.
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
      SELECT os_numero, fecha_abierta_os, fecha_cierre_os, tipo_tiempo,
        public.ventas_historial_tipo_tiempo_procedencia(tipo_tiempo)
          AS tipo_tiempo_procedencia,
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
      SELECT os.os_numero,
        upper(btrim(os.os_numero)) AS os_clave,
        public.parque_normalizar_clave(os.nro_chasis) AS chasis_clave,
        public.ventas_servicios_texto_normalizado(coalesce(
          nullif(btrim(os.raw_data->>'canonical_branch'),''), trabajo.sucursal::text
        )) AS sucursal_clave
      FROM public.ordenes_servicio_importadas os
      LEFT JOIN public.trabajos trabajo ON trabajo.id=os.trabajo_id
      WHERE nullif(btrim(os.os_numero),'') IS NOT NULL
        AND nullif(public.parque_normalizar_clave(os.nro_chasis),'') IS NOT NULL
    ), lineas AS MATERIALIZED (
      SELECT f.*,
        upper(btrim(f.raw_data->>'linked_service_order')) AS os_clave,
        public.ventas_servicios_texto_normalizado(f.sucursal::text) AS sucursal_clave
      FROM public.facturacion_lineas_importadas f
      WHERE nullif(btrim(f.raw_data->>'linked_service_order'),'') IS NOT NULL
        AND lower(coalesce(nullif(f.grupo_normalizado,''), f.subgrupo_original,'')) LIKE '%repuesto%'
    ), candidatas AS MATERIALIZED (
      SELECT f.id AS linea_id, o.os_numero, o.chasis_clave,
        f.sucursal_clave AS factura_sucursal, o.sucursal_clave AS os_sucursal,
        count(*) OVER (PARTITION BY f.id) AS coincidencias_numero
      FROM lineas f
      JOIN ordenes o ON o.os_clave=f.os_clave
    ), elegibles AS MATERIALIZED (
      SELECT c.* FROM candidatas c
      WHERE public.ventas_historial_vinculo_os_publicable(
        c.coincidencias_numero,c.factura_sucursal,c.os_sucursal,
        c.chasis_clave,p_chasis
      )
    ), vinculos_unicos AS MATERIALIZED (
      SELECT linea_id, min(os_numero) AS os_numero, min(chasis_clave) AS chasis_clave
      FROM elegibles
      GROUP BY linea_id
      HAVING count(*)=1
    )
    SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.fecha_factura DESC, p.id), '[]'::jsonb) INTO result
    FROM (
      SELECT f.id, f.fecha_factura, f.factura, f.cod_mercaderia, f.codigo_fabricante,
        f.mercaderia, f.observacion, f.cantidad, f.total_venta,
        jsonb_build_object(
          'linked_service_order', v.os_numero,
          'link_resolution', 'os_unica_sucursal_chasis'
        ) AS raw_data
      FROM vinculos_unicos v
      JOIN lineas f ON f.id=v.linea_id
    ) p;
  ELSE
    RAISE EXCEPTION 'Vista no valida';
  END IF;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.ventas_servicios_historial(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ventas_servicios_historial(text,text) TO authenticated;
NOTIFY pgrst, 'reload schema';

COMMIT;
