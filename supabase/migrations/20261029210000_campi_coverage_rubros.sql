-- LOCAL REVIEW ONLY. New optional read; does not replace any existing function.
-- Same COBERTURA source clauses as the live reference. No OS activity proxy.
BEGIN;
DO $guard$ BEGIN
 IF to_regprocedure('public.campi_cobertura_rubros_v1(date,text)') IS NOT NULL THEN
  RAISE EXCEPTION 'La función ya existe; cotejar antes de reemplazar';
 END IF;
 IF to_regprocedure('public.gerencial_clientes_movimientos_posventa_v1(date,date)') IS NULL
 OR to_regprocedure('public.campi_cobertura_parque_actual_serie_v1(date,text)') IS NULL THEN
  RAISE EXCEPTION 'Faltan contratos canónicos';
 END IF;
 IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=to_regprocedure('public.campi_cobertura_parque_actual_serie_v1(date,text)')) <> current_user THEN
  RAISE EXCEPTION 'Ejecutar con el propietario del contrato vigente; no cambiar propietarios';
 END IF;
END $guard$;
CREATE FUNCTION public.campi_cobertura_rubros_v1(p_hasta date, p_modo text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
SET plan_cache_mode TO force_custom_plan
AS $function$
DECLARE resultado jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce((
   (public.has_role(auth.uid(),'superadmin'::public.app_role)
    OR public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'gerencia'::public.app_role))
   AND (public.has_role(auth.uid(),'superadmin'::public.app_role) OR public.has_module_access(auth.uid(),'parque'))
   AND public.has_section_access(auth.uid(),'parque.maquinas')),false) THEN
  RAISE EXCEPTION 'Sin acceso a cobertura del parque' USING ERRCODE='42501';
 END IF;
 IF p_hasta IS NULL OR p_modo IS NULL OR p_modo NOT IN ('month','ytd') THEN
  RAISE EXCEPTION 'Corte o modo inválido' USING ERRCODE='22023';
 END IF;
 WITH parametros AS MATERIALIZED (
  SELECT CASE WHEN p_modo='ytd' THEN date_trunc('year',p_hasta)::date
    ELSE (date_trunc('month',p_hasta)-interval '5 months')::date END AS fecha_desde,
    p_hasta AS fecha_hasta
 ),
  facturacion_rango AS MATERIALIZED (
    SELECT
      f.cliente_id,
      f.fecha::date AS fecha,
      f.sucursal::text AS sucursal,
      nullif(upper(btrim(f.sucursal::text)), '') AS sucursal_clave,
      coalesce(f.total_venta, 0)::numeric AS total_venta,
      coalesce(nullif(upper(btrim(f.moneda)), ''), 'USD') AS moneda,
      lower(btrim(coalesce(f.grupo_fx, ''))) AS grupo,
      public.parque_normalizar_clave(f.cod_factura) AS documento_clave
    FROM public.facturacion f
    CROSS JOIN parametros p
    WHERE f.cliente_id IS NOT NULL
      AND NOT coalesce(f.excluido_de_reportes, false)
      AND f.fecha BETWEEN p.fecha_desde AND p.fecha_hasta
  ),
  lineas_rango AS MATERIALIZED (
    SELECT
      fl.cliente_id,
      fl.fecha_factura::date AS fecha,
      fl.sucursal::text AS sucursal,
      nullif(upper(btrim(fl.sucursal::text)), '') AS sucursal_clave,
      coalesce(fl.total_venta, 0)::numeric AS total_venta,
      coalesce(
        nullif(upper(btrim(fl.moneda)), ''),
        CASE
          WHEN nullif(btrim(coalesce(fl.raw_data ->> 'TOTALUSD', '')), '') IS NOT NULL THEN 'USD'
          ELSE 'UNKNOWN'
        END
      ) AS moneda,
      lower(btrim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, ''))) AS grupo,
      public.parque_normalizar_clave(fl.factura) AS factura_clave,
      public.parque_normalizar_clave(fl.codigo_interno_factura) AS interna_clave
    FROM public.facturacion_lineas_importadas fl
    CROSS JOIN parametros p
    WHERE fl.fecha_factura >= greatest(
        p.fecha_desde::timestamptz,
        timestamptz '2026-07-01 00:00:00+00'
      )
      AND fl.fecha_factura < (p.fecha_hasta + 1)::timestamptz
  ),
  cobertura_legacy_pre_corte AS (
    SELECT f.cliente_id, f.fecha, f.total_venta, f.grupo
    FROM facturacion_rango f
    WHERE f.fecha < date '2026-07-01'
      AND f.grupo IN (
        'repuesto', 'repuestos', 'mano de obra', 'servicio', 'servicios', 'kilometraje'
      )
  ),
  cobertura_legacy_fallback AS (
    SELECT f.cliente_id, f.fecha, f.total_venta, f.grupo
    FROM facturacion_rango f
    WHERE f.fecha >= date '2026-07-01'
      AND f.documento_clave <> ''
      AND f.grupo IN (
        'repuesto', 'repuestos', 'mano de obra', 'servicio', 'servicios', 'kilometraje'
      )
      AND NOT EXISTS (
        -- Paridad deliberada con parque_facturacion_legacy_fallback_rango:
        -- cualquier linea TOTVS poscorte con el mismo documento suprime el
        -- legacy, sin exigir coincidencia de fecha, sucursal o moneda.
        SELECT 1
        FROM public.facturacion_lineas_importadas fl
        WHERE fl.fecha_factura >= timestamptz '2026-07-01 00:00:00+00'
          AND f.documento_clave IN (
            public.parque_normalizar_clave(fl.factura),
            public.parque_normalizar_clave(fl.codigo_interno_factura)
          )
      )
  ),
  cobertura_nuevo_sistema AS (
    SELECT fl.cliente_id, fl.fecha, fl.total_venta, fl.grupo
    FROM lineas_rango fl
    WHERE fl.cliente_id IS NOT NULL
      AND fl.grupo IN (
        'repuesto', 'repuestos', 'mano de obra', 'servicio', 'servicios', 'kilometraje'
      )
  ),
 movimientos AS MATERIALIZED (
  SELECT * FROM cobertura_legacy_pre_corte
  UNION ALL SELECT * FROM cobertura_legacy_fallback
  UNION ALL SELECT * FROM cobertura_nuevo_sistema
 ),
 canonicos AS MATERIALIZED (
  SELECT m.cliente_id,m.fecha,m.total_venta FROM parametros p
  CROSS JOIN LATERAL public.gerencial_clientes_movimientos_posventa_v1(p.fecha_desde,p.fecha_hasta) m
  WHERE m.contrato='COBERTURA'
 ),
 propietarios AS MATERIALIZED (
  SELECT DISTINCT cliente_id FROM public.parque_maquinas
  WHERE (activo IS TRUE OR activo IS NULL) AND cliente_id IS NOT NULL
 ),
 ventanas AS MATERIALIZED (
  SELECT g.mes::date AS mes,
   CASE WHEN p_modo='ytd' THEN date_trunc('year',g.mes)::date ELSE g.mes::date END AS desde,
   least((g.mes+interval '1 month'-interval '1 day')::date,p_hasta) AS hasta
  FROM parametros p CROSS JOIN LATERAL generate_series(p.fecha_desde,date_trunc('month',p_hasta),interval '1 month') g(mes)
 ),
 rubros AS (
  SELECT v.mes,m.cliente_id,
   coalesce(sum(m.total_venta) FILTER(WHERE m.grupo IN ('repuesto','repuestos')),0) AS repuestos,
   coalesce(sum(m.total_venta) FILTER(WHERE m.grupo IN ('mano de obra','servicio','servicios','kilometraje')),0) AS servicios
  FROM ventanas v JOIN movimientos m ON m.fecha BETWEEN v.desde AND v.hasta
  JOIN propietarios p ON p.cliente_id=m.cliente_id GROUP BY v.mes,m.cliente_id
 ),
 referencia AS (
  SELECT v.mes,m.cliente_id,coalesce(sum(m.total_venta),0) AS neto
  FROM ventanas v JOIN canonicos m ON m.fecha BETWEEN v.desde AND v.hasta
  JOIN propietarios p ON p.cliente_id=m.cliente_id GROUP BY v.mes,m.cliente_id
 ),
 valores AS (
  SELECT v.mes,v.desde,v.hasta,p.cliente_id,coalesce(r.repuestos,0) AS repuestos,
   coalesce(r.servicios,0) AS servicios,coalesce(c.neto,0) AS canonico
  FROM ventanas v CROSS JOIN propietarios p
  LEFT JOIN rubros r ON r.mes=v.mes AND r.cliente_id=p.cliente_id
  LEFT JOIN referencia c ON c.mes=v.mes AND c.cliente_id=p.cliente_id
 ),
 filas AS (
  SELECT v.mes,v.desde,v.hasta,
   coalesce(jsonb_agg(jsonb_build_array(x.cliente_id,x.repuestos,x.servicios,x.canonico) ORDER BY x.cliente_id) FILTER(WHERE x.cliente_id IS NOT NULL),'[]'::jsonb) AS netos,
   count(*) FILTER(WHERE x.cliente_id IS NOT NULL AND x.repuestos+x.servicios<>x.canonico) AS source_mismatches,
   count(*) FILTER(WHERE x.cliente_id IS NOT NULL AND ((x.repuestos>0 OR x.servicios>0) IS DISTINCT FROM (x.canonico>0))) AS union_conflicts
  FROM ventanas v LEFT JOIN valores x ON x.mes=v.mes GROUP BY v.mes,v.desde,v.hasta
 )
 SELECT jsonb_build_object('version',1,'cohort','current_park','mode',p_modo,'as_of',p_hasta,
  'owners',(SELECT coalesce(jsonb_agg(cliente_id ORDER BY cliente_id),'[]'::jsonb) FROM propietarios),
  'rows',(SELECT jsonb_agg(jsonb_build_object('from',desde,'to',hasta,'nets',netos,
    'source_mismatches',source_mismatches,'union_conflicts',union_conflicts) ORDER BY mes) FROM filas)) INTO resultado;
 RETURN resultado;
END;
$function$;
REVOKE ALL ON FUNCTION public.campi_cobertura_rubros_v1(date,text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.campi_cobertura_rubros_v1(date,text) TO authenticated;
COMMIT;
