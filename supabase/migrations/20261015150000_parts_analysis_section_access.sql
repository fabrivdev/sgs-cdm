BEGIN;

INSERT INTO public.app_secciones(id,modulo_id,nombre,orden,activo)
VALUES ('repuestos.analisis','repuestos','Análisis',25,true)
ON CONFLICT(id) DO UPDATE SET nombre=EXCLUDED.nombre,orden=EXCLUDED.orden;

-- No copiar asignaciones de Stock: el administrador elige cada usuario.
-- Conservar fórmulas y firmas vigentes; fallar si el control esperado cambió.
DO $migration$
DECLARE signature text; definition text; updated text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'public.repuestos_analisis_valorizado(jsonb,text,integer,integer)',
  'public.repuestos_semaforo_historico_paginado(text,text,text,text,integer,integer)'
 ] LOOP
  definition := pg_get_functiondef(signature::regprocedure);
  IF position('has_section_access(auth.uid(),''repuestos.analisis'')' IN definition)>0 THEN CONTINUE; END IF;
  updated := replace(replace(definition,
   'public.has_module_access(auth.uid(),''repuestos'')',
   '(public.has_module_access(auth.uid(),''repuestos'') AND public.has_section_access(auth.uid(),''repuestos.analisis''))'),
   'public.has_module_access(auth.uid(), ''repuestos'')',
   '(public.has_module_access(auth.uid(),''repuestos'') AND public.has_section_access(auth.uid(),''repuestos.analisis''))');
  IF updated=definition THEN RAISE EXCEPTION 'Control de acceso inesperado en %',signature; END IF;
  updated := replace(updated,'Sin acceso al modulo de repuestos','Sin acceso a Análisis de repuestos');
  EXECUTE updated;
 END LOOP;
END $migration$;
NOTIFY pgrst,'reload schema';
COMMIT;
