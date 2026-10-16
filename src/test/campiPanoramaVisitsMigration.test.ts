// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261016190000_campi_panorama_visits.sql', 'utf8');
const db = new PGlite({ extensions: { pgcrypto } });
const uid = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';

beforeAll(async () => {
  await db.exec(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE TYPE public.app_role AS ENUM ('admin', 'superadmin', 'gerencia');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('app.uid', true), '')::uuid $$;
    CREATE FUNCTION public.has_role(uuid, public.app_role) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT current_setting('app.role', true) = $2::text $$;
    CREATE FUNCTION public.has_module_access(uuid, text) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT current_setting('app.module', true) = $2 $$;
    CREATE FUNCTION public.has_section_access(uuid, text) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT current_setting('app.section', true) = $2 $$;
    INSERT INTO auth.users VALUES ('${uid}'), ('${other}');
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
  `);
  await db.exec(migration);
  await db.exec(`SET app.uid = '${uid}'; SET app.role = 'gerencia'; SET app.module = 'repuestos'; SET app.section = 'repuestos.ventas'; SET ROLE authenticated;`);
});
afterAll(async () => db.close());

describe('Campi Panorama visit isolation', () => {
  it('stores and reads only the current user and currently permitted section', async () => {
    const metrics = JSON.stringify([{ id: 'repuestos.facturado', section: 'repuestos.ventas', value: 100, unit: 'PYG', scope: 'Repuestos', period: '2026-10', version: 'v1' }]);
    await db.query('INSERT INTO public.campi_panorama_visitas(user_id,client_session_id,metrics) VALUES ($1,$2,$3::jsonb)', [uid, '00000000-0000-0000-0000-000000000011', metrics]);
    expect((await db.query('SELECT id FROM public.campi_panorama_visitas')).rows).toHaveLength(1);
    await expect(db.query('INSERT INTO public.campi_panorama_visitas(user_id,client_session_id,metrics) VALUES ($1,$2,$3::jsonb)', [other, '00000000-0000-0000-0000-000000000012', metrics])).rejects.toThrow();
    await db.exec("SET app.section = 'repuestos.stock'");
    expect((await db.query('SELECT id FROM public.campi_panorama_visitas')).rows).toHaveLength(0);
    await db.exec("SET app.section = 'repuestos.ventas'");
    expect((await db.query('SELECT id FROM public.campi_panorama_visitas')).rows).toHaveLength(1);
    await db.exec("SET app.module = 'servicios'");
    expect((await db.query('SELECT id FROM public.campi_panorama_visitas')).rows).toHaveLength(0);
    await db.exec("SET app.module = 'repuestos'; SET app.role = 'operativo'");
    expect((await db.query('SELECT id FROM public.campi_panorama_visitas')).rows).toHaveLength(0);
  });
});
