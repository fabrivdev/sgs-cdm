import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
CREATE FUNCTION public.has_module_access(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION public.has_section_access(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE TABLE public.maquinaria_pedidos_lineas_estado_actual (
 id uuid, unidad_id uuid, operacion_id uuid, np_numero text, marca text, modelo text,
 estado_disponibilidad text, cantidad numeric, estado_operacion text, estado_fuente text
);
CREATE TABLE public.parque_stock_maquinas (id uuid, unidad_operacion_id uuid, saldo_actual numeric);
CREATE TABLE public.test_facturadas (unidad_id uuid);
CREATE FUNCTION public.maquinaria_unidades_facturadas_confirmadas(uuid[])
 RETURNS TABLE(unidad_id uuid) LANGUAGE sql STABLE AS $$ SELECT f.unidad_id FROM public.test_facturadas f WHERE f.unidad_id = ANY($1) $$;
CREATE TABLE public.ordenes_servicio_importadas (
 os_numero text, marca text, fecha_abierta_os date, situacion_os text
);
INSERT INTO public.maquinaria_pedidos_lineas_estado_actual VALUES
 ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201','NP-1','CLAAS','AXION','RESERVADO',1,'ABASTECIMIENTO','VIGENTE'),
 ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000201','NP-1','CLAAS','AXION','DISPONIBLE',1,'ABASTECIMIENTO','VIGENTE'),
 ('00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000202','NP-2','HORSCH','JOKER','DISPONIBLE',1,'ABASTECIMIENTO','VIGENTE');
INSERT INTO public.parque_stock_maquinas VALUES
 ('00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000101',1),
 ('00000000-0000-0000-0000-000000000302','00000000-0000-0000-0000-000000000102',1),
 ('00000000-0000-0000-0000-000000000303','00000000-0000-0000-0000-000000000103',0);
INSERT INTO public.test_facturadas VALUES ('00000000-0000-0000-0000-000000000102');
INSERT INTO public.ordenes_servicio_importadas VALUES
 ('OS-1','CLAAS',current_date-3,'Abierta'),('OS-2','CLAAS',current_date-40,'ABIERTA'),
 ('OS-3','HORSCH',current_date-100,'Cerrada');
`);
await db.exec(readFileSync(new URL('../supabase/migrations/20261020150000_campi_actionable_machine_orders_and_os.sql', import.meta.url), 'utf8'));
const orders = (await db.query('SELECT public.campi_pedidos_con_stock_v1() AS payload')).rows[0].payload;
assert.equal(orders.pedidos_con_stock, 1);
assert.equal(orders.unidades_con_stock, 1);
assert.equal(orders.unidades_activas, 3);
assert.equal(orders.unidades_facturadas_detectadas, 1);
assert.deepEqual(orders.pedidos.map(p => p.np_numero), ['NP-1']);
const os = (await db.query('SELECT public.campi_os_abiertas_detalle_v1() AS payload')).rows[0].payload;
assert.equal(os.abiertas, 2);
assert.deepEqual(os.marcas.map(m => [m.nombre, m.cantidad]), [['CLAAS', 2]]);
assert.equal(os.edades.reduce((sum, row) => sum + row.cantidad, 0), 2);
assert.equal(os.cortes.length, 1);
await db.exec("INSERT INTO public.ordenes_servicio_importadas VALUES ('OS-4','HORSCH',current_date,'Abierta')");
await db.exec('SELECT public.campi_os_abiertas_capturar_v1()');
const latest = (await db.query('SELECT public.campi_os_abiertas_detalle_v1() AS payload')).rows[0].payload;
assert.equal(latest.abiertas, 3);
assert.equal(latest.cortes.at(-1).abiertas, 3);
await db.close();
process.stdout.write('Panorama operativo SQL: pedidos y cortes OS conciliados.\n');
