-- Ejecutar DESPUES de aplicar la migracion
-- 20260814030000_materialize_loaded_parts_history.sql.
--
-- Esta llamada no vuelve a cargar el Excel ni rehace el mapeo de codigos.
-- Solo publica en el motor vivo las lineas historicas que ya estan vinculadas.

SELECT public.repuestos_publicar_facturacion_historica();
