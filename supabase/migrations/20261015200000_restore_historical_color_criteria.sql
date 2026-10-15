-- Criterios confirmados el 15/10/2026 tras auditar stock30-05.xls.
-- Tres años calendario: actual, anterior y hace dos años; venta positiva confirmada.
-- No modifica última compra, valorización ni promedio por sucursal.
BEGIN;
CREATE OR REPLACE FUNCTION public.repuestos_color_historico(
  actual numeric, anterior numeric, antiguo numeric, dias_venta integer
) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, pg_temp AS $color$
 SELECT CASE
  WHEN actual >= 10 AND anterior >= 10 AND antiguo >= 10 THEN 'VERDE_OSCURO'
  WHEN actual > 0 THEN 'VERDE_CLARO'
  WHEN anterior > 0 THEN 'AMARILLO'
  WHEN antiguo > 0 THEN 'NARANJA'
  WHEN dias_venta IS NULL OR dias_venta < 0 THEN 'SIN_DATOS'
  WHEN dias_venta <= 365 THEN 'LILA'
  WHEN dias_venta <= 1000 THEN 'GRIS'
  ELSE 'ROJO'
 END;
$color$;
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
    public.repuestos_color_historico(
      coalesce(v.unidades_anio_actual,0), coalesce(v.unidades_anio_anterior,0),
      coalesce(v.unidades_hace_dos_anios,0), current_date-v.ultima_venta
    ) AS color
  FROM stock s
  LEFT JOIN ventas v ON v.producto_codigo = s.codigo_interno
  LEFT JOIN maestro m ON m.producto_codigo = s.codigo_interno
  LEFT JOIN kardex k ON k.producto_codigo = s.codigo_interno
)
SELECT *, current_date AS fecha_analisis FROM detalle;

GRANT SELECT ON public.v_repuestos_semaforo_historico TO authenticated;


NOTIFY pgrst,'reload schema';
COMMIT;
