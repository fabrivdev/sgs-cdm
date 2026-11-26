// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const migration = (name: string) => readFileSync(`supabase/migrations/${name}.sql`, "utf8");
const admin = "00000000-0000-4000-8000-000000000001";
const existing = "00000000-0000-4000-8000-000000000002";
const newUser = "00000000-0000-4000-8000-000000000003";
const disabled = "00000000-0000-4000-8000-000000000004";
const guarded = "00000000-0000-4000-8000-000000000005";

it("repairs assigned Mercado access and keeps section and admin boundaries", async () => {
  const db = new PGlite();
  const asUser = async (id: string) => {
    await db.exec("RESET ROLE");
    await db.query("SELECT set_config('test.uid', $1, false)", [id]);
    await db.exec("SET ROLE authenticated");
  };
  const setSection = (user: string, section: string, enabled: boolean) =>
    db.query("SELECT public.admin_actualizar_acceso_seccion($1, $2, $3)", [user, section, enabled]);
  const hasModule = async (user: string) =>
    (await db.query<{ allowed: boolean }>("SELECT public.has_module_access($1, 'mercado') AS allowed", [user])).rows[0].allowed;
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      INSERT INTO auth.users VALUES ('${admin}'), ('${existing}'), ('${newUser}'), ('${disabled}'), ('${guarded}');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('test.uid', true), '')::uuid
      $$;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      CREATE TYPE public.app_role AS ENUM ('admin', 'superadmin', 'gerencia');
      CREATE FUNCTION public.has_role(uuid, public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT ($1 = '${admin}' AND $2 = 'admin') OR ($1 = '${guarded}' AND $2 = 'superadmin')
      $$;
      CREATE TABLE public.profiles(id uuid PRIMARY KEY, auth_user_id uuid);
      CREATE TABLE public.modulos(id text PRIMARY KEY, nombre text, activo boolean NOT NULL DEFAULT true);
      CREATE TABLE public.app_secciones(id text PRIMARY KEY, modulo_id text REFERENCES public.modulos, nombre text, orden int, activo boolean);
      CREATE TABLE public.user_modulo_acceso(user_id uuid REFERENCES auth.users, modulo_id text REFERENCES public.modulos, PRIMARY KEY (user_id, modulo_id));
      CREATE TABLE public.user_seccion_acceso(user_id uuid REFERENCES auth.users, seccion_id text REFERENCES public.app_secciones, PRIMARY KEY (user_id, seccion_id));
    `);
    for (const [file, name] of [
      ["20260812130000_enforce_role_module_matrix", "has_module_access"],
      ["20260909110000_add_section_access", "has_section_access"],
    ]) {
      const sql = migration(file);
      const start = sql.indexOf(`create or replace function public.${name}`);
      await db.exec(sql.slice(start, sql.indexOf("$$;", start) + 3));
    }
    for (const name of [
      "20260914120000_restore_admin_section_access",
      "20261119170000_mercado_tractores",
      "20261119190000_mercado_tractores_admin_datos",
      "20261120120000_mercado_cosechadoras",
      "20261120140000_mercado_sembradoras",
      "20261120150000_mercado_pulverizadores",
      "20261120160000_mercado_market_share",
      "20261121110000_mercado_market_share_cadam",
    ]) await db.exec(migration(name));
    await db.exec(`
      INSERT INTO public.mercado_tractores VALUES (1, '[1]');
      INSERT INTO public.app_secciones VALUES ('mercado.inactiva', 'mercado', 'Inactiva', 0, false);
      INSERT INTO public.user_seccion_acceso VALUES ('${disabled}', 'mercado.inactiva');
    `);
    await asUser(admin);
    await setSection(existing, "mercado.tractores", true);
    expect(await hasModule(existing)).toBe(false);
    const fix = migration("20261126150000_sync_market_module_access");
    await db.exec("RESET ROLE");
    await db.exec(fix);
    await db.exec(fix);
    expect(await hasModule(existing)).toBe(true);
    expect(await hasModule(newUser)).toBe(false);
    expect(await hasModule(disabled)).toBe(false);

    await asUser(existing);
    expect((await db.query("SELECT id FROM public.mercado_tractores")).rows).toEqual([{ id: 1 }]);
    await expect(setSection(existing, "mercado.market_share", true)).rejects.toThrow("Solo un administrador");
    await expect(db.query("INSERT INTO public.mercado_tractores VALUES (1, '[2]')")).rejects.toThrow("row-level security");

    await asUser(admin);
    await expect(setSection(guarded, "mercado.tractores", true)).rejects.toThrow("protegidos");
    await setSection(newUser, "mercado.market_share", true);
    expect(await hasModule(newUser)).toBe(true);
    await asUser(newUser);
    expect((await db.query("SELECT id FROM public.mercado_tractores")).rows).toEqual([]);
    await asUser(admin);
    await setSection(newUser, "mercado.cosechadoras", true);
    await setSection(newUser, "mercado.market_share", false);
    expect(await hasModule(newUser)).toBe(true);
    await setSection(newUser, "mercado.cosechadoras", false);
    expect(await hasModule(newUser)).toBe(false);
  } finally {
    await db.close();
  }
}, 30_000);
