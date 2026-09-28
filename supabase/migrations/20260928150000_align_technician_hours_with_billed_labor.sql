BEGIN;
-- Solo lectura: conserva jornadas, importes y RPC anteriores. Requiere filtros 20260917180000.
DO $$ BEGIN
  IF to_regprocedure('public.ventas_servicios_validar_filtros(jsonb)') IS NULL
    OR to_regprocedure('public.ventas_servicios_cumple_filtros(jsonb,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Aplicá primero 20260917180000_service_sales_shared_filters.sql';
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.ventas_servicios_tecnicos_v2(
  p_desde date, p_hasta date, p_sucursal text DEFAULT NULL,
  p_tipo_tiempo text DEFAULT NULL, p_marca text DEFAULT NULL,
  p_tipo_maquina text DEFAULT NULL, p_buscar text DEFAULT NULL,
  p_filtros jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '120s'
SET plan_cache_mode = 'force_custom_plan'
AS $$
DECLARE resultado jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(), 'servicios.ventas') THEN
    RAISE EXCEPTION 'No tenes acceso a Ventas de Servicios' USING ERRCODE = '42501';
  END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_desde > p_hasta THEN
    RAISE EXCEPTION 'Rango de fechas invalido' USING ERRCODE = '22023';
  END IF;
  PERFORM public.ventas_servicios_validar_filtros(p_filtros);

  WITH filtrada AS MATERIALIZED (
    SELECT b.*
    FROM public.ventas_servicios_movimientos_enriquecidos(p_desde,p_hasta,p_sucursal) b
    WHERE (p_marca IS NULL OR coalesce(b.marca_parque,'Sin identificar') = p_marca)
      AND (p_tipo_maquina IS NULL OR coalesce(b.tipo_maquina,'Sin identificar') = p_tipo_maquina)
      AND (nullif(trim(p_tipo_tiempo),'') IS NULL OR upper(trim(p_tipo_tiempo)) = 'TODOS'
        OR b.tipo_tiempo = public.ventas_tipo_tiempo_normalizado(p_tipo_tiempo))
      AND (public.ventas_servicios_texto_normalizado(p_buscar) = ''
        OR strpos(b.texto_busqueda,public.ventas_servicios_texto_normalizado(p_buscar)) > 0)
      AND public.ventas_servicios_cumple_filtros(to_jsonb(b),p_filtros)
  ), mo AS MATERIALIZED (
    -- Existencia de una linea, no importe != 0: conserva ceros y factura + NC.
    SELECT coalesce(nullif(upper(trim(os_numero)),''),'SIN_OS') AS os_clave,
      tipo_tiempo, sum(total_venta)::numeric AS importe
    FROM filtrada WHERE concepto = 'Servicio'
    GROUP BY 1,2
  ), jornadas AS MATERIALIZED (
    SELECT upper(trim(j.os_numero)) AS os_clave,
      coalesce(j.tecnico_profile_id::text,upper(trim(j.tecnico_nombre))) AS tecnico_clave,
      max(trim(j.tecnico_nombre)) AS tecnico,
      public.ventas_tipo_tiempo_normalizado(coalesce(nullif(trim(j.tipo_tiempo),''),
        nullif(trim(j.tipo_tiempo_importado),''))) AS tipo_tiempo,
      sum(greatest(coalesce(j.horas_validas,j.horas_calculadas,j.horas_reportadas,0),0))::numeric AS horas
    FROM public.comisiones_jornadas j
    WHERE j.vigente AND j.estado_validacion IS DISTINCT FROM 'INVALIDA'
      AND nullif(trim(j.tecnico_nombre),'') IS NOT NULL
      AND upper(trim(j.os_numero)) IN (SELECT upper(trim(os_numero)) FROM filtrada)
      AND (nullif(trim(p_tipo_tiempo),'') IS NULL OR upper(trim(p_tipo_tiempo)) = 'TODOS'
        OR public.ventas_tipo_tiempo_normalizado(coalesce(nullif(trim(j.tipo_tiempo),''),
          nullif(trim(j.tipo_tiempo_importado),''))) = public.ventas_tipo_tiempo_normalizado(p_tipo_tiempo))
    GROUP BY 1,2,4
  ), participacion AS MATERIALIZED (
    SELECT j.*, sum(horas) OVER (PARTITION BY os_clave,tipo_tiempo) AS horas_tipo FROM jornadas j
  ), detalle AS (
    SELECT p.tecnico_clave,p.tecnico,p.os_clave,p.tipo_tiempo,p.horas AS horas_os,
      CASE WHEN m.os_clave IS NOT NULL THEN p.horas END AS horas_mo,
      CASE WHEN p.horas_tipo > 0 THEN m.importe * p.horas / p.horas_tipo END AS mo_periodo,
      m.os_clave IS NOT NULL AS tiene_mo
    FROM participacion p LEFT JOIN mo m USING (os_clave,tipo_tiempo)
    UNION ALL
    SELECT 'SIN_TECNICO_ATRIBUIDO','Sin técnico atribuido',m.os_clave,m.tipo_tiempo,
      NULL::numeric,NULL::numeric,m.importe,true
    FROM mo m WHERE NOT EXISTS (
      SELECT 1 FROM participacion p
      WHERE p.os_clave = m.os_clave AND p.tipo_tiempo = m.tipo_tiempo AND p.horas > 0
    )
  ), resumen AS (
    SELECT tecnico_clave,max(tecnico) AS tecnico,
      sum(horas_mo) FILTER (WHERE tipo_tiempo = 'Cliente') AS horas_cliente,
      sum(horas_mo) FILTER (WHERE tipo_tiempo = 'Garantia') AS horas_garantia,
      sum(horas_mo) FILTER (WHERE tipo_tiempo = 'Interno') AS horas_interno,
      sum(horas_mo) FILTER (WHERE tipo_tiempo NOT IN ('Cliente','Garantia','Interno')) AS horas_otros,
      sum(horas_mo) AS total_horas,
      coalesce(sum(mo_periodo) FILTER (WHERE tipo_tiempo = 'Cliente'),0) AS mo_cliente,
      coalesce(sum(mo_periodo) FILTER (WHERE tipo_tiempo = 'Garantia'),0) AS mo_garantia,
      coalesce(sum(mo_periodo) FILTER (WHERE tipo_tiempo = 'Interno'),0) AS mo_interno,
      coalesce(sum(mo_periodo) FILTER (WHERE tipo_tiempo NOT IN ('Cliente','Garantia','Interno')),0) AS mo_otros,
      coalesce(sum(mo_periodo),0) AS mo_total,
      jsonb_agg(jsonb_build_object('os_numero',nullif(os_clave,'SIN_OS'),
        'tipo_tiempo',tipo_tiempo,'horas_os',horas_os,'horas_mo',horas_mo,
        'mo_periodo',mo_periodo,'tiene_mo',tiene_mo) ORDER BY os_clave,tipo_tiempo) AS detalle_os
    FROM detalle GROUP BY tecnico_clave
  )
  SELECT coalesce(jsonb_agg(r ORDER BY mo_total DESC,total_horas DESC NULLS LAST,tecnico),'[]'::jsonb)
  INTO resultado FROM resumen r;
  RETURN resultado;
END;
$$;
COMMENT ON FUNCTION public.ventas_servicios_tecnicos_v2(date,date,text,text,text,text,text,jsonb)
IS 'Horas de OS con MO en el rango financiero y filtros, no horas facturadas ni productividad. Conserva todas las horas de OS con movimientos en detalle_os. Reparto por OS/tipo sin cambiar importes.';
REVOKE ALL ON FUNCTION public.ventas_servicios_tecnicos_v2(date,date,text,text,text,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ventas_servicios_tecnicos_v2(date,date,text,text,text,text,text,jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
