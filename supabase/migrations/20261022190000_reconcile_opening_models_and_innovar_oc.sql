-- Target: tgwoqdsrbomuwfanhuzp. No source DML, catalog edits, ACL or RLS changes.
-- Four source-specific identities, never global +/- normalization.
-- E26100032 retains its real date, document and future ATA. Only new-order increment is excluded.
BEGIN;
DO $migration$
DECLARE d text;
BEGIN
IF md5(pg_get_functiondef('public.parque_stock_proyectado_v1(date)'::regprocedure))<>'539f91647df0b55e87f3f6535bbc3025' OR md5(pg_get_functiondef('public.parque_stock_proyectado_identidad(text,text,text)'::regprocedure))<>'7a5d71c30e6721fbdc0fd5c373d00a0b' THEN RAISE EXCEPTION 'Backend changed'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.parque_stock_proyectado_apertura WHERE id='d94a3d76-e3d1-4fe8-b7a3-42a25ffbb6d4'::uuid AND fecha_corte=date '2026-08-31' AND marca='HORSCH' AND modelo='JOKER 5 RT+' AND stock_inicial=1 AND pedidos_compra_inicial=0 AND ventas_pendientes_inicial=0 AND fuente='CDM - Compras_Maquinas vs Vtas.xlsx') THEN RAISE EXCEPTION 'Opening changed: d94a3d76-e3d1-4fe8-b7a3-42a25ffbb6d4'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.parque_modelos_catalogo WHERE id='77f0d2c4-b3cb-4853-aab6-bb4fe10ae7b1'::uuid AND activo AND nombre='JOKER 5 RT' AND marca_nombre='HORSCH' AND subgrupo::text='SUELO') OR (SELECT count(*) FROM public.parque_modelos_catalogo WHERE activo AND marca_nombre='HORSCH' AND clave_normalizada='JOKER5RT')<>1 THEN RAISE EXCEPTION 'Catalog changed: 77f0d2c4-b3cb-4853-aab6-bb4fe10ae7b1'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.parque_stock_proyectado_apertura WHERE id='4a65a247-9da4-4617-90ea-800d346baf40'::uuid AND fecha_corte=date '2026-08-31' AND marca='HORSCH' AND modelo='JOKER 6 RT+' AND stock_inicial=1 AND pedidos_compra_inicial=0 AND ventas_pendientes_inicial=0 AND fuente='CDM - Compras_Maquinas vs Vtas.xlsx') THEN RAISE EXCEPTION 'Opening changed: 4a65a247-9da4-4617-90ea-800d346baf40'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.parque_modelos_catalogo WHERE id='7645b8ec-6a74-4c4d-871d-8d9155fb078c'::uuid AND activo AND nombre='JOKER 6 RT' AND marca_nombre='HORSCH' AND subgrupo::text='SUELO') OR (SELECT count(*) FROM public.parque_modelos_catalogo WHERE activo AND marca_nombre='HORSCH' AND clave_normalizada='JOKER6RT')<>1 THEN RAISE EXCEPTION 'Catalog changed: 7645b8ec-6a74-4c4d-871d-8d9155fb078c'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.parque_stock_proyectado_apertura WHERE id='7d8a0c2b-0f22-46b1-9392-8984f7070a44'::uuid AND fecha_corte=date '2026-08-31' AND marca='HORSCH' AND modelo='KNIFER ROLLER CULTRO 9TC' AND stock_inicial=2 AND pedidos_compra_inicial=0 AND ventas_pendientes_inicial=0 AND fuente='CDM - Compras_Maquinas vs Vtas.xlsx') THEN RAISE EXCEPTION 'Opening changed: 7d8a0c2b-0f22-46b1-9392-8984f7070a44'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.parque_modelos_catalogo WHERE id='78755d50-a17d-4a9f-b930-9bd907130043'::uuid AND activo AND nombre='CULTRO 9 TC' AND marca_nombre='HORSCH' AND subgrupo::text='SUELO') OR (SELECT count(*) FROM public.parque_modelos_catalogo WHERE activo AND marca_nombre='HORSCH' AND clave_normalizada='CULTRO9TC')<>1 THEN RAISE EXCEPTION 'Catalog changed: 78755d50-a17d-4a9f-b930-9bd907130043'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.parque_stock_proyectado_apertura WHERE id='5154288b-b699-4663-8d5c-3d43ee6cf54e'::uuid AND fecha_corte=date '2026-08-31' AND marca='NB' AND modelo='NB MAICERO 20L X 45CM' AND stock_inicial=1 AND pedidos_compra_inicial=0 AND ventas_pendientes_inicial=1 AND fuente='CDM - Compras_Maquinas vs Vtas.xlsx') THEN RAISE EXCEPTION 'Opening changed: 5154288b-b699-4663-8d5c-3d43ee6cf54e'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.parque_modelos_catalogo WHERE id='06c10f7b-47e1-42ec-b2bd-19d1b0fd57f4'::uuid AND activo AND nombre='CABEZAL MAICERO 20L X 45CM' AND marca_nombre='NB' AND subgrupo::text='PLATAFORMAS/CABEZALES') OR (SELECT count(*) FROM public.parque_modelos_catalogo WHERE activo AND marca_nombre='NB' AND clave_normalizada='CABEZALMAICERO20LX45CM')<>1 THEN RAISE EXCEPTION 'Catalog changed: 06c10f7b-47e1-42ec-b2bd-19d1b0fd57f4'; END IF;
IF EXISTS(SELECT 1 FROM public.parque_modelos_catalogo WHERE activo AND marca_nombre='HORSCH' AND clave_normalizada IN ('JOKER5RTPLUS','JOKER6RTPLUS')) THEN RAISE EXCEPTION 'Distinct plus variant now exists'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.parque_stock_proyectado_apertura WHERE id='c0a681ee-8ff2-426d-932c-4338578531b1'::uuid AND modelo='EVOLUTION 32' AND fecha_corte=date '2026-08-31' AND stock_inicial=0 AND pedidos_compra_inicial=1 AND ventas_pendientes_inicial=0) THEN RAISE EXCEPTION 'Evolution opening changed'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.maquinaria_importacion_unidades_operativas WHERE id='2a65c732-901c-4d2b-a153-1271374c5044'::uuid AND importacion_linea_id='a8135247-118b-4627-b226-ba45ca94b52c'::uuid AND oc='E26100032' AND fecha_pedido=date '2026-09-01' AND ata IS NULL AND activa AND cantidad=1 AND modelo='MAESTRO EVOLUTION 32') THEN RAISE EXCEPTION 'Linked import changed'; END IF;
d:=pg_get_functiondef('public.parque_stock_proyectado_v1(date)'::regprocedure);
d:=replace(d,'ELSE a.modelo END) i','WHEN a.id=''d94a3d76-e3d1-4fe8-b7a3-42a25ffbb6d4''::uuid AND a.fecha_corte=date ''2026-08-31''
        AND a.marca=''HORSCH'' AND a.modelo=''JOKER 5 RT+''
        THEN (SELECT nombre FROM public.parque_modelos_catalogo WHERE id=''77f0d2c4-b3cb-4853-aab6-bb4fe10ae7b1''::uuid AND activo)
      WHEN a.id=''4a65a247-9da4-4617-90ea-800d346baf40''::uuid AND a.fecha_corte=date ''2026-08-31''
        AND a.marca=''HORSCH'' AND a.modelo=''JOKER 6 RT+''
        THEN (SELECT nombre FROM public.parque_modelos_catalogo WHERE id=''7645b8ec-6a74-4c4d-871d-8d9155fb078c''::uuid AND activo)
      WHEN a.id=''7d8a0c2b-0f22-46b1-9392-8984f7070a44''::uuid AND a.fecha_corte=date ''2026-08-31''
        AND a.marca=''HORSCH'' AND a.modelo=''KNIFER ROLLER CULTRO 9TC''
        THEN (SELECT nombre FROM public.parque_modelos_catalogo WHERE id=''78755d50-a17d-4a9f-b930-9bd907130043''::uuid AND activo)
      WHEN a.id=''5154288b-b699-4663-8d5c-3d43ee6cf54e''::uuid AND a.fecha_corte=date ''2026-08-31''
        AND a.marca=''NB'' AND a.modelo=''NB MAICERO 20L X 45CM''
        THEN (SELECT nombre FROM public.parque_modelos_catalogo WHERE id=''06c10f7b-47e1-42ec-b2bd-19d1b0fd57f4''::uuid AND activo)
        ELSE a.modelo END) i');
