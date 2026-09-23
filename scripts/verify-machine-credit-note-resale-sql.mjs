// PostgreSQL regression test for NC -> invoice machine reconciliation.
// It executes the actual migration in an isolated in-memory database.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const first = async (sql, params = []) => (await db.query(sql, params)).rows[0];

try {
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000001');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
      SELECT '00000000-0000-0000-0000-000000000001'::uuid
    $$;

    CREATE TYPE public.app_role AS ENUM ('admin','superadmin','jefatura','usuario');
    CREATE TYPE public.marca AS ENUM ('CLAAS','HORSCH','OTROS');
    CREATE TYPE public.subgrupo_maquina AS ENUM (
      'COSECHADORAS','SEMBRADORAS','PICADORAS','PLATAFORMAS/CABEZALES',
      'PULVERIZADORAS','TRACTORES','SUELO','OTRO'
    );
    CREATE TYPE public.sucursal AS ENUM ('Santa Rita','Campo 9','Katuete','Misiones');

    CREATE FUNCTION public.has_role(uuid, public.app_role) RETURNS boolean
      LANGUAGE sql AS $$ SELECT $2 IN ('admin'::public.app_role,'superadmin'::public.app_role) $$;
    CREATE FUNCTION public.normalizar_chasis_notificacion(text) RETURNS text
      LANGUAGE sql IMMUTABLE AS $$
      SELECT nullif(regexp_replace(upper(coalesce($1,'')), '[^A-Z0-9]', '', 'g'), '')
      $$;
    CREATE FUNCTION public.valor_json_insensible(jsonb, text[]) RETURNS text
      LANGUAGE sql IMMUTABLE AS $$
      SELECT nullif(btrim(e.value), '')
      FROM jsonb_each_text(coalesce($1, '{}'::jsonb)) e
      WHERE regexp_replace(upper(e.key), '[^A-Z0-9]', '', 'g') = ANY (
        SELECT regexp_replace(upper(keys.key), '[^A-Z0-9]', '', 'g')
        FROM unnest($2) AS keys(key)
      ) LIMIT 1
      $$;
    CREATE FUNCTION public.extraer_chasis_venta_maquina(text, jsonb, text DEFAULT NULL)
      RETURNS text LANGUAGE sql STABLE AS $$
      SELECT public.valor_json_insensible($2, ARRAY['CHASIS','CASIS','SERIE'])
      $$;
    CREATE FUNCTION public.inferir_subgrupo_maquina_notificacion(text)
      RETURNS public.subgrupo_maquina LANGUAGE sql IMMUTABLE AS $$
      SELECT CASE WHEN upper($1) LIKE '%LEXION%'
        THEN 'COSECHADORAS'::public.subgrupo_maquina
        ELSE 'OTRO'::public.subgrupo_maquina END
      $$;

    CREATE TABLE public.clientes(
      id uuid PRIMARY KEY,
      nombre text NOT NULL,
      ruc text
    );
    CREATE TABLE public.maquinaria_operaciones(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      estado text,
      actualizado_en timestamptz DEFAULT now()
    );
    CREATE TABLE public.maquinaria_operacion_lineas(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      operacion_id uuid REFERENCES public.maquinaria_operaciones,
      elegible_parque boolean DEFAULT true
    );
    CREATE TABLE public.maquinaria_unidades_operacion(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      linea_id uuid REFERENCES public.maquinaria_operacion_lineas,
      chasis text,
      parque_maquina_id uuid,
      estado text,
      actualizado_en timestamptz DEFAULT now()
    );
    CREATE TABLE public.parque_maquinas(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      cliente_id uuid REFERENCES public.clientes,
      marca public.marca NOT NULL,
      subgrupo public.subgrupo_maquina NOT NULL,
      subgrupo_personalizado text,
      modelo_tipo text,
      serie text NOT NULL,
      anio integer,
      sucursal public.sucursal,
      localidad text,
      vendedor text,
      notas text,
      agregado_manualmente boolean DEFAULT false,
      activo boolean DEFAULT true,
      actualizado_en timestamptz DEFAULT now()
    );
    CREATE TABLE public.parque_historial_propiedad(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      maquina_id uuid NOT NULL REFERENCES public.parque_maquinas,
      cliente_anterior_id uuid REFERENCES public.clientes,
      cliente_nuevo_id uuid REFERENCES public.clientes,
      tipo_evento text NOT NULL,
      operacion_id uuid REFERENCES public.maquinaria_operaciones,
      observaciones text,
      registrado_por uuid REFERENCES auth.users DEFAULT auth.uid(),
      registrado_en timestamptz DEFAULT now(),
      CONSTRAINT parque_historial_propiedad_tipo_evento_check
        CHECK (tipo_evento IN ('ALTA','TRANSFERENCIA','BAJA'))
    );
    CREATE TABLE public.facturacion_lineas_importadas(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      origen_sistema text DEFAULT 'new_grid_xml',
      codigo_interno_factura text,
      factura text,
      entidad_nombre text NOT NULL,
      cliente_id uuid REFERENCES public.clientes,
      fecha_factura timestamptz,
      sucursal public.sucursal,
      subgrupo_original text,
      grupo_normalizado text,
      marca_normalizada public.marca DEFAULT 'OTROS',
      observacion text,
      cod_mercaderia text,
      mercaderia text,
      cantidad numeric,
      total_venta numeric DEFAULT 0,
      vendedor text,
      raw_data jsonb DEFAULT '{}'::jsonb,
      importado_en timestamptz DEFAULT now()
    );
    CREATE TABLE public.notificaciones(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tipo text NOT NULL,
      titulo text NOT NULL,
      mensaje text,
      clave_unica text NOT NULL UNIQUE,
      destinatario_roles public.app_role[] DEFAULT ARRAY['admin'::public.app_role],
      datos jsonb DEFAULT '{}'::jsonb,
      estado text DEFAULT 'pendiente',
      visto_por uuid[] DEFAULT '{}'::uuid[],
      accionada_por uuid REFERENCES auth.users,
      accionada_en timestamptz,
      creado_en timestamptz DEFAULT now(),
      actualizado_en timestamptz DEFAULT now()
    );
    CREATE TABLE public.parque_stock_maquinas(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      chasis text,
      saldo_actual numeric DEFAULT 1,
      unidad_operacion_id uuid,
      parque_origen_id uuid REFERENCES public.parque_maquinas,
      estado text,
      datos_fuente jsonb DEFAULT '{}'::jsonb,
      importado_en timestamptz DEFAULT now()
    );

    CREATE FUNCTION public.registrar_historial_propiedad_maquina()
      RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
    CREATE TRIGGER registrar_historial_propiedad_maquina_trigger
      AFTER INSERT OR UPDATE OF cliente_id, activo ON public.parque_maquinas
      FOR EACH ROW EXECUTE FUNCTION public.registrar_historial_propiedad_maquina();
    CREATE FUNCTION public.maquinaria_bloquear_stock_activo_en_parque()
      RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
    CREATE TRIGGER zz_maquinaria_bloquear_stock_activo_en_parque_trigger
      BEFORE INSERT OR UPDATE OF unidad_operacion_id ON public.parque_stock_maquinas
      FOR EACH ROW EXECUTE FUNCTION public.maquinaria_bloquear_stock_activo_en_parque();

    INSERT INTO public.clientes(id,nombre) VALUES
      ('10000000-0000-0000-0000-000000000001','CLIENTE A'),
      ('10000000-0000-0000-0000-000000000002','CLIENTE B'),
      ('10000000-0000-0000-0000-000000000003','CLIENTE A');
    INSERT INTO public.parque_maquinas(
      id,cliente_id,marca,subgrupo,modelo_tipo,serie,activo
    ) VALUES
      ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','CLAAS','COSECHADORAS','LEXION 750','CASE-1',true),
      ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','CLAAS','COSECHADORAS','LEXION 770','CASE-2',false),
      ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','CLAAS','COSECHADORAS','LEXION 780','CASE-3',true),
      ('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','CLAAS','COSECHADORAS','LEXION 790','CASE-4',true);
    INSERT INTO public.parque_stock_maquinas(
      id,chasis,saldo_actual,parque_origen_id,estado,datos_fuente
    ) VALUES (
      '30000000-0000-0000-0000-000000000002','CASE-2',1,
      '20000000-0000-0000-0000-000000000002','Usado','{"origen":"PARTE_DE_PAGO_CONFIRMADA"}'
    );
    INSERT INTO public.notificaciones(
      id,tipo,titulo,clave_unica,datos,estado
    ) VALUES (
      '40000000-0000-0000-0000-000000000002','stock_chasis_en_parque',
      'Ingreso de ejemplo','stock|case-2',
      '{"chasis":"CASE-2","parque_maquina_id":"20000000-0000-0000-0000-000000000002"}',
      'confirmada'
    );
    INSERT INTO public.facturacion_lineas_importadas(
      id,factura,entidad_nombre,cliente_id,fecha_factura,grupo_normalizado,
      marca_normalizada,mercaderia,cod_mercaderia,cantidad,total_venta,raw_data
    ) VALUES
      ('50000000-0000-0000-0000-000000000001','NC-1','CLIENTE A',
       '10000000-0000-0000-0000-000000000001','2026-09-18','MAQUINARIAS',
       'CLAAS','LEXION 750','VEIC_1',-1,-100,
       '{"canonical_document_kind":"NotaCredito","original_invoice_number":"F-ORIGINAL","CHASIS":"CASE-1"}'),
      ('50000000-0000-0000-0000-000000000002','F-NEW','CLIENTE A',
       '10000000-0000-0000-0000-000000000001','2026-09-22','MAQUINARIAS',
       'CLAAS','LEXION 750','VEIC_1',1,90,
       '{"canonical_document_kind":"Factura","CHASIS":"CASE-1","MODELO":"LEXION 750"}'),
      ('50000000-0000-0000-0000-000000000003','F-REENTRY','CLIENTE B',
       '10000000-0000-0000-0000-000000000002','2026-09-22','MAQUINARIAS',
       'CLAAS','LEXION 770','VEIC_2',1,120,
       '{"canonical_document_kind":"Factura","CHASIS":"CASE-2","MODELO":"LEXION 770"}'),
      ('50000000-0000-0000-0000-000000000004','F-SAME','CLIENTE A',
       '10000000-0000-0000-0000-000000000003','2026-09-22','MAQUINARIAS',
       'CLAAS','LEXION 780','VEIC_3',1,130,
       '{"canonical_document_kind":"Factura","CHASIS":"CASE-3","MODELO":"LEXION 780"}'),
      ('50000000-0000-0000-0000-000000000005','F-TRANSFER','CLIENTE B',
       '10000000-0000-0000-0000-000000000002','2026-09-22','MAQUINARIAS',
       'CLAAS','LEXION 790','VEIC_4',1,140,
       '{"canonical_document_kind":"Factura","CHASIS":"CASE-4","MODELO":"LEXION 790"}');
  `);

  const migration = await readFile(
    new URL("../supabase/migrations/20260923120000_reconcile_machine_credit_notes_and_resales.sql", import.meta.url),
    "utf8",
  );
  await db.exec(migration);
  const identityMigration = await readFile(
    new URL("../supabase/migrations/20260923140000_suppress_same_customer_machine_transfer_alerts.sql", import.meta.url),
    "utf8",
  );
  await db.exec(identityMigration);
  const sellerMigration = await readFile(
    new URL("../supabase/migrations/20260923160000_copy_machine_sale_seller_to_park.sql", import.meta.url),
    "utf8",
  );
  await db.exec(sellerMigration);

  const refactNotification = await first(`
    SELECT * FROM public.notificaciones
    WHERE datos ->> 'facturacion_linea_id' = '50000000-0000-0000-0000-000000000002'
  `);
  assert.equal(refactNotification.tipo, "venta_maquina_reingreso");
  assert.equal(refactNotification.datos.revision_sugerida, "REFACTURACION_PROBABLE");
  assert.equal(refactNotification.datos.nc_documento, "NC-1");
  assert.equal(refactNotification.datos.nc_factura_original, "F-ORIGINAL");

  const duplicateIdentityNotice = await first(`
    SELECT estado, datos FROM public.notificaciones
    WHERE datos ->> 'facturacion_linea_id' = '50000000-0000-0000-0000-000000000004'
  `);
  assert.equal(duplicateIdentityNotice.estado, "descartada");
  assert.equal(duplicateIdentityNotice.datos.resolucion, "mismo_cliente_canonico");

  assert.equal((await first(`SELECT public.notificacion_venta_mismo_cliente(
    '20000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000003',
    'CLIENTE A'
  ) AS same`)).same, true);
  await db.exec(`
    UPDATE public.clientes SET ruc='111-1' WHERE id='10000000-0000-0000-0000-000000000001';
    UPDATE public.clientes SET ruc='222-2' WHERE id='10000000-0000-0000-0000-000000000003';
  `);
  assert.equal((await first(`SELECT public.notificacion_venta_mismo_cliente(
    '20000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000003',
    'CLIENTE A'
  ) AS same`)).same, false);
  await db.exec(`
    UPDATE public.clientes SET ruc='111-1', nombre='OTRA GRAFIA' WHERE id='10000000-0000-0000-0000-000000000003';
  `);
  assert.equal((await first(`SELECT public.notificacion_venta_mismo_cliente(
    '20000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000003',
    'OTRA GRAFIA'
  ) AS same`)).same, true);
  await db.exec(`
    UPDATE public.clientes SET ruc=NULL, nombre='CLIENTE A' WHERE id='10000000-0000-0000-0000-000000000003';
    UPDATE public.clientes SET ruc=NULL WHERE id='10000000-0000-0000-0000-000000000001';
  `);

  const realTransferNotice = await first(`
    SELECT estado, titulo, datos FROM public.notificaciones
    WHERE datos ->> 'facturacion_linea_id' = '50000000-0000-0000-0000-000000000005'
  `);
  assert.equal(realTransferNotice.estado, "pendiente");
  assert.equal(realTransferNotice.titulo, "Revisar transferencia de máquina");
  assert.equal(realTransferNotice.datos.revision_sugerida, "TRANSFERENCIA");

  await db.exec(`
    INSERT INTO public.parque_maquinas(
      id,cliente_id,marca,subgrupo,modelo_tipo,serie,activo
    ) VALUES (
      '20000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001',
      'CLAAS','COSECHADORAS','LEXION 880','CASE-5',true
    );
    INSERT INTO public.facturacion_lineas_importadas(
      id,factura,entidad_nombre,cliente_id,fecha_factura,grupo_normalizado,
      marca_normalizada,mercaderia,cod_mercaderia,cantidad,total_venta,vendedor,raw_data
    ) VALUES (
      '50000000-0000-0000-0000-000000000007','F-FUTURE','CLIENTE B',
      '10000000-0000-0000-0000-000000000002','2026-09-23','MAQUINARIAS',
      'CLAAS','LEXION 880','VEIC_5',1,150,'VENDEDOR FUTURO',
      '{"canonical_document_kind":"Factura","CHASIS":"CASE-5","MODELO":"LEXION 880"}'
    );
    SELECT public.generar_notificacion_venta_maquina(
      '50000000-0000-0000-0000-000000000007'
    );
  `);
  const futureSellerNotice = await first(`
    SELECT * FROM public.notificaciones
    WHERE datos ->> 'facturacion_linea_id' = '50000000-0000-0000-0000-000000000007'
  `);
  assert.equal(futureSellerNotice.datos.vendedor, "VENDEDOR FUTURO");
  await db.query(`SELECT public.confirmar_notificacion_alta_maquina(
    $1,$2,'CLAAS','COSECHADORAS','LEXION 880','CASE-5',NULL,NULL,NULL,$3,NULL,NULL,'VENTA'
  )`, [futureSellerNotice.id, "10000000-0000-0000-0000-000000000002", "VENDEDOR FUTURO"]);
  assert.equal((await first(`
    SELECT vendedor FROM public.parque_maquinas
    WHERE id='20000000-0000-0000-0000-000000000005'
  `)).vendedor, "VENDEDOR FUTURO");

  await db.exec(`
    INSERT INTO public.facturacion_lineas_importadas(
      id,factura,entidad_nombre,cliente_id,fecha_factura,grupo_normalizado,
      marca_normalizada,mercaderia,cod_mercaderia,cantidad,total_venta,raw_data
    ) VALUES (
      '50000000-0000-0000-0000-000000000006','F-SAME-LATER','CLIENTE A',
      '10000000-0000-0000-0000-000000000003','2026-09-23','MAQUINARIAS',
      'CLAAS','LEXION 780','VEIC_3',1,135,
      '{"canonical_document_kind":"Factura","CHASIS":"CASE-3","MODELO":"LEXION 780"}'
    );
    SELECT public.generar_notificacion_venta_maquina(
      '50000000-0000-0000-0000-000000000006'
    );
  `);
  assert.equal(Number((await first(`
    SELECT count(*) AS n FROM public.notificaciones
    WHERE estado = 'pendiente' AND datos ->> 'facturacion_linea_id' = '50000000-0000-0000-0000-000000000006'
  `)).n), 0);

  await db.query(`SELECT public.confirmar_notificacion_alta_maquina(
    $1,$2,'CLAAS','COSECHADORAS','LEXION 750','CASE-1',NULL,NULL,NULL,NULL,NULL,NULL,'REFACTURACION'
  )`, [refactNotification.id, "10000000-0000-0000-0000-000000000001"]);
  assert.equal(Number((await first("SELECT count(*) AS n FROM public.parque_maquinas WHERE public.normalizar_chasis_notificacion(serie)='CASE1'")).n), 1);
  assert.equal((await first("SELECT tipo_evento FROM public.parque_historial_propiedad WHERE maquina_id='20000000-0000-0000-0000-000000000001' ORDER BY registrado_en DESC LIMIT 1")).tipo_evento, "REFACTURACION");

  const reentryNotification = await first(`
    SELECT * FROM public.notificaciones
    WHERE datos ->> 'facturacion_linea_id' = '50000000-0000-0000-0000-000000000003'
  `);
  assert.equal(reentryNotification.tipo, "venta_maquina_reingreso");
  assert.equal(reentryNotification.datos.revision_sugerida, "REINGRESO");

  await db.query(`SELECT public.confirmar_notificacion_alta_maquina(
    $1,$2,'CLAAS','COSECHADORAS','LEXION 770','CASE-2',NULL,NULL,NULL,NULL,NULL,NULL,'VENTA'
  )`, [reentryNotification.id, "10000000-0000-0000-0000-000000000002"]);
  const machine = await first("SELECT * FROM public.parque_maquinas WHERE id='20000000-0000-0000-0000-000000000002'");
  assert.equal(machine.activo, true);
  assert.equal(machine.cliente_id, "10000000-0000-0000-0000-000000000002");
  assert.equal((await first("SELECT tipo_evento FROM public.parque_historial_propiedad WHERE maquina_id=$1 ORDER BY registrado_en DESC LIMIT 1", [machine.id])).tipo_evento, "REINGRESO");

  const stock = await first("SELECT * FROM public.parque_stock_maquinas WHERE chasis='CASE-2'");
  assert.equal(stock.datos_fuente.salida_pendiente_por_factura, true);
  const stockNotice = await first("SELECT * FROM public.notificaciones WHERE id='40000000-0000-0000-0000-000000000002'");
  assert.equal(stockNotice.datos.movimiento_compensado, true);
  assert.equal(stockNotice.datos.resolucion, "factura_posterior_confirmada");

  await assert.rejects(
    () => db.exec("UPDATE public.parque_stock_maquinas SET unidad_operacion_id=gen_random_uuid() WHERE chasis='CASE-2'"),
    /chasis sigue activo en Parque/,
  );

  console.log("PASS: NC/new invoice review, canonical customer suppression, future invoice seller, true transfer, same chassis reuse, reentry and Stock guards");
} finally {
  await db.close();
}
