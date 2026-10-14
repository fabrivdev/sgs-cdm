-- Semaforo historico: ventas positivas con vinculo confirmado, sin alterar
-- el motor de sugerencias ni recalcular la foto valorizada del Kardex.
CREATE OR REPLACE VIEW public.v_repuestos_semaforo_historico
WITH (security_invoker = true) AS
WITH stock AS MATERIALIZED (
  SELECT * FROM public.v_repuestos_stock_matriz WHERE total > 0
), ventas AS (
  SELECT v.producto_codigo,
    max(v.fecha_efectiva) AS ultima_venta,
    sum(v.cantidad) FILTER (WHERE v.fecha_efectiva >= current_date - 365) AS unidades_365d,
    sum(v.cantidad) FILTER (WHERE extract(year FROM v.fecha_efectiva) = extract(year FROM current_date)) AS unidades_anio_actual,
    sum(v.cantidad) FILTER (WHERE extract(year FROM v.fecha_efectiva) = extract(year FROM current_date) - 1) AS unidades_anio_anterior,
    sum(v.cantidad) FILTER (WHERE extract(year FROM v.fecha_efectiva) = extract(year FROM current_date) - 2) AS unidades_hace_dos_anios
  FROM public.repuestos_ventas_vinculacion v
  JOIN stock s ON s.codigo_interno = v.producto_codigo
  WHERE v.estado_vinculo = 'CONFIRMADA'
    AND v.cantidad > 0 AND v.fecha_efectiva <= current_date
  GROUP BY v.producto_codigo
), maestro AS (
  SELECT m.producto_codigo,
    count(*)::integer AS codigos_anteriores,
    min(m.codigo_legacy) AS codigo_anterior_ejemplo
  FROM public.repuestos_maestro_legacy m
  JOIN public.repuestos_maestro_legacy_cargas c ON c.id = m.carga_id
  JOIN stock s ON s.codigo_interno = m.producto_codigo
  WHERE c.activo AND c.estado = 'COMPLETADO'
    AND m.estado_vinculo IN ('CONFIRMADA', 'CONFIRMADA_CANONICA')
  GROUP BY m.producto_codigo
), kardex AS (
  SELECT k.producto_codigo,
    sum(k.saldo) AS saldo_kardex,
    sum(k.valor_2) AS valor_kardex_usd,
    max(k.actualizado_en) AS kardex_cargado_en,
    CASE WHEN count(DISTINCT k.archivo_origen) = 1 THEN min(k.archivo_origen) ELSE 'Varios archivos' END AS kardex_archivo
  FROM public.totvs_kardex_sintetico k
  JOIN stock s ON s.codigo_interno = k.producto_codigo
  GROUP BY k.producto_codigo
), detalle AS (
  SELECT s.codigo_interno, s.codigo_fabricante, s.descripcion, s.marca, s.familia,
    s.santa_rita, s.santa_rosa, s.campo_9, s.misiones, s.loma_plata, s.katuete,
    s.total AS stock_total,
    v.ultima_venta,
    CASE WHEN v.ultima_venta IS NOT NULL THEN current_date - v.ultima_venta END AS dias_ultima_venta,
    coalesce(v.unidades_365d, 0) AS unidades_365d,
    coalesce(v.unidades_anio_actual, 0) AS unidades_anio_actual,
    coalesce(v.unidades_anio_anterior, 0) AS unidades_anio_anterior,
    coalesce(v.unidades_hace_dos_anios, 0) AS unidades_hace_dos_anios,
    coalesce(m.codigos_anteriores, 0) AS codigos_anteriores,
    m.codigo_anterior_ejemplo,
    k.saldo_kardex, k.valor_kardex_usd, k.kardex_cargado_en, k.kardex_archivo,
    CASE WHEN k.producto_codigo IS NOT NULL THEN abs(k.saldo_kardex - s.total) < 0.000001 ELSE false END AS saldo_coincide,
    CASE
      WHEN v.ultima_venta IS NOT NULL AND v.unidades_365d >= 10 THEN 'VERDE_OSCURO'
      WHEN v.ultima_venta IS NOT NULL AND v.unidades_365d > 0 THEN 'VERDE_CLARO'
      WHEN v.ultima_venta IS NOT NULL AND current_date - v.ultima_venta <= 730 THEN 'AMARILLO'
      WHEN v.ultima_venta IS NOT NULL AND current_date - v.ultima_venta <= 1000 THEN 'NARANJA'
      WHEN v.ultima_venta IS NOT NULL AND current_date - v.ultima_venta <= 1825 THEN 'LILA'
      WHEN v.ultima_venta IS NOT NULL THEN 'GRIS'
      WHEN m.producto_codigo IS NOT NULL THEN 'ROJO'
      ELSE 'SIN_DATOS'
    END AS color
  FROM stock s
  LEFT JOIN ventas v ON v.producto_codigo = s.codigo_interno
  LEFT JOIN maestro m ON m.producto_codigo = s.codigo_interno
  LEFT JOIN kardex k ON k.producto_codigo = s.codigo_interno
)
SELECT *, current_date AS fecha_analisis FROM detalle;

GRANT SELECT ON public.v_repuestos_semaforo_historico TO authenticated;

