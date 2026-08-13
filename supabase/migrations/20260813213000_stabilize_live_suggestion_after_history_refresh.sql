-- El motor vivo v3 conserva las versiones anteriores como capas internas.
-- Todas participan en un mismo calculo y cada una puede mantener su propio
-- statement_timeout. Al reconstruir el historial, el primer calculo en frio
-- puede superar los 90 segundos aunque el refresco haya terminado bien.

DO $migration$
DECLARE
  v_funcion regprocedure;
BEGIN
  FOR v_funcion IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'repuestos_sugerencia_viva',
        'repuestos_sugerencia_viva_base_v1',
        'repuestos_sugerencia_viva_base_v2'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %s SET statement_timeout TO %L',
      v_funcion,
      '180s'
    );
  END LOOP;
END;
$migration$;

NOTIFY pgrst, 'reload schema';
