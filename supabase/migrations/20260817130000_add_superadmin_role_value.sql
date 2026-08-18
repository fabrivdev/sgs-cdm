-- Paso 1a de 2 (sacar el bypass de superadmin por email hardcodeado del
-- frontend, ver src/hooks/useAuth.tsx:230). Se agrega 'superadmin' como
-- nivel nuevo de public.app_role, siguiendo el mismo mecanismo que ya usan
-- admin/gerencia/jefatura/operativo (user_roles + has_role()), en vez de
-- inventar un flag/columna paralela.
--
-- Va en su propio archivo, sin usar el valor todavia, porque Postgres no
-- permite usar un valor de enum recien agregado en la misma transaccion que
-- lo crea (mismo motivo por el que 20260804120000_add_gerencia_level_and_
-- rename_roles.sql aislo su ALTER TYPE en un archivo propio).
--
-- Este archivo, por si solo, no cambia ningun comportamiento: ningun codigo
-- de la app todavia lee el rol 'superadmin'. Es puramente aditivo/inerte
-- hasta el paso 2 (backfill) y el paso 3 (frontend, en una tanda separada).

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'superadmin';
