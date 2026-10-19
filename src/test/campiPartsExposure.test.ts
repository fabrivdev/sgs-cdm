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
    CREATE FUNCTION public.has_section_access(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('app.allowed', true) = 'yes' $$;
    CREATE TABLE public.v_repuestos_semaforo_historico (codigo_interno text, color text, familia text, fecha_analisis date);
    CREATE TABLE public.v_repuestos_ultima_compra (producto_codigo text, ultima_compra date);
    CREATE TABLE public.v_repuestos_analisis_ubicaciones (producto_codigo text, sucursal text, stock numeric, saldo_kardex numeric, valor_kardex_usd numeric, kardex_cargado_en timestamptz);
    INSERT INTO public.v_repuestos_semaforo_historico VALUES
      ('L','LILA','Filtros',current_date),('G','GRIS','Filtros',current_date),
      ('R','ROJO','Correas',current_date),('V','VERDE_CLARO','Correas',current_date);
    INSERT INTO public.v_repuestos_ultima_compra VALUES ('L',current_date-350),('G',current_date-990),('R',current_date-1200),('V',current_date-10);
    INSERT INTO public.v_repuestos_analisis_ubicaciones VALUES
      ('L','Santa Rita',2,2,100,now()),('G','Santa Rita',3,3,200,now()),
      ('R','Katuete',1,1,300,now()),('V','Katuete',5,5,400,now()),
      ('R','Katuete',0,0,20,now()),('V','Santa Rita',1,null,null,null);
  `);
  await db.exec(readFileSync('supabase/migrations/20261019150000_campi_parts_exposure.sql', 'utf8'));
}, 30_000);
afterAll(() => db.close());

describe('Campi exposure SQL', () => {
  it('requires the analysis section permission', async () => {
    await db.exec("SELECT set_config('app.allowed','no',false)");
    await expect(db.query('SELECT public.campi_repuestos_exposicion_v1()')).rejects.toThrow('Sin acceso');
  });
  it('separates positive stock, residuals, risk and approaching color thresholds', async () => {
    await db.exec("SELECT set_config('app.allowed','yes',false)");
    const result = await db.query<{ data: Record<string, unknown> }>('SELECT public.campi_repuestos_exposicion_v1() AS data');
    const data = result.rows[0].data;
    expect(data.valor_total_usd).toBe(1000);
    expect(data.valor_antiguo_usd).toBe(500);
    expect(data.valor_residual_sin_stock_usd).toBe(20);
    expect(data.ubicaciones_sin_valor).toBe(1);
    expect(data.codigos_antiguos).toBe(2);
    expect(data.avisos).toEqual(expect.arrayContaining([
      expect.objectContaining({ destino: 'GRIS', codigos: 1, valor_usd: 100 }),
      expect.objectContaining({ destino: 'ROJO', codigos: 1, valor_usd: 200 }),
    ]));
    expect(data.sucursales).toEqual(expect.arrayContaining([expect.objectContaining({ nombre: 'Santa Rita', valor_antiguo_usd: 200 })]));
  });
});
