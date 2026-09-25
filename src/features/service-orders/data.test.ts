import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { demoOrder, demoBilling } from "@/test/serviceOrdersFixture";
import { loadOperationsData, validOperationsRange } from "./data";

// Validate the fake against migrations, not an invented identity in the fixture.
const orderDefinition = readFileSync("supabase/migrations/20260528120000_add_os_reference_to_trabajos.sql", "utf8")
  .split("CREATE TABLE IF NOT EXISTS public.ordenes_servicio_importadas (")[1].split("\n);")[0];
const orderSchema = new Set([...orderDefinition.matchAll(/^\s+(\w+)\s+\w+/gm)].map(match => match[1]));
orderSchema.add("fecha_cierre_os"); // 20260724150000_add_fecha_cierre_os.sql

function clientFixture(options: { failure?: string; goal?: unknown; missingGoal?: boolean; many?: boolean; manyOrders?: boolean; profileError?: string } = {}) {
  const calls: Array<{ table: string; fields?: string; order?: string; range?: number[]; date?: string }> = [];
  const source = (table: string, args?: { p_os_numeros: string[] }) => {
    const call = { table } as typeof calls[number]; calls.push(call);
    const response = () => {
      if (table === options.failure) return { data: null, error: { code: "42501", message: "denied" } };
      if (table === "profiles" && options.profileError) return { data: null, error: { code: options.profileError } };
      if (table === "app_configuracion") return { data: options.missingGoal ? null : { valor_numero: options.goal ?? 120 }, error: null };
      if (table === "service_orders_billing_v1") return { data: args?.p_os_numeros.map(os => demoBilling({ os })) ?? [], error: null };
      if (table === "ordenes_servicio_importadas") {
        const missing = [...(call.fields?.split(",") ?? []), call.order].find(column => column && !orderSchema.has(column));
        if (missing) return { data: null, error: { code: "42703", message: `column ordenes_servicio_importadas.${missing} does not exist` } };
      }
      const orders = options.manyOrders
        ? Array.from({ length: 1001 }, (_, i) => demoOrder({ os_numero: `01-${String(i).padStart(8, "0")}` }))
        : [demoOrder({ os_numero: "01-00000001" }), demoOrder({ os_numero: "02-00000001" }), demoOrder({ os_numero: "01-00000002" })]
          .filter((_, i) => call.date === "fecha_abierta_os" ? i < 2 : i > 0);
      const rows = table === "ordenes_servicio_importadas" ? orders : table === "servicios" && options.many ? Array.from({ length: 1001 }, (_, i) => ({ id: String(i) })) : [];
      return { data: call.range ? rows.slice(call.range[0], call.range[1] + 1) : rows, error: null };
    };
    const chain = { select(fields: string) { call.fields = fields; return chain; }, order(column: string) { call.order = column; return chain; }, gte(date: string) { call.date = date; return chain; }, lte() { return chain; }, eq() { return chain; },
      range(from: number, to: number) { call.range = [from, to]; return chain; }, abortSignal() { return chain; }, maybeSingle() { return chain; }, then(resolve: (value: unknown) => unknown) { return Promise.resolve(response()).then(resolve); } };
    return chain;
  };
  return { calls, client: { from: source, rpc: source } };
}
describe("operational source loader", () => {
  it("paginates completely and unions date queries by the real OS primary key without losing branch prefixes", async () => {
    const { client, calls } = clientFixture({ many: true });
    const result = await loadOperationsData(client, "2026-09-01", "2026-09-30");
    expect(result.data.servicios).toHaveLength(1001);
    expect(result.billingWarning).toBeNull();
    expect(Object.keys(result.data.billing ?? {})).toHaveLength(3);
    expect(orderDefinition).toMatch(/os_numero text PRIMARY KEY/);
    expect(result.data.ordenesServicio.map(r => r.os_numero)).toEqual(["01-00000001", "02-00000001", "01-00000002"]);
    expect(calls.filter(c => c.table === "ordenes_servicio_importadas").map(c => c.date)).toEqual(["fecha_abierta_os", "fecha_cierre_os"]);
    for (const query of calls.filter(c => c.table === "ordenes_servicio_importadas")) {
      expect(query.fields?.split(",")).not.toContain("id");
      expect(query.order).toBe("os_numero");
    }
    expect(calls.map(c => c.table)).not.toEqual(expect.arrayContaining(["facturacion", "dashboard_financiero", "facturas"]));
  });
  it("loads both OS date queries beyond the server page limit without duplicating orders", async () => {
    const { client, calls } = clientFixture({ manyOrders: true });
    const result = await loadOperationsData(client, "2026-09-01", "2026-09-30");
    expect(result.data.ordenesServicio).toHaveLength(1001);
    expect(new Set(result.data.ordenesServicio.map(row => row.os_numero)).size).toBe(1001);
    expect(result.data.ordenesServicio[1000].os_numero).toBe("01-00001000");
    expect(calls.filter(c => c.table === "ordenes_servicio_importadas").map(c => c.range)).toEqual([[1000, 1999], [1000, 1999]]);
  });
  it.each(["servicios", "trabajos", "clientes", "servicio_jornadas", "tecnico_disponibilidad", "ordenes_servicio_importadas", "servicios_listar_tecnicos_activos"])("fails the entire snapshot when %s fails", async failure => {
    await expect(loadOperationsData(clientFixture({ failure }).client, "2026-09-01", "2026-09-30")).rejects.toMatchObject({ code: "42501" });
  });
  it("does not turn a profile permission failure into an empty team", async () => {
    const { client, calls } = clientFixture({ profileError: "42501" });
    await expect(loadOperationsData(client, "2026-09-01", "2026-09-30")).rejects.toMatchObject({ code: "42501" });
    expect(calls.filter(c => c.table === "profiles")).toHaveLength(1);
  });
  it("returns unknown goal with warning, not the old silent default", async () => {
    const result = await loadOperationsData(clientFixture({ missingGoal: true }).client, "2026-09-01", "2026-09-30");
    expect(result.data.metaHorasMensual).toBe(0); expect(result.capacityWarning).toMatch(/No se encontró.*accesible/);
  });
  it("keeps operational data but no partial financial amounts when billing fails", async () => {
    const result = await loadOperationsData(clientFixture({ failure: "service_orders_billing_v1" }).client, "2026-09-01", "2026-09-30");
    expect(result.data.ordenesServicio).toHaveLength(3);
    expect(result.data.billing).toBeUndefined();
    expect(result.billingWarning).toContain("permisos");
  });
  it("rejects invalid/reversed dates and aborted requests", async () => {
    expect(validOperationsRange("2026-02-30", "2026-09-30")).toBe(false);
    expect(validOperationsRange("2026-10-01", "2026-09-30")).toBe(false);
    const signal = AbortSignal.abort();
    await expect(loadOperationsData(clientFixture().client, "2026-09-01", "2026-09-30", signal)).rejects.toBeDefined();
  });
});
