// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const db = new PGlite();
beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '11111111-1111-4111-8111-111111111111'::uuid $$;
    CREATE FUNCTION public.has_module_access(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE FUNCTION public.has_section_access(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('app.allowed', true) = $2 $$;
    CREATE TABLE public.maquinaria_pedidos_lineas_estado_actual (id text, operacion_id text, np_numero text, unidad_id text, cantidad numeric, estado_operacion text, estado_fuente text);
    CREATE TABLE public.maquinaria_unidades_operacion (id text, estado text);
    CREATE TABLE public.maquinaria_importacion_unidades (unidad_id text, activa boolean, ata date);
    CREATE TABLE public.parque_stock_maquinas (unidad_operacion_id text, saldo_actual numeric);
    INSERT INTO public.maquinaria_pedidos_lineas_estado_actual VALUES
      ('a','op1','NP1','a',1,'ABASTECIMIENTO',null),
      ('b','op1','NP1','b',1,'EN_IMPORTACION',null),
      ('c','op2','NP2','c',1,'DISPONIBLE',null),
      ('d','op3','NP3','d',1,'CERRADA',null);
    INSERT INTO public.maquinaria_unidades_operacion VALUES ('a','PENDIENTE'),('b','PENDIENTE'),('c','PENDIENTE'),('d','PENDIENTE');
    INSERT INTO public.maquinaria_importacion_unidades VALUES ('b',true,null);
    INSERT INTO public.parque_stock_maquinas VALUES ('c',1);
    CREATE TABLE public.ordenes_servicio_importadas (os_numero text, situacion_os text, fecha_abierta_os date, fecha_cierre_os date);
    INSERT INTO public.ordenes_servicio_importadas VALUES
      ('01-1','Cerrada',(date_trunc('month',(now() AT TIME ZONE 'America/Asuncion')::date)-interval '1 month')::date,(date_trunc('month',(now() AT TIME ZONE 'America/Asuncion')::date)-interval '1 month')::date+1),
      ('01-2','Cerrada',(date_trunc('month',(now() AT TIME ZONE 'America/Asuncion')::date)-interval '1 month')::date,(date_trunc('month',(now() AT TIME ZONE 'America/Asuncion')::date)-interval '1 month')::date+3),
      ('01-3','Cerrada',(date_trunc('month',(now() AT TIME ZONE 'America/Asuncion')::date)-interval '2 months')::date,(date_trunc('month',(now() AT TIME ZONE 'America/Asuncion')::date)-interval '2 months')::date+5),
      ('01-4','CERRADA',date '2025-01-01',null),
      ('01-5','Abierta',(now() AT TIME ZONE 'America/Asuncion')::date-10,null);
  `);
  await db.exec(readFileSync('supabase/migrations/20261019160000_campi_operational_outcomes.sql', 'utf8'));
}, 30_000);
afterAll(() => db.close());

describe('Campi operational outcomes SQL', () => {
  it('requires the exact section permission', async () => {
    await db.exec("SELECT set_config('app.allowed','no',false)");
    await expect(db.query('SELECT public.campi_pedidos_abastecimiento_v1()')).rejects.toThrow('Sin acceso');
    await expect(db.query('SELECT public.campi_resolucion_os_v1()')).rejects.toThrow('Sin acceso');
  });
  it('counts exclusive machine linkage and excludes a closed order', async () => {
    await db.exec("SELECT set_config('app.allowed','parque.operaciones',false)");
    const { rows } = await db.query<{ data: Record<string, unknown> }>('SELECT public.campi_pedidos_abastecimiento_v1() AS data');
    expect(rows[0].data).toMatchObject({ unidades: 3, sin_vinculo: 1, importacion_transito: 1, stock: 1, pedidos: 2, estados_desconocidos: 0 });
    await expect(db.query('SELECT public.campi_resolucion_os_v1()')).rejects.toThrow('Sin acceso');
  });
  it('uses operational closure dates and keeps legacy missing dates outside the median', async () => {
    await db.exec("SELECT set_config('app.allowed','servicios.ordenes',false)");
    const { rows } = await db.query<{ data: Record<string, unknown> }>('SELECT public.campi_resolucion_os_v1() AS data');
    expect(rows[0].data).toMatchObject({ cierres_ultimo_mes: 2, mediana_ultimo_mes: 2, cierres_mes_anterior: 1, mediana_mes_anterior: 5, historicas_sin_cierre: 1, abiertas: 1, p90_edad_abiertas: 10 });
  });
});
