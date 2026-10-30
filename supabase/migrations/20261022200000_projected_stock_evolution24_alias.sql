-- Confirmed commercial equivalence, restricted to existing catalog alias. No catalog/source DML.
BEGIN;
DO $migration$
DECLARE d text;
BEGIN
IF md5(pg_get_functiondef('parque_stock_proyectado_identidad(text,text,text)'::regprocedure))<>'7a5d71c30e6721fbdc0fd5c373d00a0b' OR md5(pg_get_functiondef('parque_stock_proyectado_v1(date)'::regprocedure))<>'e9af659ed78e94d9c089b7b50365a83b' THEN RAISE EXCEPTION 'Backend changed'; END IF;
IF NOT EXISTS(SELECT 1 FROM parque_modelos_catalogo WHERE id='cf22fb73-a282-4673-8fa2-f929473fe40f'::uuid AND activo AND marca_nombre='HORSCH' AND nombre='MAESTRO EVOLUTION 24' AND clave_normalizada='MAESTROEVOLUTION24') OR (SELECT count(*) FROM parque_modelos_catalogo WHERE activo AND marca_nombre='HORSCH' AND clave_normalizada IN ('MAESTROEVOLUTION24','EVOLUTION2445'))<>1 THEN RAISE EXCEPTION 'Catalog changed'; END IF;
IF NOT EXISTS(SELECT 1 FROM parque_modelos_alias WHERE id='47aa5241-802c-4e92-a727-e5d6e211d6b8'::uuid AND marca='HORSCH' AND clave_alias='EVOLUTION2445' AND modelo_catalogo_id='cf22fb73-a282-4673-8fa2-f929473fe40f'::uuid) OR EXISTS(SELECT 1 FROM parque_modelos_alias WHERE marca='HORSCH' AND clave_alias='EVOLUTION2445' AND modelo_catalogo_id<>'cf22fb73-a282-4673-8fa2-f929473fe40f'::uuid) THEN RAISE EXCEPTION 'Alias changed'; END IF;
IF NOT EXISTS(SELECT 1 FROM parque_stock_proyectado_apertura WHERE id='f6559119-92e8-4e20-a0b8-8d8844bcfb75'::uuid AND fecha_corte=date '2026-08-31' AND modelo='EVOLUTION 24.45' AND marca='HORSCH' AND stock_inicial=1 AND pedidos_compra_inicial=0 AND ventas_pendientes_inicial=0) THEN RAISE EXCEPTION 'Opening changed'; END IF;
d:=pg_get_functiondef('parque_stock_proyectado_identidad(text,text,text)'::regprocedure);
d:=replace(d,'a.revisado_manual OR regexp_replace','a.revisado_manual OR (a.id=''47aa5241-802c-4e92-a727-e5d6e211d6b8''::uuid AND a.clave_alias=''EVOLUTION2445'' AND c.id=''cf22fb73-a282-4673-8fa2-f929473fe40f''::uuid AND c.marca_nombre=''HORSCH'' AND c.nombre=''MAESTRO EVOLUTION 24'') OR regexp_replace');
EXECUTE d;
END $migration$;
COMMIT;
