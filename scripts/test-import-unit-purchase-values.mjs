// PostgreSQL regression tests against the actual migration, without production writes.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
    CREATE TYPE public.marca AS ENUM ('CLAAS','HORSCH','OTROS');
    CREATE TYPE public.app_role AS ENUM ('admin','superadmin','jefatura','usuario');
    CREATE FUNCTION has_role(uuid,app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT $2::text=coalesce(nullif(current_setting('test.role',true),''),'admin') $$;
    CREATE FUNCTION has_module_access(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION maquinaria_puede_gestionar_flujo() RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('test.role',true),''),'admin') IN ('admin','superadmin','jefatura') $$;
    CREATE FUNCTION normalizar_chasis_notificacion(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT nullif(upper(regexp_replace(coalesce($1,''),'[^a-zA-Z0-9]','','g')),'') $$;
    CREATE TABLE clientes(id uuid PRIMARY KEY,nombre text);
    CREATE TABLE maquinaria_operaciones(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),np_numero text,np_fecha date,cliente_id uuid,cliente_nombre text,comercial text,estado text DEFAULT 'PENDIENTE',actualizado_en timestamptz);
    CREATE TABLE maquinaria_operacion_lineas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),operacion_id uuid,marca marca,marca_nombre text,subgrupo text,modelo text,abastecimiento text);
    CREATE TABLE maquinaria_unidades_operacion(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),linea_id uuid,numero_unidad integer,estado text DEFAULT 'PENDIENTE',chasis text,valor_facturado numeric,moneda text,parque_maquina_id uuid,actualizado_en timestamptz);
    CREATE TABLE maquinaria_importacion_lineas(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cantidad integer DEFAULT 1,
      source_id text,source_row integer,source_sheet text,datos_fuente jsonb,
      llave_interna text,prioridad text,np_numero text,proveedor text,producto text,modelo text,
      marca_importacion marca,marca_nombre text,subgrupo text,estado_fuente text,oc text,po text,
      eta date,ata date,transporte text,invoice_supplier text,factura_proveedor_fecha date,
      tipo_cambio numeric,precio_oc numeric,descuentos numeric,precio_teorico_oc numeric,
      producto_facturado text,diferencia numeric,descuento_especial numeric,flete_seguro numeric,
      proveedor_flete text,origen text,destino text,notas text,costo_final_sin_iva numeric,costo_final numeric,
      chasis text,venta_facturada text,factura_venta text,valor_venta numeric,utilidad numeric,margen_porcentaje numeric,
      operacion_id uuid,linea_id uuid,unidad_id uuid,situacion_vinculo text,
      creado_en timestamptz DEFAULT now(),actualizado_en timestamptz DEFAULT now(),fecha_pedido date
    );
    CREATE TABLE maquinaria_importacion_unidades(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),importacion_linea_id uuid REFERENCES maquinaria_importacion_lineas,
      numero_unidad integer,activa boolean DEFAULT true,chasis text,estado_fuente text,eta date,ata date,
      invoice_supplier text,factura_proveedor_fecha date,factura_proveedor_moneda text,
      costo_final_sin_iva numeric,costo_final numeric,operacion_id uuid,linea_id uuid,unidad_id uuid,
      situacion_vinculo text DEFAULT 'SIN PEDIDO',vinculo_manual boolean DEFAULT false,
      detalle_manual boolean DEFAULT false,eliminada_manualmente boolean DEFAULT false,
      creado_en timestamptz DEFAULT now(),actualizado_en timestamptz DEFAULT now(),
      UNIQUE(importacion_linea_id,numero_unidad)
    );
    CREATE TABLE parque_stock_maquinas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),chasis text,unidad_operacion_id uuid);
    CREATE TABLE maquinaria_stock_trazabilidad(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),chasis_normalizado text,unidad_operacion_id uuid,estado_disponibilidad text,disponibilidad_detalle text,importado_en timestamptz,sucursal text,deposito text,saldo_actual numeric);
    CREATE TABLE parque_maquinas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),serie text,actualizado_en timestamptz);
    CREATE TABLE maquinaria_documentos(id uuid PRIMARY KEY);
    CREATE TABLE maquinaria_facturas_importacion(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),operacion_id uuid,proveedor text,factura_numero text,factura_fecha date,moneda text,valor_total numeric,documento_id uuid,creado_por uuid,actualizado_en timestamptz,UNIQUE(operacion_id,factura_numero));
    CREATE TABLE maquinaria_factura_importacion_unidades(factura_id uuid,importacion_unidad_id uuid UNIQUE,chasis text,costo_unidad numeric,actualizado_en timestamptz,PRIMARY KEY(factura_id,importacion_unidad_id));
    CREATE TABLE maquinaria_importaciones_operativas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),operacion_id uuid UNIQUE,proveedor text,factura_numero text,factura_fecha date,moneda text,valor_facturado numeric,estado text,actualizado_en timestamptz);
    INSERT INTO maquinaria_importacion_lineas(id,marca_importacion,marca_nombre,oc,llave_interna,cantidad,precio_oc,eta)
      VALUES('11111111-1111-1111-1111-111111111111','CLAAS','CLAAS','18-111','CLA111-1',4,100,'2026-12-01');
    INSERT INTO maquinaria_importacion_unidades(importacion_linea_id,numero_unidad,eta,detalle_manual)
      SELECT '11111111-1111-1111-1111-111111111111',n,CASE WHEN n=2 THEN '2026-10-01'::date ELSE '2026-12-01'::date END,n=2 FROM generate_series(1,4)n;
  `);
  const migration = await readFile(new URL("../supabase/migrations/20260917120000_fix_import_unit_keys_and_purchase_values.sql",import.meta.url),"utf8");
  await db.exec(migration);
  const first = async (sql, params=[]) => (await db.query(sql,params)).rows[0];
  const units = async () => (await db.query("SELECT * FROM maquinaria_importacion_unidades WHERE importacion_linea_id='11111111-1111-1111-1111-111111111111' ORDER BY numero_unidad")).rows;
  let u = await units();
  assert.deepEqual(u.map(r=>r.llave_interna),["CLA111-1","CLA111-2","CLA111-3","CLA111-4"]);
  assert.deepEqual(u.map(r=>Number(r.valor_oc)),[100,100,100,100]);
  const patch = (id,data) => db.query("SELECT maquinaria_actualizar_unidad_importacion($1,$2)",[id,JSON.stringify(data)]);
  await patch(u[0].id,{eta:"2026-10-15"});
  await patch(u[2].id,{valor_oc:120,moneda_oc:"EUR"});
  await patch(u[3].id,{chasis:"CH4"});
  assert.equal((await units())[3].eta_manual,false,"Editing chassis must not freeze shipment date");
  await db.exec("UPDATE maquinaria_importacion_lineas SET eta='2026-11-01',valor_oc_general=110 WHERE id='11111111-1111-1111-1111-111111111111'");
  u=await units();
  assert.deepEqual(u.map(r=>r.eta.toISOString().slice(0,10)),["2026-10-15","2026-10-01","2026-11-01","2026-11-01"]);
  assert.deepEqual(u.map(r=>Number(r.valor_oc)),[110,110,120,110]);
  assert.equal(u[2].moneda_oc,"EUR");
  await patch(u[0].id,{usar_eta_general:true});
  await patch(u[2].id,{usar_valor_oc_general:true});
  await db.exec("UPDATE maquinaria_importacion_lineas SET valor_oc_general=100,alcance_valor_oc='TOTAL' WHERE id='11111111-1111-1111-1111-111111111111'");
  assert.equal(Number((await first("SELECT sum(valor_oc) AS total FROM maquinaria_importacion_unidades")).total),100);
  const save = async (id,data) => (await first("SELECT maquinaria_guardar_importacion($1,$2) AS id",[id,JSON.stringify(data)])).id;
  const base = {marca:"CLAAS",marca_nombre:"CLAAS",llave_interna:"",oc:"18-222",producto:"TRACTORES",modelo:"AXION 870",cantidad:3,eta:"2026-12-01",valor_oc_general:100,moneda_oc:"USD",alcance_valor_oc:"TOTAL"};
  const newId=await save(null,base);
  const amounts=(await db.query("SELECT valor_oc FROM maquinaria_importacion_unidades WHERE importacion_linea_id=$1 ORDER BY numero_unidad",[newId])).rows;
  assert.deepEqual(amounts.map(r=>Number(r.valor_oc)),[33.33,33.33,33.34],"Distribution preserves cents");
  const split1=await save(null,{...base,oc:"18-333",cantidad:1,alcance_valor_oc:"UNITARIO"});
  const split2=await save(null,{...base,oc:"18-333",cantidad:1,alcance_valor_oc:"UNITARIO"});
  const splitKeys=(await db.query("SELECT llave_interna FROM maquinaria_importacion_unidades WHERE importacion_linea_id=ANY($1::uuid[]) ORDER BY llave_interna",[[split1,split2]])).rows;
  assert.deepEqual(splitKeys.map(r=>r.llave_interna),["CLA333-1","CLA333-2"],"OC split across source headers must not duplicate keys");
  await db.query("UPDATE maquinaria_importacion_lineas SET eta='2027-01-01' WHERE id=$1",[split2]);
  assert.equal((await first("SELECT llave_interna FROM maquinaria_importacion_unidades WHERE importacion_linea_id=$1",[split2])).llave_interna,"CLA333-2","A date edit does not change the physical key");
  await assert.rejects(()=>patch(u[0].id,{costo_final:999}),/solo se registra/);
  await patch(u[0].id,{invoice_supplier:"F001",factura_proveedor_moneda:"USD",valor_factura_proveedor:30});
  assert.equal((await units())[0].costo_final,null,"Supplier invoice is not stock cost");
  await assert.rejects(()=>patch(u[0].id,{valor_oc:-1}),/inválido/);
  await assert.rejects(()=>patch(u[0].id,{valor_factura_proveedor:"NaN"}),/inválido/);
  await assert.rejects(()=>patch(u[0].id,{unidad_id:"x"}),/no admitidos/);
  await assert.rejects(()=>patch(u[1].id,{llave_interna:"CLA111-1"}),/unique/);
  await patch(u[3].id,{eta:""});
  await db.exec("UPDATE maquinaria_importacion_lineas SET eta='2027-01-01' WHERE id='11111111-1111-1111-1111-111111111111'");
  assert.equal((await units())[3].eta,null,"Explicit blank override stays blank");
  await db.exec("INSERT INTO parque_stock_maquinas(chasis) VALUES('CH4')");
  await patch(u[3].id,{costo_final:155,costo_stock_moneda:"EUR"});
  assert.equal(Number((await units())[3].costo_final),155);
  await patch(u[2].id,{chasis:"CH3"});
  await db.exec(migration);
  assert.equal((await units())[2].eta_manual,false,"Reapplying migration must not freeze a date after a chassis edit");
  await db.exec("SELECT set_config('test.role','usuario',false)");
  await assert.rejects(()=>patch(u[0].id,{valor_oc:1}),/Solo admin/);
  await assert.rejects(()=>db.query("UPDATE maquinaria_importacion_unidades SET valor_factura_proveedor=1 WHERE id=$1",[u[0].id]),/Solo admin/);
  await db.exec("SELECT set_config('test.role','admin',false)");
  const op=await first("INSERT INTO maquinaria_operaciones(np_numero) VALUES('NP0011') RETURNING id");
  const line=await first("INSERT INTO maquinaria_operacion_lineas(operacion_id,marca,modelo,subgrupo,abastecimiento) VALUES($1,'CLAAS','AXION 870','TRACTORES','IMPORTAR') RETURNING id",[op.id]);
  const orderUnit=await first("INSERT INTO maquinaria_unidades_operacion(linea_id,numero_unidad,valor_facturado,moneda) VALUES($1,1,500,'EUR') RETURNING id",[line.id]);
  await db.query("UPDATE maquinaria_importacion_unidades SET operacion_id=$1,linea_id=$2,unidad_id=$3 WHERE id=$4",[op.id,line.id,orderUnit.id,u[0].id]);
  await db.query("SELECT maquinaria_aplicar_factura_importacion($1,'F002','2026-09-17','CLAAS','USD',50,$2)",[op.id,JSON.stringify([{importacion_unidad_id:u[0].id,costo_unidad:50}])]);
  assert.equal(Number((await units())[0].valor_factura_proveedor),50);
  assert.equal((await units())[0].costo_final,null);
  assert.equal(Number((await first("SELECT valor_facturado FROM maquinaria_unidades_operacion WHERE id=$1",[orderUnit.id])).valor_facturado),500);
  await patch(u[0].id,{valor_factura_proveedor:55});
  assert.equal(Number((await first("SELECT costo_unidad FROM maquinaria_factura_importacion_unidades WHERE importacion_unidad_id=$1",[u[0].id])).costo_unidad),55,"Direct edits keep the structured supplier invoice detail consistent");
  assert.equal(Number((await first("SELECT valor_facturado FROM maquinaria_unidades_operacion WHERE id=$1",[orderUnit.id])).valor_facturado),500,"Editing supplier price does not modify the sale amount");
  const lifecycle = await readFile(new URL("../supabase/migrations/20260917130000_import_arrival_lifecycle.sql",import.meta.url),"utf8");
  await db.exec(lifecycle);
  const newHeader=await save(null,{...base,oc:"18-444",cantidad:2,estado_fuente:"RECIBIDA"});
  const newUnits=(await db.query("SELECT * FROM maquinaria_importacion_unidades WHERE importacion_linea_id=$1 ORDER BY numero_unidad",[newHeader])).rows;
  assert.equal(newUnits[0].estado_fuente,"PLANIFICADA","New manual imports always start planned");
  await db.query("SELECT maquinaria_iniciar_transito_importacion($1)",[newUnits[0].id]);
  await db.query("UPDATE maquinaria_importacion_lineas SET eta='2027-02-01' WHERE id=$1",[newHeader]);
  assert.equal((await first("SELECT estado_fuente FROM maquinaria_importacion_unidades WHERE id=$1",[newUnits[0].id])).estado_fuente,"EN_TRANSITO");
  assert.equal((await first("SELECT estado_fuente FROM maquinaria_importacion_unidades WHERE id=$1",[newUnits[1].id])).estado_fuente,"PLANIFICADA","Transition affects only the selected unit");
  await assert.rejects(()=>db.query("SELECT maquinaria_recibir_unidad_importacion($1,current_date)",[newUnits[0].id]),/chasis/);
  await patch(newUnits[0].id,{chasis:"ARR1"});
  await assert.rejects(()=>db.query("SELECT maquinaria_recibir_unidad_importacion($1,current_date+1)",[newUnits[0].id]),/futura/);
  const receipt=await first("SELECT maquinaria_recibir_unidad_importacion($1,current_date) AS result",[newUnits[0].id]);
  assert.equal(receipt.result.stock_confirmado,false,"Arrival without stock remains unconfirmed");
  await assert.rejects(()=>db.query("SELECT maquinaria_iniciar_transito_importacion($1)",[newUnits[0].id]),/arribada/);
  await db.exec("INSERT INTO parque_stock_maquinas(chasis) VALUES('ARR1'); INSERT INTO maquinaria_stock_trazabilidad(chasis_normalizado,estado_disponibilidad) VALUES('ARR1','DISPONIBLE')");
  assert.equal((await first("SELECT costo_stock_habilitado FROM maquinaria_importacion_unidades_operativas WHERE id=$1",[newUnits[0].id])).costo_stock_habilitado,true,"Arrival becomes complete when matching stock appears");
  await db.exec("INSERT INTO parque_stock_maquinas(chasis) VALUES('ARR1')");
  assert.equal((await first("SELECT costo_stock_habilitado FROM maquinaria_importacion_unidades_operativas WHERE id=$1",[newUnits[0].id])).costo_stock_habilitado,false,"Duplicate stock never completes an import");
  await patch(newUnits[1].id,{chasis:"ARR2"});
  await db.exec("INSERT INTO parque_stock_maquinas(chasis) VALUES('ARR2'); INSERT INTO maquinaria_stock_trazabilidad(chasis_normalizado,estado_disponibilidad) VALUES('ARR2','DISPONIBLE')");
  assert.equal((await first("SELECT costo_stock_habilitado FROM maquinaria_importacion_unidades_operativas WHERE id=$1",[newUnits[1].id])).costo_stock_habilitado,false,"Stock before arrival is not completion");
  await assert.rejects(()=>patch(newUnits[1].id,{costo_final:100}),/arribo registrado/);
  await db.query("UPDATE maquinaria_importacion_unidades SET estado_fuente='PLANIFICADA' WHERE id=$1",[u[0].id]);
  await db.query("SELECT maquinaria_aplicar_factura_importacion($1,'F003',current_date,'CLAAS','USD',60,$2)",[op.id,JSON.stringify([{importacion_unidad_id:u[0].id,costo_unidad:60}])]);
  assert.equal((await units())[0].estado_fuente,"PLANIFICADA","Supplier invoice does not start transit");
  await db.exec(lifecycle);
  await db.exec("SELECT set_config('test.role','usuario',false)");
  await assert.rejects(()=>db.query("SELECT maquinaria_iniciar_transito_importacion($1)",[newUnits[1].id]),/Solo admin/);
  console.log("PASS: actual SQL, unit keys, overrides, rounding, cost gating, permissions, idempotency, supplier invoice separation and arrival lifecycle");
} finally { await db.close(); }
