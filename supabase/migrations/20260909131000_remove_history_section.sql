-- Retira la vista independiente "Historial" del catálogo de accesos.
-- No elimina registros históricos utilizados por otras vistas.

delete from public.app_secciones
where id = 'servicios.historial';

notify pgrst, 'reload schema';
