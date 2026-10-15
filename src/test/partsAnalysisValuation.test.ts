// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SemaforoResultado } from "@/hooks/useSemaforoHistorico";
const db = new PGlite();
beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '11111111-1111-4111-8111-111111111111'::uuid $$;
    CREATE FUNCTION public.has_module_access(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE TABLE public.v_repuestos_stock_matriz (codigo_interno text PRIMARY KEY,codigo_fabricante text,descripcion text,marca text,familia text,santa_rita numeric,santa_rosa numeric,campo_9 numeric,misiones numeric,loma_plata numeric,katuete numeric,total numeric);
    CREATE TABLE repuestos_stock (producto_codigo text,sucursal text,deposito text,saldo_actual numeric);
    CREATE TABLE repuestos_ventas_vinculacion (producto_codigo text,fecha_efectiva date,cantidad numeric,estado_vinculo text);
    CREATE TABLE repuestos_maestro_legacy_cargas (id integer PRIMARY KEY,activo boolean,estado text);
    CREATE TABLE repuestos_maestro_legacy (carga_id integer,producto_codigo text,codigo_legacy text,estado_vinculo text,codigo_legacy_norm text);
    CREATE TABLE totvs_facturas_compra_lineas (producto_codigo text,fecha_emision date,especie text,cantidad numeric,total_usd numeric);
    CREATE TABLE totvs_kardex_sintetico (producto_codigo text,sucursal text,deposito text,saldo numeric,valor_2 numeric,actualizado_en timestamptz,archivo_origen text);
    INSERT INTO v_repuestos_stock_matriz VALUES ('REP1','FAB1','Filtro','CLAAS','Filtros',2,0,0,0,0,3,5),('REP2',null,'Correa','GATES',null,4,0,0,0,0,0,4),('REP3',null,'Pieza','CLAAS','Filtros',1,0,0,0,0,0,1);
    INSERT INTO repuestos_stock VALUES ('REP1','Santa Rita','01 - DEPOSITO GENERAL',2),('REP1','Katuete','01 - DEPOSITO GENERAL',3),('REP2','Santa Rita','01 - DEPOSITO GENERAL',4),('REP3','Santa Rita','52 - GARANTIA',1);
    INSERT INTO totvs_kardex_sintetico VALUES ('REP1','01','01',1,40,now(),'k.xml'),('REP1','01','01',1,60,now(),'k.xml'),('REP1','02','01',3,300,now(),'k.xml'),('REP1','01','52',0,-10,now(),'k.xml'),('REP3','99','MU',0,20,now(),'k.xml');
    INSERT INTO repuestos_ventas_vinculacion VALUES ('REP1',current_date-5,10,'CONFIRMADA'),('REP2',current_date-800,1,'CONFIRMADA');
  `);
  await db.exec(readFileSync('supabase/migrations/20261014190000_parts_historical_semaphore.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261014210000_parts_analysis_valuation.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261014220000_parts_purchase_age.sql','utf8'));
  await db.exec(`
    INSERT INTO repuestos_maestro_legacy_cargas VALUES (1,true,'COMPLETADO'),(2,false,'COMPLETADO');
    INSERT INTO repuestos_maestro_legacy VALUES (1,'REP1','8','CONFIRMADA','8'),(1,'REP2','9','PENDIENTE','9'),(2,'REP3','10','CONFIRMADA','10');
    INSERT INTO repuestos_compras_historicas VALUES (repeat('a',64),'test.xls','8',current_date-800,2,now()),(repeat('a',64),'test.xls','9',current_date-2,3,now()),(repeat('a',64),'test.xls','10',current_date-2,4,now());
    INSERT INTO totvs_facturas_compra_lineas VALUES ('REP1',current_date-365,'NF',1,100),('REP1',current_date-1,'NCC',1,100),('REP1',current_date+1,'NF',1,100),('REP1',current_date-2,'NF',-1,100);
  `);
});
afterAll(() => db.close());
async function report(filters = {}, group = 'marca', limit = 50, offset = 0) {
  return (await db.query<{report: SemaforoResultado}>(`SELECT repuestos_analisis_valorizado($1::jsonb,$2,$3,$4) report`,[JSON.stringify(filters),group,limit,offset])).rows[0].report;
}
describe('valorización por ubicación', () => {
  it('conserva cada valor una vez, incluidos residuales y sucursal desconocida', async () => {
    const r = await report();
    expect(r.valor_kardex_usd).toBe(410);
    expect(r.unidades_stock).toBe(10);
    expect(r.sucursales.find(s => s.nombre==='Katuete')?.valor_kardex_usd).toBe(300);
    expect(r.sucursales.find(s => s.nombre==='Santa Rita')?.valor_kardex_usd).toBe(90);
    expect(r.sucursales.find(s => s.nombre==='99')?.valor_kardex_usd).toBe(20);
    expect(r.sucursales.reduce((sum,s)=>sum+(s.valor_kardex_usd??0),0)).toBe(410);
    expect(r.rows.find(row=>row.codigo_interno==='REP1')?.stock_total).toBe(5);
    expect(r.rows.find(row=>row.codigo_interno==='REP1')?.unidades_365d).toBe(10);
  });
  it('filtra valor y stock local sin devolver valor global del artículo', async () => {
    const r = await report({sucursal:'Santa Rita',deposito:'01'});
    expect(r.valor_kardex_usd).toBe(100);
    expect(r.unidades_stock).toBe(6);
    expect(r.rows.find(row=>row.codigo_interno==='REP1')?.valor_kardex_usd).toBe(100);
    expect(r.rows.find(row=>row.codigo_interno==='REP1')?.katuete).toBe(0);
  });
  it('no convierte ausencias en cero ni oculta cobertura parcial', async () => {
    const r = await report();
    expect(r.rows.find(row=>row.codigo_interno==='REP2')?.valor_kardex_usd).toBeNull();
    expect(r.ubicaciones_sin_valor).toBe(2);
    expect((await report({valorizacion:'INCOMPLETA'})).lineas).toBe(2);
    expect((await report({busqueda:'REP2'})).valor_kardex_usd).toBeNull();
  });
  it('reconcilia agrupaciones, colores y tres franjas antes de paginar', async () => {
    for (const key of ['marca','familia','sucursal','deposito']) {
      const r = await report({},key,1);
      expect(r.rows).toHaveLength(1);
      expect(r.grupos.reduce((sum,g)=>sum+(g.valor_kardex_usd??0),0)).toBe(410);
      expect(r.por_color.reduce((sum,c)=>sum+(c.valor_kardex_usd??0),0)).toBe(410);
      expect(r.franjas.reduce((sum,c)=>sum+(c.valor_kardex_usd??0),0)).toBe(410);
      expect(r.rotacion.valor).toBeNull();
    }
  });
  it('combina filtros y conserva señal negativa', async () => {
    expect((await report({familia:'Filtros',color:'VERDE_OSCURO',usd_min:'350',dias_max:'365'})).valor_kardex_usd).toBe(390);
    const r = await report({deposito:'52',usd_max:'0'});
    expect(r.valor_kardex_usd).toBe(-10);
    expect(r.rows[0].saldo_kardex).toBe(0);
  });
  it('usa la compra más reciente y excluye NC, cantidades negativas, futuras y vínculos no confirmados', async () => {
    const r=await report();
    expect(r.base_antiguedad).toBe('ULTIMA_COMPRA_V1');
    const a=r.rows.find(x=>x.codigo_interno==='REP1')!;
    expect(a.dias_ultima_compra).toBe(365);
    expect(a.fuente_compra).toBe('Factura de compra TOTVS');
    expect(r.rows.find(x=>x.codigo_interno==='REP2')?.ultima_compra).toBeNull();
    expect(r.rows.find(x=>x.codigo_interno==='REP3')?.ultima_compra).toBeNull();
    expect((await report({franja:'HASTA_365'})).lineas).toBe(1);
    expect((await report({franja:'SIN_FECHA'})).lineas).toBe(2);
    expect((await report({compra_dias_min:'366'})).lineas).toBe(0);
  });
  it('separa 365/366/730/731 días y conserva venta reciente independiente de compra antigua', async () => {
    for (const [days,band] of [[366,'DE_366_A_730'],[730,'DE_366_A_730'],[731,'MAS_730']] as const) {
      await db.exec(`UPDATE totvs_facturas_compra_lineas SET fecha_emision=current_date-${days} WHERE especie='NF' AND cantidad=1 AND fecha_emision<=current_date`);
      const r=await report({franja:band});
      expect(r.lineas).toBe(1);
      expect(r.rows[0].color).toBe('VERDE_OSCURO');
    }
  });
  it('ordena el conjunto antes de paginar y mantiene ausencias al final', async () => {
    expect((await report({orden:'codigo',direccion:'desc'},'marca',1)).rows[0].codigo_interno).toBe('REP3');
    expect((await report({orden:'usd',direccion:'asc'},'marca',1)).rows[0].codigo_interno).toBe('REP3');
    expect((await report({orden:'usd',direccion:'desc'},'marca',1,2)).rows[0].codigo_interno).toBe('REP2');
  });
  it('fingerprint cambia con valores aunque cantidad de filas no cambie', async () => {
    const before = await report();
    await db.exec("UPDATE totvs_kardex_sintetico SET valor_2=valor_2+1 WHERE producto_codigo='REP1' AND sucursal='02'");
    const after = await report();
    expect(after.lineas).toBe(before.lineas);
    expect(after.version).not.toBe(before.version);
  });
  it('rechaza llamadas sin permiso y agrupaciones no admitidas', async () => {
    await expect(report({},'incorrecta')).rejects.toThrow('Agrupación');
    await db.exec('CREATE OR REPLACE FUNCTION public.has_module_access(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$');
    await expect(report()).rejects.toThrow('Sin acceso');
  });
});


describe('permiso independiente de Análisis', () => {
  it('deniega Stock solo, permite Análisis y respeta la revocación', async () => {
    await db.exec(`CREATE OR REPLACE FUNCTION public.has_module_access(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
      CREATE TABLE app_secciones(id text PRIMARY KEY,modulo_id text,nombre text,orden integer,activo boolean);
      CREATE FUNCTION public.has_section_access(uuid,text) RETURNS boolean LANGUAGE sql AS $$
      SELECT coalesce(current_setting('test.analysis_access',true),'false')='true' $$;`);
    const migration=readFileSync('supabase/migrations/20261015150000_parts_analysis_section_access.sql','utf8');
    await db.exec(migration);
    await expect(report()).rejects.toThrow(/Sin acceso/);
    await expect(db.query('SELECT repuestos_semaforo_historico_paginado()')).rejects.toThrow(/Sin acceso/);
    await db.exec("SET test.analysis_access='true'");
    expect((await report()).lineas).toBe(3);
    await db.exec("SET test.analysis_access='false'");
    await db.exec(migration);
    await expect(report()).rejects.toThrow(/Sin acceso/);
    expect((await db.query("SELECT nombre FROM app_secciones WHERE id='repuestos.analisis'")).rows).toEqual([{nombre:'Análisis'}]);
  });
});


describe('antigüedad ponderada por sucursal', () => {
  it('pondera USD de cada ubicación, excluye ausencias/no positivos y respeta filtros y permisos', async () => {
    await db.exec("SET test.analysis_access='true'");
    const migration = readFileSync('supabase/migrations/20261015190000_parts_branch_purchase_age.sql','utf8');
    await db.exec(migration);
    await db.exec(migration);
    await db.exec("UPDATE totvs_facturas_compra_lineas SET fecha_emision=current_date-365 WHERE producto_codigo='REP1' AND especie='NF' AND cantidad>0 AND fecha_emision<=current_date");
    const original = await report();
    expect(original.sucursales.find(b=>b.nombre==='Santa Rita')?.dias_compra_promedio).toBe(365);
    expect(original.sucursales.find(b=>b.nombre==='99')?.dias_compra_promedio).toBeNull();
    await db.exec('BEGIN');
    try {
      await db.exec(`INSERT INTO totvs_facturas_compra_lineas VALUES ('REP2',current_date-1000,'NF',1,300);
        INSERT INTO totvs_kardex_sintetico VALUES ('REP2','01','01',4,300,now(),'k.xml');`);
      const all = await report();
      const branch = all.sucursales.find(b=>b.nombre==='Santa Rita')!;
      expect(branch.dias_compra_promedio).toBe(841.25);
      expect(branch.valor_compra_con_fecha_usd).toBe(400);
      expect(branch.valor_positivo_usd).toBe(400);
      expect(all.sucursales.find(b=>b.nombre==='Katuete')?.dias_compra_promedio).toBe(365);
      expect((await report({marca:'GATES'})).sucursales.find(b=>b.nombre==='Santa Rita')?.dias_compra_promedio).toBe(1000);
      expect((await report({deposito:'52'})).sucursales.every(b=>b.dias_compra_promedio===null)).toBe(true);
      expect((await report({},'marca',1)).sucursales).toEqual(all.sucursales);
      await db.exec("SET test.analysis_access='false'");
      await expect(report()).rejects.toThrow(/Sin acceso/);
    } finally { await db.exec('ROLLBACK'); }
  });
});


describe('criterios históricos confirmados del Excel', () => {
  it('corrige colores sin cambiar compras, valorización, sucursales ni permisos', async () => {
    await db.exec("SET test.analysis_access='true'");
    const before = await report();
    const migration = readFileSync('supabase/migrations/20261015200000_restore_historical_color_criteria.sql','utf8');
    await db.exec(migration);
    await db.exec(migration);
    const after = await report();
    expect(after.sucursales).toEqual(before.sucursales);
    expect(after.franjas).toEqual(before.franjas);
    expect(after.valor_kardex_usd).toBe(before.valor_kardex_usd);
    expect(after.lineas).toBe(before.lineas);
    expect(after.rows.find(r=>r.codigo_interno==='REP1')?.color).toBe('VERDE_CLARO');
    expect(after.rows.find(r=>r.codigo_interno==='REP3')?.color).toBe('SIN_DATOS');
    expect(after.por_color.reduce((s,c)=>s+(c.valor_kardex_usd??0),0)).toBe(after.valor_kardex_usd);
    expect((await report({color:'VERDE_CLARO'})).rows.every(r=>r.color==='VERDE_CLARO')).toBe(true);
    await db.exec("SET test.analysis_access='false'");
    await expect(report()).rejects.toThrow(/Sin acceso/);
    await db.exec("SET test.analysis_access='true'");
  });
  it.each([
    [10,10,10,1,'VERDE_OSCURO'],[10,9,10,1,'VERDE_CLARO'],
    [9,100,100,1,'VERDE_CLARO'],[0.5,0,0,1,'VERDE_CLARO'],
    [0,1,0,500,'AMARILLO'],[0,1,20,500,'AMARILLO'],
    [0,0,1,900,'NARANJA'],[0,0,0,365,'LILA'],
    [0,0,0,366,'GRIS'],[0,0,0,1000,'GRIS'],[0,0,0,1001,'ROJO'],
    [0,0,0,null,'SIN_DATOS'],[0,0,0,-1,'SIN_DATOS'],
  ])('respeta prioridad y límites: %s/%s/%s, días %s => %s', async (a,b,c,days,color) => {
    const r=await db.query<{color:string}>('SELECT repuestos_color_historico($1,$2,$3,$4) color',[a,b,c,days]);
    expect(r.rows[0].color).toBe(color);
  });
  it('usa los tres años calendario y solo ventas positivas confirmadas hasta hoy', async () => {
    await db.exec('BEGIN');
    try {
      await db.exec(`DELETE FROM repuestos_ventas_vinculacion WHERE producto_codigo='REP1';
        INSERT INTO repuestos_ventas_vinculacion VALUES
        ('REP1',current_date,10,'CONFIRMADA'),
        ('REP1',make_date(extract(year from current_date)::int-1,1,1),10,'CONFIRMADA'),
        ('REP1',make_date(extract(year from current_date)::int-2,1,1),10,'CONFIRMADA'),
        ('REP1',current_date,-50,'CONFIRMADA'),
        ('REP1',current_date+1,100,'CONFIRMADA'),
        ('REP1',current_date,100,'PENDIENTE');`);
      const row=(await report()).rows.find(r=>r.codigo_interno==='REP1')!;
      expect([row.unidades_anio_actual,row.unidades_anio_anterior,row.unidades_hace_dos_anios]).toEqual([10,10,10]);
      expect(row.color).toBe('VERDE_OSCURO');
      await db.exec("DELETE FROM repuestos_ventas_vinculacion WHERE producto_codigo='REP1' AND fecha_efectiva=current_date");
      expect((await report()).rows.find(r=>r.codigo_interno==='REP1')?.color).toBe('AMARILLO');
      await db.exec("DELETE FROM repuestos_ventas_vinculacion WHERE producto_codigo='REP1' AND extract(year from fecha_efectiva)=extract(year from current_date)-1");
      expect((await report()).rows.find(r=>r.codigo_interno==='REP1')?.color).toBe('NARANJA');
    } finally { await db.exec('ROLLBACK'); }
  });
});


describe('clasificación combinada de ventas y compra', () => {
  it('reclasifica sin ventas por compra, sin cambiar promedios, franjas ni importes', async () => {
    const before=await report();
    const migration=readFileSync('supabase/migrations/20261015210000_historical_colors_sales_and_purchase.sql','utf8');
    await db.exec(migration); await db.exec(migration);
    const after=await report();
    expect(after.sucursales).toEqual(before.sucursales);
    expect(after.franjas).toEqual(before.franjas);
    expect(after.valor_kardex_usd).toBe(before.valor_kardex_usd);
    expect(after.lineas).toBe(before.lineas);
    await db.exec('BEGIN');
    try {
      await db.exec("DELETE FROM repuestos_ventas_vinculacion WHERE producto_codigo='REP1'");
      for(const [days,color] of [[365,'LILA'],[366,'GRIS'],[1000,'GRIS'],[1001,'ROJO']] as const) {
        await db.exec(`UPDATE totvs_facturas_compra_lineas SET fecha_emision=current_date-${days} WHERE producto_codigo='REP1' AND especie='NF' AND cantidad>0 AND fecha_emision<=current_date;
          DELETE FROM repuestos_compras_historicas WHERE codigo_legacy_norm='8';`);
        expect((await report()).rows.find(r=>r.codigo_interno==='REP1')?.color).toBe(color);
        expect((await report({color})).rows.some(r=>r.codigo_interno==='REP1')).toBe(true);
      }
      await db.exec("DELETE FROM totvs_facturas_compra_lineas WHERE producto_codigo='REP1'");
      expect((await report()).rows.find(r=>r.codigo_interno==='REP1')?.color).toBe('SIN_DATOS');
      await db.exec("INSERT INTO repuestos_ventas_vinculacion VALUES ('REP1',current_date,1,'CONFIRMADA')");
      expect((await report()).rows.find(r=>r.codigo_interno==='REP1')?.color).toBe('VERDE_CLARO');
    } finally { await db.exec('ROLLBACK'); }
  });
  it.each([[10,10,10,null,'VERDE_OSCURO'],[1,0,0,1001,'VERDE_CLARO'],[0,1,0,1,'AMARILLO'],[0,0,1,1,'NARANJA'],[0,0,0,0,'LILA'],[0,0,0,365,'LILA'],[0,0,0,366,'GRIS'],[0,0,0,1000,'GRIS'],[0,0,0,1001,'ROJO'],[0,0,0,null,'SIN_DATOS'],[0,0,0,-1,'SIN_DATOS']])('prioridad ventas/compra %s/%s/%s días %s => %s',async(a,b,c,d,color)=>{
    expect((await db.query<{color:string}>('SELECT repuestos_color_ventas_compra($1,$2,$3,$4) color',[a,b,c,d])).rows[0].color).toBe(color);
  });
});


describe('dos indicadores por grupo', () => {
  it('conserva promedios de sucursal, fechas, totales y permisos al ampliar el informe', async () => {
    const before=await report();
    const sql=readFileSync('supabase/migrations/20261015220000_parts_analysis_group_indicators.sql','utf8');
    await db.exec(sql); await db.exec(sql);
    const after=await report();
    expect(after.sucursales.map(({color_historico,...rest})=>rest)).toEqual(before.sucursales);
    expect(after.rows).toEqual(before.rows);
    expect(after.valor_kardex_usd).toBe(before.valor_kardex_usd);
    expect(after.franjas).toEqual(before.franjas);
    await db.exec("SET test.analysis_access='false'");
    await expect(report()).rejects.toThrow(/Sin acceso/);
    await db.exec("SET test.analysis_access='true'");
  });
  it('usa USD de las ubicaciones filtradas y deja sin base el grupo sin valor', async () => {
    const r=await report({},'marca',1);
    expect(r.grupos.find(g=>g.nombre==='CLAAS')?.color_historico).toBe('VERDE_CLARO');
    expect(r.grupos.find(g=>g.nombre==='CLAAS')?.dias_compra_promedio).toBe(365);
    expect(r.grupos.find(g=>g.nombre==='GATES')?.color_historico).toBeNull();
    for(const group of ['marca','familia','sucursal','deposito']) {
      const filtered=await report({sucursal:'Katuete'},group);
      expect(filtered.grupos.every(g=>g.color_historico==='VERDE_CLARO' && g.dias_compra_promedio===365)).toBe(true);
      expect(filtered.grupos.reduce((sum,g)=>sum+(g.valor_kardex_usd??0),0)).toBe(filtered.valor_kardex_usd);
    }
  });
  it('ordena los tres años antes de paginar en ambas direcciones', async () => {
    for(const key of ['unidades_anio_actual','unidades_anio_anterior','unidades_hace_dos_anios'] as const) {
      for(const direction of ['asc','desc']) {
        const r=await report({orden:key,direccion:direction});
        const expected=[...r.rows].sort((a,b)=>(direction==='asc'?1:-1)*(a[key]-b[key])||a.codigo_interno.localeCompare(b.codigo_interno));
        expect(r.rows.map(x=>x.codigo_interno)).toEqual(expected.map(x=>x.codigo_interno));
        expect((await report({orden:key,direccion:direction},'marca',1,1)).rows[0].codigo_interno).toBe(expected[1].codigo_interno);
      }
    }
  });
});
