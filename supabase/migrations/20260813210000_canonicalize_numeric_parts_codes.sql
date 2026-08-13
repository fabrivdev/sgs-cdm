-- Unifica variantes numericas del mismo codigo de repuesto.
-- Ejemplo real: 068712.1, 0687121 y 687121 deben identificar la misma pieza.
--
-- Los codigos alfanumericos conservan sus ceros porque pueden formar parte de
-- la identidad. En codigos exclusivamente numericos, los ceros a la izquierda
-- son una diferencia de formato entre el maestro y la facturacion historica.

CREATE OR REPLACE FUNCTION public.normalizar_codigo_repuesto_flexible(p_codigo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  WITH limpio AS (
    SELECT NULLIF(
      regexp_replace(upper(trim(coalesce(p_codigo, ''))), '[^A-Z0-9]', '', 'g'),
      ''
    ) AS valor
  )
  SELECT CASE
    WHEN valor ~ '^[0-9]+$'
      THEN coalesce(NULLIF(ltrim(valor, '0'), ''), '0')
    ELSE valor
  END
  FROM limpio;
$$;

COMMENT ON FUNCTION public.normalizar_codigo_repuesto_flexible(text) IS
  'Normaliza codigos de repuestos y elimina ceros iniciales solo en claves numericas para reconciliar maestro y facturacion.';

-- Estos indices almacenan el resultado de funciones inmutables. Deben
-- reconstruirse para que no conserven las claves calculadas por la version
-- anterior del normalizador.
DROP INDEX IF EXISTS public.idx_fact_lineas_rep_codigo_fabricante_flexible;
DROP INDEX IF EXISTS public.idx_fact_lineas_rep_cod_mercaderia_flexible;
DROP INDEX IF EXISTS public.idx_fact_lineas_rep_descripcion_codigo;
DROP INDEX IF EXISTS public.idx_productos_rep_descripcion_codigo;
DROP INDEX IF EXISTS public.idx_productos_desc_codigo_flex;

CREATE INDEX idx_fact_lineas_rep_codigo_fabricante_flexible
  ON public.facturacion_lineas_importadas (
    public.normalizar_codigo_repuesto_flexible(codigo_fabricante)
  );

CREATE INDEX idx_fact_lineas_rep_cod_mercaderia_flexible
  ON public.facturacion_lineas_importadas (
    public.normalizar_codigo_repuesto_flexible(cod_mercaderia)
  );

CREATE INDEX idx_fact_lineas_rep_descripcion_codigo
  ON public.facturacion_lineas_importadas (
    public.extraer_codigo_repuesto_descripcion(mercaderia)
  );

CREATE INDEX idx_productos_rep_descripcion_codigo
  ON public.productos (
    public.extraer_codigo_repuesto_descripcion(descripcion)
  )
  WHERE codigo_interno ILIKE 'REP%';

CREATE INDEX idx_productos_desc_codigo_flex
  ON public.productos (
    public.normalizar_codigo_repuesto_flexible(
      substring(
        upper(trim(coalesce(descripcion, '')))
        from '([A-Z0-9][A-Z0-9./-]*[0-9])$'
      )
    )
  );

-- Verificacion defensiva: evita desplegar otra vez una normalizacion que
-- vuelva a separar las tres representaciones del mismo codigo.
DO $$
BEGIN
  IF public.normalizar_codigo_repuesto_flexible('068712.1') <> '687121'
     OR public.normalizar_codigo_repuesto_flexible('0687121') <> '687121'
     OR public.normalizar_codigo_repuesto_flexible('687121') <> '687121' THEN
    RAISE EXCEPTION 'La normalizacion canonica de codigos numericos no es consistente';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