CREATE OR REPLACE FUNCTION public.repuestos_semaforo_historico_paginado(
  p_busqueda text DEFAULT NULL,
  p_marca text DEFAULT NULL,
  p_color text DEFAULT NULL,
  p_sucursal text DEFAULT NULL,
  p_limite integer DEFAULT 50,
  p_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
SET statement_timeout = '90s'
AS $function$
DECLARE v_resultado jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_module_access(auth.uid(), 'repuestos') THEN
    RAISE EXCEPTION 'Sin acceso al modulo de repuestos' USING ERRCODE = '42501';
  END IF;
  IF p_color IS NOT NULL AND p_color NOT IN ('VERDE_OSCURO','VERDE_CLARO','AMARILLO','NARANJA','LILA','GRIS','ROJO','SIN_DATOS') THEN
    RAISE EXCEPTION 'Color invalido' USING ERRCODE = '22023';
  END IF;
  IF p_sucursal IS NOT NULL AND p_sucursal NOT IN ('Santa Rita','Santa Rosa','Campo 9','Misiones','Loma Plata','Katuete') THEN
    RAISE EXCEPTION 'Sucursal invalida' USING ERRCODE = '22023';
  END IF;
  WITH filtrado AS MATERIALIZED (
    SELECT * FROM public.v_repuestos_semaforo_historico r
    WHERE (nullif(btrim(p_busqueda),'') IS NULL OR r.codigo_interno ILIKE '%' || btrim(p_busqueda) || '%'
      OR r.descripcion ILIKE '%' || btrim(p_busqueda) || '%'
      OR r.codigo_fabricante ILIKE '%' || btrim(p_busqueda) || '%'
      OR r.codigo_anterior_ejemplo ILIKE '%' || btrim(p_busqueda) || '%')
      AND (p_marca IS NULL OR r.marca::text = p_marca)
      AND (p_color IS NULL OR r.color = p_color)
      AND (p_sucursal IS NULL OR CASE p_sucursal
        WHEN 'Santa Rita' THEN r.santa_rita WHEN 'Santa Rosa' THEN r.santa_rosa
        WHEN 'Campo 9' THEN r.campo_9 WHEN 'Misiones' THEN r.misiones
        WHEN 'Loma Plata' THEN r.loma_plata WHEN 'Katuete' THEN r.katuete END > 0)
  ), por_color AS (
    SELECT color, count(*)::integer AS lineas, sum(stock_total) AS unidades_stock,
      sum(valor_kardex_usd) AS valor_kardex_usd,
      count(*) FILTER (WHERE valor_kardex_usd IS NOT NULL)::integer AS lineas_valorizadas,
      count(*) FILTER (WHERE saldo_coincide)::integer AS saldos_coincidentes
    FROM filtrado GROUP BY color
  ), resumen AS (
    SELECT jsonb_build_object(
      'lineas', count(*), 'unidades_stock', coalesce(sum(stock_total),0),
      'valor_kardex_usd', coalesce(sum(valor_kardex_usd),0),
      'lineas_valorizadas', count(*) FILTER (WHERE valor_kardex_usd IS NOT NULL),
      'saldos_coincidentes', count(*) FILTER (WHERE saldo_coincide),
      'kardex_cargado_en', max(kardex_cargado_en),
      'sucursales', jsonb_build_array(
        jsonb_build_object('nombre','Santa Rita','lineas',count(*) FILTER (WHERE santa_rita > 0),'unidades',coalesce(sum(santa_rita),0)),
        jsonb_build_object('nombre','Santa Rosa','lineas',count(*) FILTER (WHERE santa_rosa > 0),'unidades',coalesce(sum(santa_rosa),0)),
        jsonb_build_object('nombre','Campo 9','lineas',count(*) FILTER (WHERE campo_9 > 0),'unidades',coalesce(sum(campo_9),0)),
        jsonb_build_object('nombre','Misiones','lineas',count(*) FILTER (WHERE misiones > 0),'unidades',coalesce(sum(misiones),0)),
        jsonb_build_object('nombre','Loma Plata','lineas',count(*) FILTER (WHERE loma_plata > 0),'unidades',coalesce(sum(loma_plata),0)),
        jsonb_build_object('nombre','Katuete','lineas',count(*) FILTER (WHERE katuete > 0),'unidades',coalesce(sum(katuete),0))
      ),
      'por_color', coalesce((SELECT jsonb_agg(to_jsonb(pc)) FROM por_color pc),'[]'::jsonb)
    ) AS datos FROM filtrado
  ), pagina AS (
    SELECT * FROM filtrado ORDER BY stock_total DESC, codigo_interno
    LIMIT greatest(1, least(coalesce(p_limite,50), 200)) OFFSET greatest(0,coalesce(p_offset,0))
  )
  SELECT (SELECT datos FROM resumen) || jsonb_build_object(
    'fecha_analisis', current_date,
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM pagina p),'[]'::jsonb)
  ) INTO v_resultado;
  RETURN v_resultado;
END;
$function$;

REVOKE ALL ON FUNCTION public.repuestos_semaforo_historico_paginado(text,text,text,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repuestos_semaforo_historico_paginado(text,text,text,text,integer,integer) TO authenticated;
NOTIFY pgrst, 'reload schema';
