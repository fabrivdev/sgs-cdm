-- MANUAL ONLY, not executed. Disable VITE_CAMPI_COVERAGE_RUBROS_ENABLED first.
-- Removes only the optional read function. No CASCADE, no data changes.
BEGIN;
DROP FUNCTION public.campi_cobertura_rubros_v1(date,text) RESTRICT;
COMMIT;
