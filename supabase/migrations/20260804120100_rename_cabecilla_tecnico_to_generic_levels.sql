-- Segunda mitad del cambio de enum (separada de la que agrega 'gerencia':
-- Postgres no permite usar un valor de enum recien agregado en la misma
-- transaccion que lo crea, y aunque este paso no lo usa, se mantiene en su
-- propia migracion por prolijidad y para poder revisar cada paso aislado).
--
-- Renombra las etiquetas del enum, no borra ni reinserta filas: toda fila
-- de user_roles con role='cabecilla' pasa a leerse 'jefatura' automatica y
-- atomicamente, sin downtime ni migracion de datos aparte.

ALTER TYPE public.app_role RENAME VALUE 'cabecilla' TO 'jefatura';
ALTER TYPE public.app_role RENAME VALUE 'tecnico' TO 'operativo';
