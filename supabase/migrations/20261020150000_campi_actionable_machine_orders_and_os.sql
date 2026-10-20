-- Lecturas para decisiones del Panorama. No modifica pedidos, facturas ni OS.
CREATE OR REPLACE FUNCTION public.campi_pedidos_con_stock_v1()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp SET statement_timeout = '45s' AS $fn$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_module_access(auth.uid(), 'parque')
     OR NOT public.has_section_access(auth.uid(), 'parque.operaciones') THEN
    RAISE EXCEPTION 'Sin acceso a operaciones de máquinas' USING ERRCODE = '42501';
  END IF;

  WITH active AS MATERIALIZED (
    SELECT p.id, p.unidad_id, p.operacion_id, p.np_numero, p.marca, p.modelo,
           p.estado_disponibilidad, p.cantidad,
           count(s.id) FILTER (WHERE s.saldo_actual > 0) AS stock_vinculado
    FROM public.maquinaria_pedidos_lineas_estado_actual p
    LEFT JOIN public.parque_stock_maquinas s ON s.unidad_operacion_id = p.unidad_id
    WHERE upper(btrim(coalesce(p.estado_operacion, ''))) NOT IN ('CERRADA','FACTURADA','CANCELADA')
      AND upper(btrim(coalesce(p.estado_fuente, ''))) NOT LIKE '%CANCEL%'
      AND p.unidad_id IS NOT NULL
    GROUP BY p.id,p.unidad_id,p.operacion_id,p.np_numero,p.marca,p.modelo,p.estado_disponibilidad,p.cantidad
  ), billed AS MATERIALIZED (
    SELECT unidad_id FROM public.maquinaria_unidades_facturadas_confirmadas(
      (SELECT coalesce(array_agg(DISTINCT unidad_id), ARRAY[]::uuid[]) FROM active)
    )
  ), eligible AS MATERIALIZED (
    SELECT a.*, (b.unidad_id IS NOT NULL) AS facturada,
           (a.stock_vinculado = 1 AND a.cantidad = 1
            AND upper(coalesce(a.estado_disponibilidad,'')) IN ('DISPONIBLE','RESERVADO')
            AND b.unidad_id IS NULL) AS con_stock
    FROM active a LEFT JOIN billed b ON b.unidad_id = a.unidad_id
  ), orders AS (
    SELECT operacion_id, max(np_numero) AS np_numero,
           count(*) FILTER (WHERE con_stock) AS unidades_con_stock,
           count(*) AS unidades_activas
    FROM eligible GROUP BY operacion_id
  )
  SELECT jsonb_build_object(
    'fecha_analisis', (now() AT TIME ZONE 'America/Asuncion')::date,
    'unidades_activas', (SELECT count(*) FROM eligible),
    'unidades_con_stock', (SELECT count(*) FROM eligible WHERE con_stock),
    'pedidos_con_stock', (SELECT count(*) FROM orders WHERE unidades_con_stock > 0),
    'unidades_facturadas_detectadas', (SELECT count(*) FROM eligible WHERE facturada),
    'identidades', (SELECT count(DISTINCT id) FROM eligible),
    'pedidos', (SELECT coalesce(jsonb_agg(jsonb_build_object(
       'operacion_id', operacion_id, 'np_numero', np_numero,
       'unidades_con_stock', unidades_con_stock, 'unidades_activas', unidades_activas)
       ORDER BY unidades_con_stock DESC, operacion_id), '[]'::jsonb)
       FROM orders WHERE unidades_con_stock > 0)
  ) INTO result;
  RETURN result;
END;
$fn$;

