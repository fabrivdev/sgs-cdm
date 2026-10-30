// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parsePartsExposure, partsAlertsStory } from '@/lib/campi/partsExposure';
import { withPartsExpansion } from '@/lib/campi/sourceExpansion';
import { withPartsAlertCandidateDetails } from '@/lib/campi/partsAlertCandidates';
import { buildCampiComments } from '@/lib/campi/campiComments';

const db = new PGlite();
beforeAll(async () => {
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '11111111-1111-4111-8111-111111111111'::uuid $$;
    CREATE FUNCTION public.has_module_access(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE FUNCTION public.has_section_access(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('app.allowed', true) = 'yes' $$;
    CREATE TABLE public.v_repuestos_semaforo_historico (
      codigo_interno text, descripcion text, stock_total numeric, color text, familia text, fecha_analisis date,
      unidades_anio_actual numeric, unidades_anio_anterior numeric, unidades_hace_dos_anios numeric
    );
    CREATE TABLE public.v_repuestos_ultima_compra (producto_codigo text, ultima_compra date, fuente_compra text);
    CREATE TABLE public.v_repuestos_analisis_ubicaciones (
      producto_codigo text, sucursal text, stock numeric, saldo_kardex numeric,
      valor_kardex_usd numeric, kardex_cargado_en timestamptz
    );
    INSERT INTO public.v_repuestos_semaforo_historico VALUES
      ('L','Filtro',3,'LILA','Filtros',current_date,0,0,0),
      ('G','Correa',2,'GRIS','Correas',current_date,0,0,0),
      ('V','Vendido',1,'VERDE_CLARO','Filtros',current_date,1,0,0),
      ('N','Sin compra',1,'SIN_DATOS','Filtros',current_date,0,0,0);
    INSERT INTO public.v_repuestos_ultima_compra VALUES
      ('L',current_date-365,'Ficha GRID - compras reales'),
      ('G',current_date-1000,'Factura de compra TOTVS'),
      ('V',current_date-1000,'Factura de compra TOTVS');
    INSERT INTO public.v_repuestos_analisis_ubicaciones VALUES
      ('L','Santa Rita',2,2,100,now()),('L','Katuete',1,1,null,null),
      ('G','Santa Rita',2,1,200,now()),('V','Santa Rita',1,1,50,now()),
      ('N','Santa Rita',1,1,30,now());
  `);
  const reviewed = readFileSync('supabase/review/panorama-v2/repuestos.apply.sql', 'utf8');
  const start = reviewed.indexOf('CREATE OR REPLACE FUNCTION public.campi_repuestos_exposicion_v1()');
  const end = reviewed.lastIndexOf('COMMIT;');
  // Only the hash guard is omitted in this isolated fixture; the function body is exact.
  if (start < 0 || end <= start) throw new Error('No se encontró el cuerpo SQL propuesto.');
  await db.exec(reviewed.slice(start, end));
}, 30_000);
afterAll(() => db.close());

describe('propuesta SQL de candidatos a 30 días', () => {
  it('lleva la respuesta SQL de candidatos hasta el comentario y Explorar', async () => {
    await db.exec("SELECT set_config('app.allowed','yes',false)");
    const response = await db.query<{ data: unknown }>('SELECT public.campi_repuestos_exposicion_v1() AS data');
    const raw = response.rows[0].data;
    const story = withPartsAlertCandidateDetails(
      withPartsExpansion(partsAlertsStory(parsePartsExposure(raw)), raw), raw,
    );
    expect(story.partsAlertCandidates).toHaveLength(2);
    expect(story.changeBuckets?.[0].label).toBe('1–7 días');
    const comments = buildCampiComments([story], null);
    expect(comments[0]).toMatchObject({ topic: 'repuestos_alertas', kind: 'attention' });
    expect(comments[0].text).toContain('rojo');
    expect(comments[0].route).toContain('/repuestos/analisis?color=GRIS');
  });
  it('conserva permiso independiente de Análisis', async () => {
    await db.exec("SELECT set_config('app.allowed','no',false)");
    await expect(db.query('SELECT public.campi_repuestos_exposicion_v1()')).rejects.toThrow('Sin acceso');
  });
  it('concilia candidatos y avisos sin duplicar ubicaciones ni convertir faltantes en cero', async () => {
    await db.exec("SELECT set_config('app.allowed','yes',false)");
    const result = await db.query<{ data: {
      avisos: { destino: string; codigos: number; valor_usd: number }[];
      candidatos_30d: Record<string, unknown>[];
      transiciones: { codigo: string; valor_usd: number }[];
    } }>('SELECT public.campi_repuestos_exposicion_v1() AS data');
    const { avisos, candidatos_30d: rows, transiciones } = result.rows[0].data;
    expect(rows).toHaveLength(2);
    expect(transiciones).toHaveLength(2);
    expect(rows.map(row => row.codigo).sort()).toEqual(['G', 'L']);
    const byCode = new Map(rows.map(row => [row.codigo, row]));
    expect(byCode.get('L')).toMatchObject({ color_actual: 'LILA', destino: 'GRIS', dias_compra: 365, dias_hasta: 1, stock_unidades: 3, valor_usd: 100, ubicaciones_sin_valor: 1, unidades_anio_actual: 0 });
    expect(byCode.get('G')).toMatchObject({ color_actual: 'GRIS', destino: 'ROJO', dias_compra: 1000, dias_hasta: 1, stock_unidades: 2, valor_usd: 200, ubicaciones_saldo_distinto: 1, unidades_anio_actual: 0 });
    expect(byCode.get('L')?.ultima_compra).toBeTruthy();
    expect(byCode.get('L')?.fuente_compra).toBe('Ficha GRID - compras reales');
    expect(rows.reduce((sum, row) => sum + Number(row.valor_usd), 0)).toBe(avisos.reduce((sum, row) => sum + row.valor_usd, 0));
    expect(avisos.reduce((sum, row) => sum + row.codigos, 0)).toBe(2);
  });
  it('ejecuta las comprobaciones SQL posteriores de la propuesta', async () => {
    const validation = readFileSync('supabase/review/panorama-v2/repuestos.validate.sql', 'utf8');
    const start = validation.indexOf('WITH r AS MATERIALIZED');
    const end = validation.indexOf('FROM r;', start) + 'FROM r;'.length;
    if (start < 0 || end < start) throw new Error('Falta la consulta de validación.');
    const result = await db.query<Record<string, boolean | number>>(validation.slice(start, end));
    expect(result.rows[0]).toMatchObject({
      dias_validos: true, codigos_unicos: true, fichas_presentes: true,
      fichas_concilian_codigos: true, fichas_concilian_usd: true,
      fichas_concilian_por_destino: true, fichas_respetan_regla: true,
    });
  });
});
