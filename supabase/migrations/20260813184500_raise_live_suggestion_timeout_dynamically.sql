-- Ajusta todas las variantes instaladas del motor sin depender de una firma
-- concreta. Esto permite aplicarlo tambien en entornos con migraciones parciales.

DO $migration$
DECLARE
  v_function regprocedure;
  v_updated integer := 0;
BEGIN
  FOR v_function IN
    SELECT p.oid::regprocedure
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'repuestos_sugerencia_viva',
        'repuestos_sugerencia_viva_base_v1'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %s SET statement_timeout TO %L',
      v_function,
      '90s'
    );
    v_updated := v_updated + 1;
  END LOOP;

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'No se encontraron las funciones del motor de sugerencias';
  END IF;
END;
$migration$;

NOTIFY pgrst, 'reload schema';
