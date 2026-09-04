-- El motor v5 solicita hasta 20.000 productos a su función base para poder
-- calcular recurrencia y el resumen sobre todo el catálogo. La versión v4
-- volvió a introducir accidentalmente un límite de 1.000 filas por marca,
-- por lo que "Piezas analizadas" quedaba truncado aunque la tabla estuviera
-- paginada correctamente.

DO $migration$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_updated text;
BEGIN
  v_signature := to_regprocedure(
    'public.repuestos_sugerencia_viva_base_v4(text,date,text,text,text,boolean,integer,integer)'
  );

  IF v_signature IS NULL THEN
    RAISE EXCEPTION 'No existe repuestos_sugerencia_viva_base_v4; aplicá primero las migraciones anteriores';
  END IF;

  v_definition := pg_get_functiondef(v_signature);

  IF position('least(coalesce(p_limite, 50), 1000)' IN v_definition) > 0 THEN
    v_updated := replace(
      v_definition,
      'least(coalesce(p_limite, 50), 1000)',
      'least(coalesce(p_limite, 50), 20000)'
    );
    EXECUTE v_updated;
  ELSIF position('least(coalesce(p_limite, 50), 20000)' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'No se encontró el límite interno esperado en repuestos_sugerencia_viva_base_v4';
  END IF;
END;
$migration$;

COMMENT ON FUNCTION public.repuestos_sugerencia_viva_base_v4(
  text,date,text,text,text,boolean,integer,integer
) IS 'Motor v4 sin truncamiento por marca; admite hasta 20.000 productos para que v5 analice el catálogo completo.';

NOTIFY pgrst, 'reload schema';
