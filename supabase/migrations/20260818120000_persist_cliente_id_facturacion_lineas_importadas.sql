-- Parque/Clientes mostraba facturacion incompleta (solo sistema viejo) y
-- fecha de ultima actividad vieja, porque facturacion_lineas_importadas (el
-- sistema nuevo) nunca tuvo columna cliente_id -- cada consulta que la
-- necesitaba (parque_facturacion_atribuida_rango) tenia que recalcular en
-- vivo la atribucion por chasis/factura/nombre, lo cual es caro y por eso
-- la "ruta rapida" de Parque (parque_resumen_facturacion sin filtros,
-- la vista por defecto) directamente no lo intentaba y solo leia
-- public.facturacion.
--
-- Migracion A (aislada, primera de dos): agrega la columna cliente_id,
-- extrae la logica de atribucion de 3 niveles que ya existe y funciona en
-- parque_facturacion_atribuida_rango (chasis -> numero de factura cruzado
-- contra facturacion -> nombre de cliente) a una funcion reutilizable, la
-- resuelve automaticamente para filas nuevas via trigger, y hace un
-- backfill de una sola vez para las filas existentes.
--
-- Backfill acotado a proposito: de las 193.310 filas de la tabla, solo
-- 1.636 tienen fecha_factura >= 2026-07-01 (el corte que usa Parque para
-- separar sistema viejo de sistema nuevo, mismo corte que usa
-- repuestos_publicar_facturacion_historica). Las 190.811 filas anteriores
-- a esa fecha son la carga historica que ya se atendio en la auditoria de
-- repuestos y Parque no las mira -- quedan sin atribuir a proposito, fuera
-- de este alcance.
--
-- Migracion B (siguiente, separada): redefine parque_resumen_facturacion
-- y refrescar_parque_ultima_actividad para que lean esta columna nueva.
-- Esta migracion A no cambia el comportamiento visible de Parque todavia.

-- =====================================================================
-- 1. Columna + indice, mismo patron que facturacion.cliente_id
--    (nullable, ON DELETE SET NULL -- una factura sin cliente resuelto
--    sigue siendo una fila valida, igual que hoy en facturacion).
-- =====================================================================

ALTER TABLE public.facturacion_lineas_importadas
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_facturacion_lineas_importadas_cliente_fecha
  ON public.facturacion_lineas_importadas (cliente_id, fecha_factura)
  WHERE cliente_id IS NOT NULL;

-- =====================================================================
-- 2. Funcion de resolucion, misma logica de 3 niveles que ya usa
--    parque_facturacion_atribuida_rango (20260812173000_...sql:130-192),
--    pero escalar (una factura a la vez) en vez de por rango de fechas,
--    para poder llamarla desde el trigger fila por fila y desde el
--    backfill por igual.
--
--    Nivel 1: chasis -> ordenes_servicio_importadas + parque_maquinas,
--             solo si hay EXACTAMENTE un cliente distinto entre los
--             chasis que mencionan esa factura (misma regla de
--             ambiguedad que el original: HAVING count(DISTINCT
--             cliente_id) = 1).
--    Nivel 2: numero de factura cruzado contra facturacion.cod_factura
--             en la misma fecha (y misma sucursal si ambas la tienen).
--    Nivel 3: nombre de cliente exacto contra clientes.nombre.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.parque_resolver_cliente_linea_facturacion(
  p_factura text,
  p_codigo_interno_factura text,
  p_fecha_factura timestamptz,
  p_entidad_nombre text,
  p_sucursal public.sucursal
)
RETURNS TABLE (cliente_id uuid, marca text)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH claves AS (
    SELECT
      nullif(public.parque_normalizar_clave(p_factura), '') AS factura_clave,
      nullif(public.parque_normalizar_clave(p_codigo_interno_factura), '') AS interno_clave
  ),
  candidatos_chasis AS (
    SELECT DISTINCT
      pm.cliente_id,
      nullif(upper(trim(pm.marca::text)), '') AS marca
    FROM claves cl
    JOIN public.ordenes_servicio_importadas osi
      ON true
    CROSS JOIN LATERAL regexp_split_to_table(coalesce(osi.factura, ''), ';') AS token(factura)
    JOIN public.parque_maquinas pm
      ON public.parque_normalizar_clave(pm.serie)
        = public.parque_normalizar_clave(osi.nro_chasis)
    WHERE pm.cliente_id IS NOT NULL
      AND public.parque_normalizar_clave(pm.serie) <> ''
      AND (cl.factura_clave IS NOT NULL OR cl.interno_clave IS NOT NULL)
      AND public.parque_normalizar_clave(token.factura) IN (cl.factura_clave, cl.interno_clave)
  ),
  propietario AS (
    SELECT
      min(c.cliente_id::text)::uuid AS cliente_id,
      CASE
        WHEN count(DISTINCT c.marca) FILTER (WHERE c.marca IS NOT NULL) = 1
          THEN min(c.marca) FILTER (WHERE c.marca IS NOT NULL)
        ELSE NULL
      END AS marca
    FROM candidatos_chasis c
    HAVING count(DISTINCT c.cliente_id) = 1
  ),
  cliente_factura AS (
    SELECT f.cliente_id
    FROM claves cl
    JOIN public.facturacion f
      ON f.fecha = p_fecha_factura::date
     AND public.parque_normalizar_clave(f.cod_factura) IN (cl.factura_clave, cl.interno_clave)
     AND public.parque_normalizar_clave(f.cod_factura) <> ''
    WHERE f.cliente_id IS NOT NULL
      AND (p_sucursal IS NULL OR f.sucursal IS NULL OR f.sucursal = p_sucursal)
      AND NOT EXISTS (SELECT 1 FROM propietario WHERE propietario.cliente_id IS NOT NULL)
    ORDER BY
      CASE WHEN public.parque_normalizar_clave(f.cod_factura) = cl.factura_clave THEN 0 ELSE 1 END,
      f.importado_en DESC
    LIMIT 1
  ),
  cliente_nombre AS (
    SELECT c.id AS cliente_id
    FROM public.clientes c
    WHERE lower(trim(c.nombre)) = lower(trim(coalesce(p_entidad_nombre, '')))
      AND nullif(trim(coalesce(p_entidad_nombre, '')), '') IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM propietario WHERE propietario.cliente_id IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM cliente_factura WHERE cliente_factura.cliente_id IS NOT NULL)
    ORDER BY c.creado_en
    LIMIT 1
  )
  SELECT
    coalesce(
      (SELECT propietario.cliente_id FROM propietario),
      (SELECT cliente_factura.cliente_id FROM cliente_factura),
      (SELECT cliente_nombre.cliente_id FROM cliente_nombre)
    ),
    (SELECT propietario.marca FROM propietario);
