-- LOCAL: replacement requires approval; no ACL or data changes.
BEGIN;
DO $guard$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.parque_cobertura_unificada_v1(date,date)')
   AND md5(prosrc)='f1317aa6b92b429b080ab87624db361c' AND pg_get_userbyid(proowner)=current_user) THEN
  RAISE EXCEPTION 'Installed coverage function differs from approved baseline';
 END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.parque_cobertura_unificada_v1(p_desde date,p_hasta date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
SET timezone TO 'UTC'
AS $function$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce((
  (public.has_role(auth.uid(),'superadmin'::public.app_role) OR public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'gerencia'::public.app_role))
  AND (public.has_role(auth.uid(),'superadmin'::public.app_role) OR public.has_module_access(auth.uid(),'parque'))
  AND public.has_section_access(auth.uid(),'parque.maquinas')),false) THEN
  RAISE EXCEPTION 'Sin acceso a cobertura del parque' USING ERRCODE='42501';
 END IF;
 IF p_desde IS NULL OR p_hasta IS NULL OR p_desde>p_hasta OR p_hasta-p_desde>1096 THEN
  RAISE EXCEPTION 'Rango inválido o superior a tres años' USING ERRCODE='22023';
 END IF;
 WITH parametros AS MATERIALIZED (SELECT p_desde AS fecha_desde,p_hasta AS fecha_hasta),
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

 maquinas AS MATERIALIZED (
  SELECT pm.id,pm.cliente_id,public.parque_normalizar_clave(pm.serie) AS chasis
  FROM public.parque_maquinas pm
  WHERE pm.activo IS TRUE AND pm.cliente_id IS NOT NULL
   AND NOT (lower(coalesce(CASE WHEN upper(trim(pm.subgrupo::text))='OTRO' THEN nullif(trim(pm.subgrupo_personalizado),'') END,pm.subgrupo::text,''))
    SIMILAR TO '%(plataforma|cabezal|cabecal|header)%')
   AND upper(trim(coalesce(pm.subgrupo::text,''))) NOT IN ('DIRECT DISC','C - PICADORA')
 ),
 propietarios AS MATERIALIZED (SELECT DISTINCT cliente_id FROM maquinas),
 -- Se leen OS del parque principal, incluso abiertas antes del período.
 -- No se utiliza el cliente facturado ni coincidencia por nombre.
 candidatas AS MATERIALIZED (
  SELECT o.os_numero,pm.cliente_id
  FROM public.ordenes_servicio_importadas o JOIN maquinas pm
   ON pm.chasis<>'' AND pm.chasis=public.parque_normalizar_clave(o.nro_chasis)
  WHERE public.parque_normalizar_clave(o.situacion_os) NOT IN ('ANULADA','ANULADO','CANCELADA','CANCELADO')
 ),
 unicas AS (SELECT os_numero,min(cliente_id::text)::uuid AS cliente_id
  FROM candidatas GROUP BY os_numero HAVING count(DISTINCT cliente_id)=1),
 ordenes AS MATERIALIZED (
  SELECT o.*,u.cliente_id,
   lower(trim(coalesce(o.situacion_os,''))) LIKE '%cerrad%' AS cerrada,
   lower(trim(coalesce(o.situacion_os,''))) LIKE '%abiert%' AS abierta
  FROM public.ordenes_servicio_importadas o JOIN unicas u USING(os_numero)
 ),
 eventos AS MATERIALIZED (
  -- Cerrada prevalece sobre sus jornadas: una sola referencia temporal por OS.
  -- Cierre inválido no equivale a cierre ausente y nunca se reemplaza por apertura.
  SELECT cliente_id,coalesce(fecha_cierre_os::date,fecha_abierta_os::date) AS fecha,
    os_numero AS id, CASE WHEN fecha_cierre_os IS NULL THEN 'apertura_historica' ELSE 'cierre' END AS evidencia
  FROM ordenes WHERE cerrada AND (fecha_cierre_os IS NULL OR fecha_abierta_os IS NULL OR fecha_cierre_os>=fecha_abierta_os)
  UNION ALL
  SELECT DISTINCT o.cliente_id,j.fecha::date,o.os_numero||':'||j.id::text,'jornada'
  FROM ordenes o JOIN public.trabajos t ON t.id=o.trabajo_id
  JOIN public.servicio_jornadas j ON j.servicio_id=t.legacy_servicio_id
  WHERE o.abierta AND j.estado::text='Completado'
 ),
 inciertos AS (
  SELECT DISTINCT cliente_id FROM ordenes WHERE
   (cerrada AND (coalesce(fecha_cierre_os,fecha_abierta_os) IS NULL OR fecha_cierre_os<fecha_abierta_os))
   OR (NOT cerrada AND NOT abierta)
  UNION
  SELECT DISTINCT cliente_id FROM candidatas WHERE os_numero IN
   (SELECT os_numero FROM candidatas GROUP BY os_numero HAVING count(DISTINCT cliente_id)>1)
 ),
 partes AS (
  SELECT m.cliente_id,m.fecha,sum(m.total_venta) AS neto
  FROM movimientos m JOIN propietarios p USING(cliente_id)
  WHERE m.grupo IN ('repuesto','repuestos') GROUP BY m.cliente_id,m.fecha
 )
 SELECT jsonb_build_object('version',1,'policy','principal_closed_or_completed_v1','from',p_desde,'to',p_hasta,
  'owners',(SELECT coalesce(jsonb_agg(cliente_id ORDER BY cliente_id),'[]'::jsonb) FROM propietarios),
  'parts',(SELECT coalesce(jsonb_agg(jsonb_build_array(cliente_id,fecha,neto) ORDER BY cliente_id,fecha),'[]'::jsonb) FROM partes),
  'services',(SELECT coalesce(jsonb_agg(jsonb_build_array(cliente_id,fecha,id,evidencia) ORDER BY cliente_id,fecha,id),'[]'::jsonb) FROM eventos WHERE fecha BETWEEN p_desde AND p_hasta),
  'uncertainOwners',(SELECT coalesce(jsonb_agg(cliente_id ORDER BY cliente_id),'[]'::jsonb) FROM inciertos)) INTO result;
 RETURN result;
END;
$function$;
COMMIT;
