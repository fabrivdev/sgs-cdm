// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
const db = new PGlite();
beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '11111111-1111-4111-8111-111111111111'::uuid $$;
    CREATE FUNCTION has_module_access(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION has_section_access(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE TABLE v_repuestos_semaforo_historico(codigo_interno text,descripcion text,codigo_fabricante text,codigo_anterior_ejemplo text,marca text,familia text,color text,dias_ultima_venta numeric);
    CREATE TABLE v_repuestos_ultima_compra(producto_codigo text,ultima_compra date,fuente_compra text);
    CREATE TABLE v_repuestos_analisis_ubicaciones(producto_codigo text,sucursal text,deposito text,stock numeric,saldo_kardex numeric,valor_kardex_usd numeric,kardex_cargado_en timestamptz,kardex_archivo text);
    INSERT INTO v_repuestos_semaforo_historico VALUES ('REP1','Pieza',null,null,'CLAAS','Filtros','GRIS',null);
    INSERT INTO v_repuestos_ultima_compra VALUES ('REP1',current_date-500,'test');
    INSERT INTO v_repuestos_analisis_ubicaciones VALUES
      ('REP1','Santa Rita','1',2,2,100,now(),'test'),
      ('REP1','Santa Rita','2',0,0,50,now(),'test'),
      ('REP1','Santa Rita','3',-1,-1,25,now(),'test'),
      ('REP1','Santa Rita','4',3,null,null,now(),'test'),
      ('REP1','Santa Rita','5',1,1,-20,now(),'test');
  `);
  await db.exec(readFileSync('supabase/migrations/20261020120000_parts_panorama_valuation_scope.sql','utf8'));
});
afterAll(() => db.close());
async function report(filters: object) {
  const result = await db.query<{r: {lineas:number;unidades_stock:number;valor_kardex_usd:number;valor_elegible_usd:number;ubicaciones_sin_valor:number;grupos:{valor_elegible_usd:number}[];rows:{valor_elegible_usd:number}[]}}>('SELECT repuestos_analisis_valorizado($1::jsonb) r',[JSON.stringify(filters)]);
  return result.rows[0].r;
}
describe('Panorama stock population reconciles before product grouping', () => {
  it('preserves codes and units without positive value while excluding nonpositive-stock locations', async () => {
    const r = await report({universo:'STOCK_POSITIVO_PANORAMA',color:'ANTIGUO'});
    expect(r).toMatchObject({lineas:1,unidades_stock:6,valor_kardex_usd:80,valor_elegible_usd:100,ubicaciones_sin_valor:1});
    expect(r.rows[0].valor_elegible_usd).toBe(100);
    expect(r.grupos.reduce((sum,g)=>sum+g.valor_elegible_usd,0)).toBe(100);
  });
  it('keeps standard accounting residuals and negative values unchanged', async () => {
    expect(await report({})).toMatchObject({lineas:1,unidades_stock:5,valor_kardex_usd:155});
  });
  it('combines scope with branch, family and color without losing missing valuation', async () => {
    expect(await report({universo:'STOCK_POSITIVO_PANORAMA',sucursal:'Santa Rita',familia:'Filtros',color:'GRIS'})).toMatchObject({lineas:1,valor_elegible_usd:100});
    expect(await report({universo:'STOCK_POSITIVO_PANORAMA',color:'ROJO'})).toMatchObject({lineas:0});
  });
});