-- La tabla operativa conserva el estado actual, no cada estado diario histórico.
-- Registramos un corte después de cada carga completa; la serie comienza aquí.
CREATE TABLE IF NOT EXISTS public.campi_os_abiertas_cortes (
  fecha date PRIMARY KEY,
  abiertas integer NOT NULL CHECK (abiertas >= 0),
  registradas_en timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.campi_os_abiertas_cortes FROM PUBLIC, anon, authenticated;
INSERT INTO public.campi_os_abiertas_cortes (fecha, abiertas)
SELECT (now() AT TIME ZONE 'America/Asuncion')::date, count(*)
FROM public.ordenes_servicio_importadas WHERE situacion_os ILIKE '%abiert%'
ON CONFLICT (fecha) DO NOTHING;

CREATE OR REPLACE FUNCTION public.campi_os_abiertas_capturar_v1()
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp SET statement_timeout = '30s' AS $fn$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_module_access(auth.uid(), 'servicios')
     OR NOT public.has_section_access(auth.uid(), 'servicios.ordenes') THEN
    RAISE EXCEPTION 'Sin acceso a órdenes de servicio' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.campi_os_abiertas_cortes (fecha, abiertas)
  SELECT (now() AT TIME ZONE 'America/Asuncion')::date, count(*)
  FROM public.ordenes_servicio_importadas WHERE situacion_os ILIKE '%abiert%'
  ON CONFLICT (fecha) DO UPDATE SET abiertas = excluded.abiertas, registradas_en = now();
END;
$fn$;

-- El detalle informa marca y edad de las OS hoy abiertas. La evolución usa
-- solo cortes persistidos, nunca fechas de cierre incompletas reconstruidas.
CREATE OR REPLACE FUNCTION public.campi_os_abiertas_detalle_v1()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp SET statement_timeout = '30s' AS $fn$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_module_access(auth.uid(), 'servicios')
     OR NOT public.has_section_access(auth.uid(), 'servicios.ordenes') THEN
    RAISE EXCEPTION 'Sin acceso a órdenes de servicio' USING ERRCODE = '42501';
  END IF;

  WITH open_orders AS MATERIALIZED (
    SELECT os_numero, coalesce(nullif(btrim(marca),''),'Sin marca') AS marca,
           fecha_abierta_os::date AS apertura,
           (now() AT TIME ZONE 'America/Asuncion')::date - fecha_abierta_os::date AS edad
    FROM public.ordenes_servicio_importadas
    WHERE situacion_os ILIKE '%abiert%'
  ), brands AS (
    SELECT marca, count(*) AS cantidad FROM open_orders GROUP BY marca
  ), ages AS (
    SELECT CASE WHEN edad < 0 OR edad IS NULL THEN 'Sin fecha válida'
                WHEN edad <= 7 THEN '0–7 días' WHEN edad <= 30 THEN '8–30 días'
                WHEN edad <= 90 THEN '31–90 días' ELSE 'Más de 90 días' END AS rango,
           CASE WHEN edad BETWEEN 0 AND 7 THEN 1 WHEN edad BETWEEN 8 AND 30 THEN 2
                WHEN edad BETWEEN 31 AND 90 THEN 3 WHEN edad > 90 THEN 4 ELSE 5 END AS orden,
           count(*) AS cantidad FROM open_orders GROUP BY 1,2
  )
  SELECT jsonb_build_object(
    'fecha_analisis', (now() AT TIME ZONE 'America/Asuncion')::date,
    'abiertas', (SELECT count(*) FROM open_orders),
    'marcas', (SELECT coalesce(jsonb_agg(jsonb_build_object('nombre',marca,'cantidad',cantidad)
       ORDER BY cantidad DESC, marca), '[]'::jsonb) FROM brands),
    'edades', (SELECT coalesce(jsonb_agg(jsonb_build_object('rango',rango,'cantidad',cantidad)
       ORDER BY orden), '[]'::jsonb) FROM ages),
    'cortes', (SELECT coalesce(jsonb_agg(jsonb_build_object('fecha',fecha,'abiertas',abiertas)
       ORDER BY fecha), '[]'::jsonb) FROM (
         SELECT fecha, abiertas FROM public.campi_os_abiertas_cortes ORDER BY fecha DESC LIMIT 60
       ) historia)
  ) INTO result;
  RETURN result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.campi_pedidos_con_stock_v1() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.campi_os_abiertas_capturar_v1() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.campi_os_abiertas_detalle_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.campi_pedidos_con_stock_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.campi_os_abiertas_capturar_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.campi_os_abiertas_detalle_v1() TO authenticated;
NOTIFY pgrst, 'reload schema';
