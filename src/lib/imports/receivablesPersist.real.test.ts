// @vitest-environment node
import { File as NodeFile } from "node:buffer";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";
import { persistReceivablesFile, type ReceivablesRpcClient } from "./receivablesPersist";
const fixture = process.env.TOTVS_CXC_CURRENT_FIXTURE;
it.skipIf(!fixture)("persiste el XML completo, concilia y permite reintentar sin duplicarlo", async () => {
  const cutoff = process.env.TOTVS_CXC_CONFIRMED_CUTOFF!;
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE TYPE public.app_role AS ENUM ('admin','cabecilla','tecnico','gerencia');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '00000000-0000-4000-8000-000000000001'::uuid $$;
      CREATE FUNCTION public.has_section_access(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
      CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;`);
    await db.exec(await readFile("supabase/migrations/20261007130000_import_totvs_accounts_receivable.sql", "utf8"));
    const signatures: Record<string, string[]> = {
      totvs_iniciar_cxc_carga_v1: ["jsonb"], totvs_importar_cxc_lote_v1: ["uuid","text","jsonb"],
      totvs_finalizar_cxc_carga_v1: ["uuid","jsonb"], totvs_cancelar_cxc_carga_v1: ["uuid"],
    };
    const client: ReceivablesRpcClient = { rpc: async (name, params) => {
      const casts = signatures[name];
      if (!casts) throw new Error("RPC inesperado");
      const args = Object.values(params);
      try {
        const result = await db.query(`SELECT public.${name}(${casts.map((cast,i)=>`$${i+1}::${cast}`).join(",")}) result`, args);
        return { data: result.rows[0].result, error: null };
      } catch (error) { return { data: null, error: { message: (error as Error).message } }; }
    } };
    const file = new NodeFile([await readFile(fixture!)], "cuentas_por_cobrar_a_la_fecha_114844.xml") as unknown as File;
    const result = await persistReceivablesFile({ file, client, cutoffDate: cutoff });
    expect(result.insertadas).toBe(result.preflight.documentRows);
    const summary = (await db.query("SELECT public.totvs_consultar_cxc_resumen_v1($1::date) result", [cutoff])).rows[0].result as Record<string, unknown>;
    expect(Number(summary.saldo_pendiente_elegible_usd)).toBe(result.preflight.eligiblePendingUsd);
    expect(Number(summary.saldo_vencido_usd)).toBe(result.preflight.overdueUsd);
    const retry = await persistReceivablesFile({ file, client, cutoffDate: cutoff });
    expect(retry.reusedCompleteSnapshot).toBe(true);
    expect(retry.cargaId).toBe(result.cargaId);
    const count = (await db.query("SELECT count(*) n FROM public.totvs_cxc_documentos")).rows[0].n;
    expect(Number(count)).toBe(result.preflight.documentRows);
    console.log(JSON.stringify({ documentos: result.preflight.documentRows, lotes: result.lotes, corte: cutoff, saldo: result.preflight.eligiblePendingUsd, vencido: result.preflight.overdueUsd, reintentoSinDuplicados: true }));
  } finally { await db.close(); }
}, 120000);