d:=replace(d,'WHERE r.fecha_pedido>v_apertura AND r.fecha_pedido<=p_corte)::numeric AS pedidos_nuevos','WHERE r.fecha_pedido>v_apertura AND r.fecha_pedido<=p_corte
        AND r.id<>''2a65c732-901c-4d2b-a153-1271374c5044''::uuid)::numeric AS pedidos_nuevos');
d:=replace(d,'  WITH apertura AS MATERIALIZED (','  -- E26100032 is the same unit already included in opening; confirmed 2026-10-22.
  -- A missing/inactive linked source has no reliable cancellation date/history.
  -- Fail explicitly instead of leaving a phantom opening OC or rewriting past cuts.
  IF NOT EXISTS (SELECT 1 FROM public.maquinaria_importacion_unidades_operativas
    WHERE id=''2a65c732-901c-4d2b-a153-1271374c5044''::uuid
      AND importacion_linea_id=''a8135247-118b-4627-b226-ba45ca94b52c''::uuid
      AND oc=''E26100032'' AND activa) THEN
    RAISE EXCEPTION ''La OC E26100032 incluida en apertura requiere conciliar su baja antes de calcular stock proyectado'' USING ERRCODE=''22023'';
  END IF;

  WITH apertura AS MATERIALIZED (');
d:=replace(d,'    ''solo_nuevas'',true,','    ''solo_nuevas'',true,
    ''conciliaciones_apertura'',jsonb_build_array(jsonb_build_object(
      ''apertura_id'',''c0a681ee-8ff2-426d-932c-4338578531b1'',
      ''importacion_unidad_id'',''2a65c732-901c-4d2b-a153-1271374c5044'',
      ''oc'',''E26100032'',''unidades'',1,''criterio'',''Incluida en apertura, confirmada 2026-10-22'')),
    ''identidades_apertura'',''[{"apertura_id":"d94a3d76-e3d1-4fe8-b7a3-42a25ffbb6d4","modelo_original":"JOKER 5 RT+","modelo_catalogo_id":"77f0d2c4-b3cb-4853-aab6-bb4fe10ae7b1","evidencia":"Stock por chasis e importacion, conciliacion 2026-10-22"},{"apertura_id":"4a65a247-9da4-4617-90ea-800d346baf40","modelo_original":"JOKER 6 RT+","modelo_catalogo_id":"7645b8ec-6a74-4c4d-871d-8d9155fb078c","evidencia":"Stock por chasis e importacion, conciliacion 2026-10-22"},{"apertura_id":"7d8a0c2b-0f22-46b1-9392-8984f7070a44","modelo_original":"KNIFER ROLLER CULTRO 9TC","modelo_catalogo_id":"78755d50-a17d-4a9f-b930-9bd907130043","evidencia":"Stock por chasis e importacion, conciliacion 2026-10-22"},{"apertura_id":"5154288b-b699-4663-8d5c-3d43ee6cf54e","modelo_original":"NB MAICERO 20L X 45CM","modelo_catalogo_id":"06c10f7b-47e1-42ec-b2bd-19d1b0fd57f4","evidencia":"Stock por chasis e importacion, conciliacion 2026-10-22"}]''::jsonb,');
EXECUTE d;
END $migration$;
COMMIT;
