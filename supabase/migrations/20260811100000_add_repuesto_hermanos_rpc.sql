-- Diagnostico confirmado con el usuario: hay codigos de fabricante (y
-- alguno de descripcion) compartidos entre 2-3 filas DISTINTAS de
-- productos -- no es un error de carga, es la clasificacion intencional
-- de TOTVS por origen/condicion (REPIN = Importado Nuevo, REPNN =
-- Nacional Nuevo, REPNU = Nacional Usado) para lo que es la misma pieza
-- fisica. La factura de venta solo registra el codigo de fabricante
-- compartido, no cual de las variantes se vendio realmente -- esa
-- ambiguedad no se puede resolver con mejor matching, el dato que lo
-- resolveria no esta en el origen.
--
-- En vez de fusionar catalogo (destruiria la clasificacion real) o
-- adivinar a cual pertenece cada venta, este RPC devuelve los SKU
-- "hermanos" de un producto para que la ficha pueda avisar que el
-- historial de ventas mostrado podria compartirse con ellos, sin
-- esconder la ambiguedad.
CREATE OR REPLACE FUNCTION public.repuesto_hermanos(p_producto_codigo text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH producto AS MATERIALIZED (
    SELECT
      p.codigo_interno,
      public.normalizar_codigo_repuesto_flexible(p.codigo_fabricante) AS codigo_fabricante_norm,
      public.extraer_codigo_repuesto_descripcion(p.descripcion) AS codigo_descripcion_norm
    FROM public.productos p
    WHERE p.codigo_interno = p_producto_codigo
      AND p.codigo_interno ILIKE 'REP%'
    LIMIT 1
  ),
  hermanos AS (
    SELECT DISTINCT p2.codigo_interno, p2.descripcion
    FROM producto p
    JOIN public.productos p2
      ON p2.codigo_interno <> p.codigo_interno
     AND p2.codigo_interno ILIKE 'REP%'
     AND (
       (p.codigo_fabricante_norm IS NOT NULL AND public.normalizar_codigo_repuesto_flexible(p2.codigo_fabricante) = p.codigo_fabricante_norm)
       OR (p.codigo_descripcion_norm IS NOT NULL AND public.extraer_codigo_repuesto_descripcion(p2.descripcion) = p.codigo_descripcion_norm)
     )
  )
  SELECT coalesce(
    jsonb_agg(jsonb_build_object('codigo_interno', codigo_interno, 'descripcion', descripcion) ORDER BY codigo_interno),
    '[]'::jsonb
  )
  FROM hermanos;
$$;

COMMENT ON FUNCTION public.repuesto_hermanos(text) IS
  'SKU con el mismo codigo de fabricante o codigo de descripcion que el producto dado (distinta fila de origen/condicion) -- para avisar en la ficha que las ventas mostradas podrian compartirse con ellos.';

REVOKE ALL ON FUNCTION public.repuesto_hermanos(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repuesto_hermanos(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
