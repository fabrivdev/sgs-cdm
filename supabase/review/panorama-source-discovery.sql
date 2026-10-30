-- SOLO LECTURA, PREPARADO; no ejecutado contra backend.
-- Recuperar definición exacta antes de certificar la población de clientes.
SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS argumentos, pg_get_functiondef(p.oid) AS definicion
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('gerencial_clientes_resumen_v1','ventas_area_movimientos_base','ventas_repuestos_movimientos_v2','ventas_maquinas_fuente_v2');
-- Descubrir vigencias, historiales y metadatos de cargas; no deducir ausencia desde un payload.
SELECT table_name,column_name,data_type FROM information_schema.columns
WHERE table_schema='public' AND (table_name ILIKE '%capacidad%' OR table_name ILIKE '%configuracion%' OR table_name ILIKE '%tecnico%' OR table_name ILIKE '%historico_cargas%' OR table_name ILIKE '%importacion%')
ORDER BY table_name,ordinal_position;
