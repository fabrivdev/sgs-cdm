-- Primer paso del esquema de modulos: el nivel jerarquico pasa de 3 a 4
-- escalones genericos (admin/gerencia/jefatura/operativo). "Cabecilla" y
-- "tecnico" dejan de ser el nombre guardado y pasan a ser una etiqueta de
-- presentacion (nivel + acceso al modulo Servicios), resuelta en el
-- frontend -- no hace falta tocar filas existentes: renombrar un valor de
-- enum de Postgres actualiza automaticamente todas las filas que ya lo usan
-- y todas las policies RLS que lo referencian, sin reescribir nada de eso.
--
-- 'gerencia' es un nivel nuevo sin usuarios todavia: se agrega el valor
-- pero no se usa en esta misma migracion (Postgres no permite usar un
-- valor de enum recien agregado en la misma transaccion que lo crea).

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gerencia';