$$;

REVOKE ALL ON FUNCTION public.parque_resolver_cliente_linea_facturacion(
  text, text, timestamptz, text, public.sucursal
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parque_resolver_cliente_linea_facturacion(
  text, text, timestamptz, text, public.sucursal
) TO authenticated;

-- =====================================================================
-- 3. Trigger: resuelve cliente_id al momento de insertar/actualizar una
--    linea, para que las importaciones futuras del sistema nuevo no
--    dependan de un backfill posterior. Si alguien ya seteo cliente_id
--    explicitamente (ej. una migracion futura), no lo pisa.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.parque_asignar_cliente_linea_facturacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_resuelto record;
BEGIN
  IF NEW.cliente_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT r.cliente_id, r.marca
  INTO v_resuelto
  FROM public.parque_resolver_cliente_linea_facturacion(
    NEW.factura, NEW.codigo_interno_factura, NEW.fecha_factura,
    NEW.entidad_nombre, NEW.sucursal
  ) r;

  NEW.cliente_id := v_resuelto.cliente_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.parque_asignar_cliente_linea_facturacion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parque_asignar_cliente_linea_facturacion() TO authenticated;

DROP TRIGGER IF EXISTS parque_asignar_cliente_linea_facturacion_trigger
  ON public.facturacion_lineas_importadas;
CREATE TRIGGER parque_asignar_cliente_linea_facturacion_trigger
BEFORE INSERT OR UPDATE OF factura, codigo_interno_factura, fecha_factura, entidad_nombre, sucursal
ON public.facturacion_lineas_importadas
FOR EACH ROW EXECUTE FUNCTION public.parque_asignar_cliente_linea_facturacion();

-- =====================================================================
-- 4. Backfill de una sola vez, acotado a las filas del sistema nuevo
--    (fecha_factura >= 2026-07-01, ~1.636 filas hoy). Las historicas
--    (< 2026-07-01) quedan fuera a proposito -- Parque no las usa.
-- =====================================================================

SET LOCAL statement_timeout = '60s';

WITH resuelto AS (
  SELECT fl.id, r.cliente_id
  FROM public.facturacion_lineas_importadas fl
  CROSS JOIN LATERAL public.parque_resolver_cliente_linea_facturacion(
    fl.factura, fl.codigo_interno_factura, fl.fecha_factura,
    fl.entidad_nombre, fl.sucursal
  ) r
  WHERE fl.fecha_factura >= timestamptz '2026-07-01 00:00:00+00'
    AND fl.cliente_id IS NULL
)
UPDATE public.facturacion_lineas_importadas fl
SET cliente_id = resuelto.cliente_id
FROM resuelto
WHERE fl.id = resuelto.id
  AND resuelto.cliente_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
