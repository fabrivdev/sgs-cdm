import { describe, expect, it } from "vitest";
import { observeImportRpc } from "./importRpcDiagnostics";
import { describeImportError, type ImportProgressEvent } from "./importProgress";

describe("observeImportRpc", () => {
  it("conserva orden y payload y cuenta solo lotes persistidos", async () => {
    const events: ImportProgressEvent[] = [];
    const calls: unknown[] = [];
    const rpc = observeImportRpc({ rpc: async (name, params) => {
      calls.push([name, params]);
      return { data: {}, error: null };
    } }, "mayor", "synthetic.xml", event => events.push(event));
    const first = { p_modo: "validate", p_filas: [{ id: 1 }] };
    await rpc.rpc("totvs_importar_mayor_lote_v1", first);
    await rpc.rpc("totvs_importar_mayor_lote_v1", { ...first, p_modo: "import" });
    await rpc.rpc("totvs_importar_mayor_lote_v1", first);
    expect((calls[0] as unknown[])[1]).toBe(first);
    expect(calls).toHaveLength(3);
    expect(events.filter(event => event.status === "succeeded").map(event => [event.phase, event.batch, event.completed]))
      .toEqual([["mayor.validate", 1, 0], ["mayor.persist", 1, 1], ["mayor.validate", 2, 1]]);
  });

  it("conserva el rechazo original aun si falla el observador", async () => {
    const rpc = observeImportRpc({ rpc: async () => {
      throw { code: "NETWORK", message: "conexion interrumpida", details: "detalle", headers: { authorization: "secreto" } };
    } }, "cxc", "synthetic.xml", () => { throw new Error("UI"); });
    const error = await rpc.rpc("totvs_importar_cxc_lote_v1", { p_modo: "import", p_filas: [{}] }).catch(error => error);
    expect(error).toMatchObject({ code: "NETWORK", message: "conexion interrumpida", details: "detalle", stage: "cxc.persist", batch: 1, batchRows: 1 });
    expect(error).not.toHaveProperty("headers");
    expect(describeImportError(error)).not.toContain("secreto");
  });
});
