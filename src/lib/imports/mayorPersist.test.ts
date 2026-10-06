import { File as NodeFile } from "node:buffer";
import { describe, expect, it } from "vitest";
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
  return new NodeFile([xml], "mayor.xml", { type: "application/xml" }) as File;
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

    await expect(persistMayorFile({ file: xmlFile(), client })).rejects.toThrow(/otra huella/i);
    expect(calls.at(-1)).toBe("totvs_cancelar_mayor_carga_v1");
    expect(calls).not.toContain("totvs_finalizar_mayor_carga_v1");
  });
});
