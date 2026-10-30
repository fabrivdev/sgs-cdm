import { describeImportError, type ImportProgressEvent } from "./importProgress";
import { File as NodeFile } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import { persistMayorFile, type MayorRpcClient } from "./mayorPersist";

const headers = [
  "SUCURS", "ANOMES", "FECHA", "LOTE", "SUBLOTE", "DOCUMENTO", "LINEA",
  "SALDO01", "SALDO02", "HIST", "CUENTA", "DESC_CTA", "CCOSTO", "DESCCCOS",
  "ITEMC", "Cliente", "ORIGEN", "TIPO_MOV", "TPSLDO", "CLIFOR", "LOJA",
  "DOCASOC", "T_A", "FECH_INC", "USU_NOM", "ASIENTO",
];

function xmlFile() {
  const cells = (values: string[]) => values.map((value) => `<Cell><Data>${value}</Data></Cell>`).join("");
  const values = ["01", "202607", "2026-07-01T00:00:00", "1", "1", "10", "1", "100", "2.5", "APERTURA", "", "", "10", "Centro", "", "", "ORI", "1", "1"];
  const xml = `<Workbook><Worksheet><Table><Row>${cells(headers)}</Row><Row>${cells(values)}</Row><Row>${cells(["Totales"])}</Row></Table></Worksheet></Workbook>`;
  return new NodeFile([xml], "mayor.xml", { type: "application/xml" }) as unknown as File;
}

describe("persistMayorFile", () => {
  it("inicia, valida, importa y finaliza una carga conciliada", async () => {
    const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
    const client: MayorRpcClient = {
      rpc: async (name, params) => {
        calls.push({ name, params });
        if (name === "totvs_iniciar_mayor_carga_v1") return { data: "load-1", error: null };
        if (name === "totvs_importar_mayor_lote_v1") {
          const rows = params.p_filas as unknown[];
          return params.p_modo === "validate"
            ? { data: { total: rows.length, conflictos: 0 }, error: null }
            : { data: { total: rows.length, insertadas: rows.length, sin_cambios: 0, vinculadas: rows.length, cuarentena: 1 }, error: null };
        }
        return { data: { estado: "COMPLETA" }, error: null };
      },
    };

    const result = await persistMayorFile({ file: xmlFile(), client });

    expect(result).toMatchObject({ cargaId: "load-1", lotes: 1, insertadas: 1, sinCambios: 0, vinculadas: 1, cuarentena: 1 });
    expect(calls.map((call) => call.name)).toEqual([
      "totvs_iniciar_mayor_carga_v1",
      "totvs_importar_mayor_lote_v1",
      "totvs_importar_mayor_lote_v1",
      "totvs_finalizar_mayor_carga_v1",
    ]);
    expect(calls[3].params.p_control).toMatchObject({ movimientos: 1, aperturas: 1, filas_tpsldo_1: 1, filas_tpsldo_9: 0, cuarentena: 1 });
  });

  it("cancela la carga si la validación encuentra una huella incompatible", async () => {
    const calls: string[] = [];
    const client: MayorRpcClient = {
      rpc: async (name) => {
        calls.push(name);
        if (name === "totvs_iniciar_mayor_carga_v1") return { data: "load-conflict", error: null };
        if (name === "totvs_importar_mayor_lote_v1") return { data: { conflictos: 1 }, error: null };
        return { data: null, error: null };
      },
    };

    await expect(persistMayorFile({ file: xmlFile(), client })).rejects.toThrow(/dos versiones/i);
    expect(calls.at(-1)).toBe("totvs_cancelar_mayor_carga_v1");
    expect(calls).not.toContain("totvs_finalizar_mayor_carga_v1");
  });

  it("pide aceptación explícita antes de activar cambios contables y cancela si se rechazan", async () => {
    const calls: string[] = [];
    const client: MayorRpcClient = {
      rpc: async (name) => {
        calls.push(name);
        if (name === "totvs_iniciar_mayor_carga_v1") return { data: "load-changed", error: null };
        if (name === "totvs_importar_mayor_lote_v1") return { data: {
          conflictos: 0, insertadas: 1, versionadas: 1,
          cambios_contables: 1, cambios_descriptivos: 0, vinculadas: 1,
        }, error: null };
        return { data: null, error: null };
      },
    };
    const confirmAccountingChanges = vi.fn(() => false);
    await expect(persistMayorFile({ file: xmlFile(), client, confirmAccountingChanges }))
      .rejects.toThrow(/requieren confirmación/i);
    expect(confirmAccountingChanges).toHaveBeenCalledWith({
      versionadas: 1, cambiosContables: 1, cambiosDescriptivos: 0,
      cambiosImporte: 0, cambiosCuenta: 0, cambiosCentro: 0, cambiosTipo: 0,
    });
    expect(calls.at(-1)).toBe("totvs_cancelar_mayor_carga_v1");
    expect(calls).not.toContain("totvs_finalizar_mayor_carga_v1");
  });
});


describe("diagnostico mayor sin backend", () => {
  it.each(["start", "validate", "persist", "finalize"])("preserva el fallo en %s aunque cancelar tambien falle", async (stage) => {
    const events: ImportProgressEvent[] = [];
    const calls: string[] = [];
    const remote = { code: "57014", message: "timeout original", details: "detalle original", hint: "pista original" };
    const client: MayorRpcClient = { rpc: async (name, params) => {
      calls.push(name);
      const actual = name.includes("iniciar") ? "start" : name.includes("finalizar") ? "finalize"
        : name.includes("cancelar") ? "cancel" : params.p_modo === "validate" ? "validate" : "persist";
      if (actual === stage) return { data: null, error: remote, status: 504, statusText: "Gateway Timeout" };
      if (actual === "cancel") return { data: null, error: { code: "08006", message: "cancelacion fallida" } };
      if (actual === "start") return { data: "load-test", error: null };
      return { data: { conflictos: 0, insertadas: 1 }, error: null };
    } };
    const failure = await persistMayorFile({ file: xmlFile(), client,  onProgress: event => events.push(event) }).catch(error => error);
    expect(failure).toMatchObject({ code: "57014", details: "detalle original", hint: "pista original", status: 504, stage: "mayor." + stage });
    expect(failure.durationMs).toBeGreaterThanOrEqual(0);
    if (stage === "validate" || stage === "persist") expect(failure).toMatchObject({ batch: 1, batchRows: 1 });
    const displayed = describeImportError(failure, "billing.validate");
    expect(displayed).toContain("Etapa: mayor." + stage);
    expect(displayed).toContain("timeout original");
    expect(displayed).toContain("57014");
    expect(displayed).not.toContain("billing.validate");
    expect(events.find(event => event.status === "failed")).toMatchObject({ phase: "mayor." + stage });
    expect(calls.filter(name => name.includes("cancelar"))).toHaveLength(stage === "start" ? 0 : 1);
    if (stage !== "start") expect(displayed).toContain("cancelacion fallida");
  });
});
