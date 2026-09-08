// Isolated PostgreSQL smoke tests. Usage: node scripts/test-machine-catalog.mjs <path-to-pglite/dist/index.js>
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
    CREATE TYPE public.app_role AS ENUM('admin','superadmin','jefatura');
    CREATE TYPE public.marca AS ENUM('HORSCH','CLAAS','OTROS');
    CREATE TYPE public.subgrupo_maquina AS ENUM('COSECHADORAS','SEMBRADORAS','PICADORAS','PLATAFORMAS/CABEZALES','PULVERIZADORAS','TRACTORES','SUELO','OTRO');
    CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT $2::text=coalesce(nullif(current_setting('test.role',true),''),'admin') $$;
    CREATE FUNCTION public.maquinaria_normalizar_marca(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT nullif(regexp_replace(upper(btrim($1)), '\\s+', ' ', 'g'),'') $$;
    CREATE FUNCTION public.parque_modelo_clave(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT regexp_replace(upper(coalesce($1,'')),'[^A-Z0-9]+','','g') $$;
    CREATE TABLE public.maquinaria_marcas_catalogo(nombre text PRIMARY KEY,activa boolean DEFAULT true,creado_por uuid,actualizado_en timestamptz DEFAULT now());
    CREATE TABLE public.parque_modelos_catalogo(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),marca public.marca,marca_nombre text,subgrupo public.subgrupo_maquina,nombre text,clave_normalizada text,activo boolean DEFAULT true,actualizado_en timestamptz DEFAULT now(),UNIQUE(marca_nombre,subgrupo,clave_normalizada));
    CREATE TABLE public.maquinaria_operaciones(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),np_numero text,np_fecha date,cliente_nombre text,comercial text,observaciones text);
    CREATE TABLE public.maquinaria_operacion_lineas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),marca public.marca,marca_nombre text,subgrupo public.subgrupo_maquina,modelo text,producto text,datos_extraidos jsonb DEFAULT '{}');
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/20260907170000_validate_np_and_manage_machine_catalog.sql", import.meta.url), "utf8"));
  const first = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  const reject = async (sql, pattern) => assert.rejects(() => db.exec(sql), pattern);
  assert.equal((await first("SELECT public.maquinaria_np_canonica('0000002') AS n")).n, "NP0002");
  assert.equal((await first("SELECT public.maquinaria_np_canonica('12345') AS n")).n, null);
  const order = await first("INSERT INTO public.maquinaria_operaciones(np_numero,cliente_nombre,comercial,observaciones) VALUES('0000002','José Pérez','Carlos','Entrega septiembre') RETURNING *");
  assert.equal(order.np_numero, "NP0002"); assert.equal(order.cliente_nombre, "JOSÉ PÉREZ"); assert.equal(order.observaciones, "ENTREGA SEPTIEMBRE");
  await reject("INSERT INTO public.maquinaria_operaciones(np_numero) VALUES('np2')", /Ya existe/);
  await reject("INSERT INTO public.maquinaria_operaciones(np_numero) VALUES('12345')", /cuatro números/);
  const line = await first(`INSERT INTO public.maquinaria_operacion_lineas(marca,subgrupo,modelo,producto,datos_extraidos)
    VALUES('HORSCH','PULVERIZADORAS','leeb 5.280','pulverizadora','{"marca_real":"HORSCH"}') RETURNING *`);
  assert.equal(line.modelo, "LEEB 5.280"); assert.equal(line.producto, "PULVERIZADORA");
  const model = await first("SELECT * FROM public.parque_modelos_catalogo WHERE nombre='LEEB 5.280'");
  await db.query("SELECT public.maquinaria_gestionar_catalogo('modelo',$1,'eliminar')", [model.id]);
  await db.query("UPDATE public.maquinaria_operacion_lineas SET producto='pulverizadora histórica' WHERE id=$1", [line.id]);
  assert.equal((await first("SELECT activo FROM public.parque_modelos_catalogo WHERE id=$1", [model.id])).activo, false);
  await reject(`INSERT INTO public.maquinaria_operacion_lineas(marca,subgrupo,modelo,datos_extraidos) VALUES('HORSCH','PULVERIZADORAS','LEEB 5.280','{"marca_real":"HORSCH"}')`, /eliminado del listado/);
  await db.query("SELECT public.maquinaria_gestionar_catalogo('modelo',$1,'restaurar')", [model.id]);
  assert.equal((await first("SELECT activo FROM public.parque_modelos_catalogo WHERE id=$1", [model.id])).activo, true);
  await db.query("SELECT public.maquinaria_gestionar_catalogo('modelo',$1,'editar','LEEB 6.280','PULVERIZADORAS')", [model.id]);
  assert.equal((await first("SELECT activo FROM public.parque_modelos_catalogo WHERE id=$1", [model.id])).activo, false);
  assert.equal((await first("SELECT modelo FROM public.maquinaria_operacion_lineas WHERE id=$1", [line.id])).modelo, "LEEB 5.280");
  await db.exec("SELECT public.maquinaria_gestionar_catalogo('marca','HORSCH','eliminar'); SELECT public.maquinaria_registrar_marca_catalogo('HORSCH');");
  assert.equal((await first("SELECT activa FROM public.maquinaria_marcas_catalogo WHERE nombre='HORSCH'")).activa, false);
  await db.exec("SELECT public.maquinaria_gestionar_catalogo('marca','HORSCH','restaurar'); SELECT public.maquinaria_gestionar_catalogo('marca','HORSCH','editar','MARCA CORREGIDA');");
  assert.equal((await first("SELECT activa FROM public.maquinaria_marcas_catalogo WHERE nombre='MARCA CORREGIDA'")).activa, true);
  assert.equal((await first("SELECT activo FROM public.parque_modelos_catalogo WHERE marca_nombre='MARCA CORREGIDA' AND nombre='LEEB 6.280'")).activo, true);
  assert.equal((await first("SELECT marca_nombre FROM public.maquinaria_operacion_lineas WHERE id=$1", [line.id])).marca_nombre, "HORSCH");
  await db.exec("SELECT set_config('test.role','jefatura',false)");
  await reject("SELECT public.maquinaria_gestionar_catalogo('marca','MARCA CORREGIDA','eliminar')", /Solo administración/);
  await db.exec(`
    SELECT set_config('test.role','admin',false);
    SELECT public.maquinaria_gestionar_catalogo('marca','HORSCH','restaurar');
    CREATE TABLE public.parque_maquinas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),marca public.marca,marca_nombre text,subgrupo public.subgrupo_maquina,modelo_tipo text);
    CREATE TABLE public.maquinaria_importacion_lineas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),marca_importacion public.marca,marca_nombre text,proveedor text,linea_id uuid,producto text,subgrupo public.subgrupo_maquina,modelo text);
    CREATE TABLE public.parque_modelos_alias(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),marca public.marca,subgrupo public.subgrupo_maquina,alias text,clave_alias text,modelo_catalogo_id uuid REFERENCES public.parque_modelos_catalogo(id));
    CREATE TRIGGER trg_sincronizar_modelo_maquina_catalogo BEFORE INSERT OR UPDATE OF marca,marca_nombre,subgrupo,modelo_tipo ON public.parque_maquinas FOR EACH ROW EXECUTE FUNCTION public.sincronizar_modelo_maquina_catalogo();
    SELECT public.maquinaria_registrar_modelo_catalogo('HORSCH','SEMBRADORAS','MAESTRO CF 18.50');
    SELECT public.maquinaria_registrar_modelo_catalogo('HORSCH','SEMBRADORAS','MAESTRO 18 CF E50');
    INSERT INTO public.parque_modelos_alias(marca,subgrupo,alias,clave_alias,modelo_catalogo_id)
      SELECT 'HORSCH','SEMBRADORAS','MAESTRO 18 CF E50','MAESTRO18CFE50',id FROM public.parque_modelos_catalogo WHERE nombre='MAESTRO CF 18.50';
    INSERT INTO public.parque_modelos_alias(marca,subgrupo,alias,clave_alias,modelo_catalogo_id)
      SELECT 'HORSCH','PULVERIZADORAS','LEEB 5250','LEEB5250',id FROM public.parque_modelos_catalogo WHERE nombre='LEEB 6.280';
  `);
  // Insert Parque fixture before its sync trigger to exercise reconciliation of missing catalog entries.
  await db.exec(`
    ALTER TABLE public.parque_maquinas DISABLE TRIGGER trg_sincronizar_modelo_maquina_catalogo;
    INSERT INTO public.parque_maquinas(marca,marca_nombre,subgrupo,modelo_tipo) VALUES
      ('HORSCH','HORSCH','PULVERIZADORAS','LEEB 6.280 VL'),
      ('CLAAS','CLAAS','COSECHADORAS','TRION 720'),
      ('HORSCH','HORSCH','SEMBRADORAS','MAESTRO 18 CF E50'),
      ('HORSCH','HORSCH','PULVERIZADORAS','LEEB 5.280');
    ALTER TABLE public.parque_maquinas ENABLE TRIGGER trg_sincronizar_modelo_maquina_catalogo;
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/20260908120000_shared_machine_model_identity.sql", import.meta.url), "utf8"));
  const leeb = await first("SELECT * FROM public.parque_modelos_catalogo WHERE nombre='LEEB 6.280 VL' AND marca_nombre='HORSCH'");
  assert.ok(leeb?.id, "Missing Parque model was imported into shared catalog");
  assert.equal((await first("SELECT activo FROM public.parque_modelos_catalogo WHERE nombre='LEEB 5.280' AND marca_nombre='HORSCH'")).activo, false, "Retired model stays retired");
  assert.equal((await first("SELECT activo FROM public.parque_modelos_catalogo WHERE nombre='MAESTRO 18 CF E50'")).activo, false);
  const historical = await first("SELECT * FROM public.parque_maquinas WHERE modelo_tipo='MAESTRO 18 CF E50'");
  assert.ok(historical.modelo_catalogo_id, "History gains a link without rewriting its text");
  const npLeeb = await first(`INSERT INTO public.maquinaria_operacion_lineas(marca,marca_nombre,subgrupo,modelo,datos_extraidos)
    VALUES('HORSCH','HORSCH','OTRO','leeb 6 280 vl','{"marca_real":"HORSCH"}') RETURNING *`);
  assert.equal(npLeeb.modelo_catalogo_id,leeb.id); assert.equal(npLeeb.subgrupo,'PULVERIZADORAS'); assert.equal(npLeeb.modelo,'LEEB 6.280 VL');
  const imported = await first("INSERT INTO public.maquinaria_importacion_lineas(marca_importacion,proveedor,subgrupo,modelo) VALUES('HORSCH','HORSCH','OTRO','LEEB 6.280 VL') RETURNING *");
  assert.equal(imported.modelo_catalogo_id,leeb.id); assert.equal(imported.subgrupo,'PULVERIZADORAS');
  const aliasOrder = await first(`INSERT INTO public.maquinaria_operacion_lineas(marca,marca_nombre,subgrupo,modelo) VALUES('HORSCH','HORSCH','OTRO','MAESTRO 18 CF E50') RETURNING *`);
  assert.equal(aliasOrder.modelo,'MAESTRO CF 18.50'); assert.equal(aliasOrder.subgrupo,'SEMBRADORAS');
  assert.equal((await first("SELECT public.maquinaria_resolver_modelo_catalogo('HORSCH','OTRO','LEEB 5250') AS id")).id,null);
  assert.equal((await first("SELECT public.maquinaria_resolver_modelo_catalogo('CLAAS','OTRO','LEEB 6.280 VL') AS id")).id,null);
  const otherBrand = await first(`INSERT INTO public.maquinaria_operacion_lineas(marca,subgrupo,modelo,datos_extraidos)
    VALUES('OTROS','PULVERIZADORAS','STAR 2500','{"marca_real":"JACTO"}') RETURNING *`);
  assert.equal(otherBrand.marca_nombre,'JACTO'); assert.ok(otherBrand.modelo_catalogo_id);
  await db.query("SELECT public.maquinaria_gestionar_catalogo('modelo',$1,'eliminar')",[leeb.id]);
  await reject(`INSERT INTO public.maquinaria_importacion_lineas(marca_importacion,proveedor,subgrupo,modelo) VALUES('HORSCH','HORSCH','OTRO','LEEB 6.280 VL')`,/eliminado/);
  await db.query("UPDATE public.maquinaria_operacion_lineas SET modelo=modelo WHERE id=$1",[npLeeb.id]);
  assert.equal((await first("SELECT modelo_catalogo_id FROM public.maquinaria_operacion_lineas WHERE id=$1",[npLeeb.id])).modelo_catalogo_id,leeb.id);
  assert.equal((await first("SELECT activo FROM public.parque_modelos_catalogo WHERE id=$1",[leeb.id])).activo,false);
  console.log("Shared identity checks passed: Parque reconciliation, aliases, type correction, order/import links, other brands, numeric variants and retired history.");
  console.log("PostgreSQL checks passed: NP normalization, duplicates, uppercase, registration, edit, remove, restore, historical preservation and permissions.");
} finally { await db.close(); }
