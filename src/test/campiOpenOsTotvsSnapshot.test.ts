// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const db = new PGlite();
const migrationSource = readFileSync('supabase/migrations/20261020180000_campi_open_os_latest_totvs_snapshot.sql', 'utf8');
beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '11111111-1111-4111-8111-111111111111'::uuid $$;
    CREATE FUNCTION public.has_module_access(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE FUNCTION public.has_section_access(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('app.allowed', true) = $2 $$;
    CREATE TABLE public.importaciones (id uuid PRIMARY KEY, origen_sistema text, archivo_nombre text,
      insertados integer, metadata jsonb, creado_en timestamptz);
    CREATE TABLE public.ordenes_servicio_importadas (os_numero text PRIMARY KEY, situacion_os text,
      fecha_abierta_os date, fecha_cierre_os date, marca text, raw_data jsonb);
    INSERT INTO public.ordenes_servicio_importadas VALUES
      ('01-OLD','Abierta', current_date - 100, null, 'CLAAS', '{}'::jsonb),
      ('01-NEW','Abierta', current_date - 3, null, 'HORSCH', '{"source_os_number":"NEW"}'::jsonb),
      ('02-NEW','Abierta', current_date - 1, null, 'CLAAS', '{"source_os_number":"NEW"}'::jsonb);
    INSERT INTO public.importaciones VALUES
      ('22222222-2222-4222-8222-222222222222','new_xml_ordenes_servicio','test.xml',2,
       '{"snapshot_os_numbers":["01-NEW","02-NEW"]}'::jsonb, now());
    SELECT set_config('app.allowed','servicios.ordenes',false);
  `);
  await db.exec(migrationSource);
}, 30_000);
afterAll(() => db.close());

describe('corte de OS abiertas TOTVS', () => {
  it('cuenta solo las identidades del último XML y conserva las anteriores', async () => {
    const { rows } = await db.query<{ detail: { abiertas: number; os_numeros: string[] }; resolution: { abiertas: number } }>(
      'SELECT public.campi_os_abiertas_detalle_v1() AS detail, public.campi_resolucion_os_v1() AS resolution');
    expect(rows[0].detail.abiertas).toBe(2);
    expect(rows[0].detail.os_numeros).toEqual(['01-NEW', '02-NEW']);
    expect(rows[0].resolution.abiertas).toBe(2);
    const kept = await db.query('SELECT count(*) AS total FROM public.ordenes_servicio_importadas');
    expect(Number((kept.rows[0] as { total: number }).total)).toBe(3);
    await db.exec('SELECT public.campi_os_abiertas_capturar_v1()');
    const cuts = await db.query('SELECT abiertas FROM public.campi_os_abiertas_cortes_totvs');
    expect(cuts.rows).toEqual([{ abiertas: 2 }]);
  });
  it('rechaza una carga posterior incompleta en vez de mostrar el corte anterior', async () => {
    await db.exec(`INSERT INTO public.importaciones VALUES
      ('33333333-3333-4333-8333-333333333333','new_xml_ordenes_servicio','new.xml',0,'{}'::jsonb,now() + interval '1 minute')`);
    await expect(db.query('SELECT public.campi_os_abiertas_detalle_v1()')).rejects.toThrow('no está completo');
  });
  it('adopta el manifiesto confirmado sin incluir la OS anulada', async () => {
    const ids = Array.from({ length: 319 }, (_, index) => `01-${String(index + 1).padStart(8, '0')}`);
    const excluded = '02-00000036';
    expect(ids).toHaveLength(319);
    expect(new Set([...ids, excluded]).size).toBe(320);
    const seeded = new PGlite();
    try {
      await seeded.exec(`
        CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '11111111-1111-4111-8111-111111111111'::uuid $$;
        CREATE FUNCTION public.has_module_access(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
        CREATE FUNCTION public.has_section_access(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
        CREATE TABLE public.importaciones (id uuid PRIMARY KEY, origen_sistema text, archivo_nombre text,
          insertados integer, metadata jsonb, creado_en timestamptz);
        CREATE TABLE public.ordenes_servicio_importadas (os_numero text PRIMARY KEY, situacion_os text,
          fecha_abierta_os date, fecha_cierre_os date, marca text, raw_data jsonb);
        CREATE TABLE public.os_exclusiones_confirmadas (os_numero text PRIMARY KEY);
        INSERT INTO public.os_exclusiones_confirmadas VALUES ('02-00000036');
      `);
      for (let index = 0; index < ids.length; index += 80) {
        const values = ids.slice(index, index + 80).map((id, offset) =>
          `('${id}','${index + offset < 60 ? 'Abierta' : 'Cerrada'}',current_date - 1,null,'CLAAS','{"source_os_number":"${id}"}'::jsonb)`);
        await seeded.exec(`INSERT INTO public.ordenes_servicio_importadas VALUES ${values.join(',')}`);
      }
      const metadata = JSON.stringify({ os_lotes_confirmados: { 1: [...ids, excluded] }, os_excluidas_confirmadas: 1 });
      await seeded.exec(`INSERT INTO public.importaciones VALUES
        ('22222222-2222-4222-8222-222222222222','new_xml_ordenes_servicio',
         'ordenes_de_servicio_072008.xml',319,'${metadata}'::jsonb,now())`);
      await seeded.exec(migrationSource);
      const { rows } = await seeded.query<{ snapshot_count: number; open_count: number }>(`
        SELECT jsonb_array_length(metadata -> 'snapshot_os_numbers') AS snapshot_count,
          (SELECT abiertas FROM public.campi_os_abiertas_cortes_totvs) AS open_count
        FROM public.importaciones`);
      expect(rows).toEqual([{ snapshot_count: 319, open_count: 60 }]);
      // La versión pública todavía conserva solo os_lotes_confirmados.
      await seeded.exec("UPDATE public.importaciones SET metadata = metadata - 'snapshot_os_numbers'");
      const legacy = await seeded.query<{ ids: number; abiertas: number }>(`
        SELECT cardinality(public.campi_os_snapshot_numeros_v1()) AS ids,
          (public.campi_os_abiertas_detalle_v1() ->> 'abiertas')::integer AS abiertas`);
      expect(legacy.rows).toEqual([{ ids: 319, abiertas: 60 }]);
    } finally {
      await seeded.close();
    }
  }, 30_000);
});
