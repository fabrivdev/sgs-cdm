-- Retira la vista independiente "Agenda comercial" del catálogo de accesos.
-- No elimina programaciones, calendarios ni datos históricos de servicios.

delete from public.app_secciones
where id = 'servicios.agenda';

notify pgrst, 'reload schema';
