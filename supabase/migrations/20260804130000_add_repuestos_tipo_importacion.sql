-- Nuevo tipo de importacion para el catalogo de productos y el stock de
-- Repuestos (Fase 1 del modulo). Valor de enum nuevo: debe ir en su propia
-- migracion/transaccion antes de poder usarse (regla de Postgres para
-- ALTER TYPE ... ADD VALUE), igual que se hizo con 'gerencia' en
-- app_role.
alter type public.tipo_importacion add value if not exists 'repuestos';
