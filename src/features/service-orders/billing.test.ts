import { describe, expect, it, vi } from "vitest";
import type { ServicioOSRow } from "@/components/dashboard/types";
import { billingEfficiency, billingWarning, loadOrderBilling, type OrderBilling } from "./billing";

export const bill = (extra: Partial<OrderBilling> = {}): OrderBilling => ({ os: "01-00000001", matched: true, ambiguous: false,
  documents: ["0001"], date: "2026-09-10", labor: 600, parts: 0, travel: 180, thirdParty: 0, total: 780,
  laborLines: 1, missingRates: 0, billedHours: 12, ...extra });
const order = (extra: Partial<ServicioOSRow> = {}) => ({ os: "01-00000001", estadoOS: "Cerrada", horas: 20,
  horasPersona: 40, billing: bill(), ...extra }) as ServicioOSRow;

describe("OS billing efficiency", () => {
  it("uses OS hours once, never person-hours, and a ratio of sums instead of averaging percentages", () => {
    const rows = [order(), order(), order({ os: "02-00000001", horas: 10, billing: bill({ billedHours: 9 }) })];
    expect(billingEfficiency(rows)).toEqual({ orders: 2, incomplete: 0, billedHours: 21, workedHours: 30, percentage: 70 });
    expect(billingEfficiency(rows.slice(0, 1)).percentage).toBe(60);
  });
  it("does not treat unbilled, open, cancelled or non-labor orders as zero efficiency", () => {
    for (const row of [order({ estadoOS: "Abierta" }), order({ estadoOS: "Anulada" }),
      order({ billing: bill({ matched: false, laborLines: 0, billedHours: null }) }),
      order({ billing: bill({ laborLines: 0, billedHours: null }) })]) {
      expect(billingEfficiency([row])).toMatchObject({ orders: 0, incomplete: 0, percentage: null });
    }
  });
  it.each([null, bill({ ambiguous: true }), bill({ billedHours: null, missingRates: 1 })])("does not publish a partial percentage for unavailable billing %j", billing => {
    expect(billingEfficiency([order(), order({ os: "OTHER", billing })])).toMatchObject({ incomplete: 1, percentage: null });
  });
  it.each([0, -1, NaN, Infinity])("leaves invalid worked hours %s unknown", horas => {
    expect(billingEfficiency([order({ horas })]).percentage).toBeNull();
  });
  it("preserves credits, zero and over-100 percentages without capping or rounding the calculation", () => {
    for (const [hours, percentage] of [[0, 0], [-2, -10], [24, 120]]) {
      expect(billingEfficiency([order({ billing: bill({ billedHours: hours }) })]).percentage).toBe(percentage);
    }
  });
});

describe("complete billing loader", () => {
  const client = (transform: (keys: string[], call: number) => unknown = keys => keys.map(os => bill({ os }))) => {
    let call = 0;
    const rpc = vi.fn((_name, args) => {
      const result = transform(args.p_os_numeros, call++);
      const response = result instanceof Error ? { error: result, data: null } : { error: null, data: result };
      return { abortSignal: () => Promise.resolve(response), then: (resolve: (value: unknown) => unknown) => Promise.resolve(response).then(resolve) };
    });
    return { rpc };
  };
  it("fetches disjoint complete batches, normalizes without stripping branch/zeros and passes cutoff", async () => {
    const source = client();
    const keys = Array.from({ length: 501 }, (_, i) => `01-${String(i).padStart(8, "0")}`);
    const result = await loadOrderBilling(source, [...keys, ` ${keys[0]} `, "02-00000000"], "2026-09-25");
    expect(Object.keys(result)).toHaveLength(502);
    expect(source.rpc.mock.calls.map(call => call[1].p_os_numeros.length)).toEqual([250, 250, 2]);
    expect(source.rpc).toHaveBeenCalledWith("service_orders_billing_v2", expect.objectContaining({ p_hasta: "2026-09-25" }));
  });
  it.each([[], [bill({ os: "OTHER" })], [bill({ total: null })], [bill({ billedHours: Infinity })]])("rejects missing, foreign or malformed replies %j", reply => {
    return expect(loadOrderBilling(client(() => reply), ["01-00000001"], "2026-09-25")).rejects.toThrow();
  });
  it("rejects duplicate keys and later batch failures, preserving no partial result", async () => {
    await expect(loadOrderBilling(client(() => [bill(), bill()]), ["01-00000001", "02-00000001"], "2026-09-25")).rejects.toThrow();
    await expect(loadOrderBilling(client((keys, call) => call ? new Error("timeout") : keys.map(os => bill({ os }))),
      Array.from({ length: 251 }, (_, i) => `OS-${i}`), "2026-09-25")).rejects.toThrow("timeout");
  });
  it("does not query empty lists and respects cancellation", async () => {
    const source = client(); expect(await loadOrderBilling(source, [], "2026-09-25")).toEqual({});
    expect(source.rpc).not.toHaveBeenCalled();
    await expect(loadOrderBilling(source, ["A"], "2026-09-25", AbortSignal.abort())).rejects.toThrow();
  });
  it("distinguishes missing migration from denied access", () => {
    expect(billingWarning({ code: "PGRST202" })).toContain("actualizar en la base");
    expect(billingWarning({ code: "42501" })).toContain("permisos");
  });
  it("never retries the known-invalid invoice-unit calculation if the new RPC is missing", async () => {
    const failure = Object.assign(new Error("missing RPC"), { code: "PGRST202" });
    const source = client(() => failure);
    await expect(loadOrderBilling(source, ["01-00000001"], "2026-09-25")).rejects.toBe(failure);
    expect(source.rpc).toHaveBeenCalledTimes(1);
    expect(source.rpc.mock.calls[0][0]).toBe("service_orders_billing_v2");
  });
  it("aborts slow requests after the deadline rather than leaving an infinite loader", async () => {
    vi.useFakeTimers();
    let usedSignal: AbortSignal | undefined;
    try {
      const source = { rpc: () => ({ abortSignal: (signal: AbortSignal) => { usedSignal = signal; return new Promise(() => {}); } }) };
      const request = loadOrderBilling(source, ["01-A"], "2026-09-25");
      const rejected = expect(request).rejects.toMatchObject({ code: "BILLING_TIMEOUT" });
      await vi.advanceTimersByTimeAsync(25_000);
      await rejected;
      expect(usedSignal?.aborted).toBe(true);
      expect(billingWarning({ code: "BILLING_TIMEOUT" })).toContain("demorando");
    } finally { vi.useRealTimers(); }
  });
  it("cancels an in-flight request when filters change", async () => {
    const cancel = new AbortController();
    let usedSignal: AbortSignal | undefined;
    const source = { rpc: () => ({ abortSignal: (signal: AbortSignal) => { usedSignal = signal; return new Promise(() => {}); } }) };
    const request = loadOrderBilling(source, ["01-A"], "2026-09-25", cancel.signal);
    const rejected = expect(request).rejects.toBeDefined();
    cancel.abort(); await rejected;
    expect(usedSignal?.aborted).toBe(true);
  });
});
