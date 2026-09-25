import { describe, expect, it } from "vitest";
import { loadOperationsData, validOperationsRange } from "./data";

function clientFixture(options: { failure?: string; goal?: unknown; missingGoal?: boolean; many?: boolean; profileError?: string } = {}) {
  const calls: Array<{ table: string; fields?: string; range?: number[]; date?: string }> = [];
  const source = (table: string) => {
    const call = { table } as typeof calls[number]; calls.push(call);
    const response = () => {
      if (table === options.failure) return { data: null, error: { code: "42501", message: "denied" } };
      if (table === "profiles" && options.profileError) return { data: null, error: { code: options.profileError } };
      if (table === "app_configuracion") return { data: options.missingGoal ? null : { valor_numero: options.goal ?? 120 }, error: null };
      const rows = table === "ordenes_servicio_importadas" ? [{ id: "A", os_numero: "1" }, { id: "B", os_numero: "1" }] : table === "servicios" && options.many ? Array.from({ length: 1001 }, (_, i) => ({ id: String(i) })) : [];
      return { data: call.range ? rows.slice(call.range[0], call.range[1] + 1) : rows, error: null };
    };
    const chain = { select(fields: string) { call.fields = fields; return chain; }, order() { return chain; }, gte(date: string) { call.date = date; return chain; }, lte() { return chain; }, eq() { return chain; },
      range(from: number, to: number) { call.range = [from, to]; return chain; }, abortSignal() { return chain; }, maybeSingle() { return chain; }, then(resolve: (value: unknown) => unknown) { return Promise.resolve(response()).then(resolve); } };
    return chain;
  };
  return { calls, client: { from: source, rpc: source } };
}
describe("operational source loader", () => {
  it("paginates completely, unions OS by source ID and never reads financial tables", async () => {
    const { client, calls } = clientFixture({ many: true });
    const result = await loadOperationsData(client, "2026-09-01", "2026-09-30");
    expect(result.data.servicios).toHaveLength(1001);
    expect(result.data.ordenesServicio.map(r => r.id)).toEqual(["A", "B"]);
    expect(calls.filter(c => c.table === "ordenes_servicio_importadas").map(c => c.date)).toEqual(["fecha_abierta_os", "fecha_cierre_os"]);
    expect(calls.map(c => c.table)).not.toEqual(expect.arrayContaining(["facturacion", "dashboard_financiero", "facturas"]));
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
    expect(result.data.metaHorasMensual).toBe(0); expect(result.capacityWarning).toMatch(/no disponible/);
  });
  it("rejects invalid/reversed dates and aborted requests", async () => {
    expect(validOperationsRange("2026-02-30", "2026-09-30")).toBe(false);
    expect(validOperationsRange("2026-10-01", "2026-09-30")).toBe(false);
    const signal = AbortSignal.abort();
    await expect(loadOperationsData(clientFixture().client, "2026-09-01", "2026-09-30", signal)).rejects.toBeDefined();
  });
});
