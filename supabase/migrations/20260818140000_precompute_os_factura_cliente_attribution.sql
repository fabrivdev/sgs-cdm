-- La Migracion A (20260818120000) agrego un trigger BEFORE INSERT/UPDATE
-- en facturacion_lineas_importadas que resuelve cliente_id por fila,
-- llamando a parque_resolver_cliente_linea_facturacion(). Su capa 1
-- (atribucion por chasis) hacia un JOIN sin condicion contra TODA
-- ordenes_servicio_importadas + regexp_split_to_table -- ningun indice
-- puede acelerar eso porque lo que se busca (un numero de factura dentro
-- de un campo con varios separados por ';') no es un valor de columna.
-- Resultado: una importacion de facturacion en chunks de 500 filas
-- disparaba ese escaneo completo 500 veces por chunk y termino en
-- "canceling statement due to statement timeout" (confirmado: la
-- importacion no escribio ni borro nada, datos intactos).
--
-- Esta migracion mueve ese calculo caro de "una vez por fila de
-- facturacion" a "una vez por lote de ordenes de servicio importado":
--
-- 1. Tabla parque_factura_os_cliente: una fila por numero de factura que
--    ordenes_servicio_importadas + parque_maquinas permiten atribuir a UN
--    solo cliente sin ambiguedad (misma regla exacta que ya usaba
--    parque_facturacion_atribuida_rango: si dos clientes distintos
--    mencionan la misma factura, no se resuelve). PK sobre la factura
--    normalizada, ya queda indexada.
-- 2. parque_refrescar_factura_os_cliente(): reconstruye esa tabla entera
--    en un solo paso (TRUNCATE + INSERT por lotes, un JOIN real entre
--    ordenes_servicio_importadas y parque_maquinas, no una busqueda
--    repetida por fila).
-- 3. Trigger DE STATEMENT (no de fila) sobre ordenes_servicio_importadas:
--    se dispara una vez por cada INSERT/UPDATE/DELETE, sin importar
--    cuantas filas afecte -- en una importacion de OS en chunks de 500,
--    dispara una vez por chunk, no una vez por fila.
-- 4. parque_resolver_cliente_linea_facturacion(): su capa 1 pasa a leer
--    esa tabla con un SELECT indexado en vez de recalcular. Las capas 2 y
--    3 no cambian (ya estaban indexadas y no eran el problema).
--
-- No cambia ningun criterio de atribucion ni la regla de ambiguedad --
-- solo cuándo y cómo se calcula. No requiere tocar el codigo del
-- importador: el trigger de statement se dispara solo con el mismo
-- upsert de ordenes_servicio_importadas que la app ya hace hoy.
--
-- Fuera de alcance a proposito: reasignaciones de chasis/cliente en
-- parque_maquinas no disparan un refresh automatico de esta tabla (igual
-- limitacion de alcance que ya tiene parque_ultima_actividad, no es
-- nuevo). Si eso llega a importar, se puede agregar un trigger similar
-- sobre parque_maquinas en una migracion aparte.

-- =====================================================================
-- 1. Tabla de atribucion factura -> cliente (via chasis de OS)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.parque_factura_os_cliente (
  factura_clave text PRIMARY KEY,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  marca text
);

-- =====================================================================
-- 2. Funcion de refresco: un solo JOIN de lote, no una busqueda por fila.
--    Misma regla de ambiguedad que la version por-fila que reemplaza
--    (HAVING count(DISTINCT cliente_id) = 1).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.parque_refrescar_factura_os_cliente()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total integer;
BEGIN
  TRUNCATE public.parque_factura_os_cliente;

  INSERT INTO public.parque_factura_os_cliente (factura_clave, cliente_id, marca)
  WITH candidatos AS (
    SELECT DISTINCT
      public.parque_normalizar_clave(token.factura) AS factura_clave,
      pm.cliente_id,
      nullif(upper(trim(pm.marca::text)), '') AS marca
    FROM public.ordenes_servicio_importadas osi
    CROSS JOIN LATERAL regexp_split_to_table(coalesce(osi.factura, ''), ';') AS token(factura)
    JOIN public.parque_maquinas pm
      ON public.parque_normalizar_clave(pm.serie)
        = public.parque_normalizar_clave(osi.nro_chasis)
    WHERE pm.cliente_id IS NOT NULL
      AND public.parque_normalizar_clave(pm.serie) <> ''
      AND public.parque_normalizar_clave(token.factura) <> ''
  )
  SELECT
    c.factura_clave,
    min(c.cliente_id::text)::uuid,
    CASE
      WHEN count(DISTINCT c.marca) FILTER (WHERE c.marca IS NOT NULL) = 1
        THEN min(c.marca) FILTER (WHERE c.marca IS NOT NULL)
      ELSE NULL
    END
  FROM candidatos c
  GROUP BY c.factura_clave
  HAVING count(DISTINCT c.cliente_id) = 1;

  GET DIAGNOSTICS v_total = ROW_COUNT;
  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.parque_refrescar_factura_os_cliente() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parque_refrescar_factura_os_cliente() TO authenticated;

-- =====================================================================
-- 3. Trigger de STATEMENT (no de fila) sobre ordenes_servicio_importadas.
--    Se dispara una vez por sentencia (una vez por chunk de import, no
--    una vez por fila), y reconstruye la tabla completa.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.parque_trigger_refrescar_factura_os_cliente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.parque_refrescar_factura_os_cliente();
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS parque_refrescar_factura_os_cliente_trigger
  ON public.ordenes_servicio_importadas;
CREATE TRIGGER parque_refrescar_factura_os_cliente_trigger
AFTER INSERT OR DELETE OR UPDATE OF factura, nro_chasis
ON public.ordenes_servicio_importadas
FOR EACH STATEMENT
EXECUTE FUNCTION public.parque_trigger_refrescar_factura_os_cliente();

-- =====================================================================
-- 4. parque_resolver_cliente_linea_facturacion: la capa 1 pasa a leer la
--    tabla precalculada (SELECT indexado por PK) en vez de recorrer
--    ordenes_servicio_importadas. Mismo chequeo de ambiguedad si la
--    factura y el codigo interno de una linea apuntaran a filas
--    distintas de la tabla nueva (caso raro, pero se preserva la misma
--    garantia que tenia la version original). Capas 2 y 3 sin cambios.
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
  propietario AS (
    SELECT
      min(p.cliente_id::text)::uuid AS cliente_id,
      CASE
        WHEN count(DISTINCT p.marca) FILTER (WHERE p.marca IS NOT NULL) = 1
          THEN min(p.marca) FILTER (WHERE p.marca IS NOT NULL)
        ELSE NULL
      END AS marca
    FROM claves cl
    JOIN public.parque_factura_os_cliente p
      ON p.factura_clave IN (cl.factura_clave, cl.interno_clave)
    WHERE cl.factura_clave IS NOT NULL OR cl.interno_clave IS NOT NULL
    HAVING count(DISTINCT p.cliente_id) = 1
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
-- 5. Poblar la tabla nueva AHORA. El trigger de statement solo se
--    dispara ante un INSERT/UPDATE/DELETE futuro sobre ordenes_servicio_
--    importadas -- sin esto, la tabla queda vacia hasta la proxima
--    importacion de OS, y la capa 1 no resolveria nada mientras tanto.
--    Escaneo completo mediante un JOIN real (no una busqueda repetida
--    por fila), timeout ampliado como margen de seguridad igual que en
--    la Migracion A.
-- =====================================================================

SET LOCAL statement_timeout = '120s';

SELECT public.parque_refrescar_factura_os_cliente();

NOTIFY pgrst, 'reload schema';
