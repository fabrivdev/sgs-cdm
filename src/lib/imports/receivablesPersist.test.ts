import { File as NodeFile } from "node:buffer";
import { describe, expect, it } from "vitest";
import { persistReceivablesFile, type ReceivablesRpcClient } from "./receivablesPersist";

const headers = [
  "Suc. Orig", "DOCUMENTO", "Tipo", "SERIE", "CUOTA", "Fch Emision", "Vencimiento",
  "VALOR", "SALDO", "Moneda", "Tasa moneda", "Modalidad", "CLIENTE", "Nombre", "ASESOR",
  "Vencto Orig", "Condicion",
];

function xmlFile() {
  const cells = (values: string[]) => values.map((value) => `<Cell><Data>${value}</Data></Cell>`).join("");
  const values = ["01", "100", "NF", "FE1", "1", "2026-10-07T00:00:00", "2026-10-06T00:00:00", "100", "80", "2", "1", "001", "CLI-1", "Cliente", "Asesor", "2026-10-06T00:00:00", "Credito"];
  const xml = `<?xml version="1.0"?><Workbook><Worksheet><Table><Row>${cells(headers)}</Row><Row>${cells(values)}</Row><Row>${cells(["Totales"])}</Row></Table></Worksheet></Workbook>`;
  return new NodeFile([xml], "cuentas_por_cobrar_a_la_fecha_120000.xml", {
    type: "application/xml",
    lastModified: new Date(2026, 9, 7, 12).getTime(),
  }) as unknown as File;
}

describe("persistReceivablesFile", () => {
  it("inicia, valida, importa y finaliza con controles conciliados", async () => {
    const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
    const client: ReceivablesRpcClient = {
      rpc: async (name, params) => {
        calls.push({ name, params });
        if (name === "totvs_iniciar_cxc_carga_v1") return { data: { carga_id: "load-1", estado: "VALIDANDO", reutilizada: false, snapshot_version: 1, reemplaza_carga_id: null }, error: null };
        if (name === "totvs_importar_cxc_lote_v1") {
          const rows = params.p_filas as unknown[];
          return params.p_modo === "validate"
            ? { data: { conflictos: 0 }, error: null }
            : { data: { insertadas: rows.length, sin_cambios: 0, vinculadas: rows.length }, error: null };
        }
        return { data: { estado: "COMPLETA" }, error: null };
      },
    };

    const result = await persistReceivablesFile({ file: xmlFile(), client, cutoffDate: "2026-10-07" });

    expect(result).toMatchObject({ cargaId: "load-1", lotes: 1, insertadas: 1, sinCambios: 0, vinculadas: 1, snapshotVersion: 1, reusedCompleteSnapshot: false });
    expect(calls.map((call) => call.name)).toEqual([
      "totvs_iniciar_cxc_carga_v1",
      "totvs_importar_cxc_lote_v1",
      "totvs_importar_cxc_lote_v1",
      "totvs_finalizar_cxc_carga_v1",
    ]);
    expect(calls[3].params.p_control).toMatchObject({
      documentos: 1,
      saldo_pendiente_elegible_usd: 80,
      facturas_vencidas: 1,
      saldo_vencido_usd: 80,
      facturas_vence_hoy: 0,
      anticipos_cliente: 0,
      saldo_anticipos_cliente_usd: 0,
      anticipos_cliente_vinculados: 0,
      cobertura_aplicacion_anticipos: "SIN_VINCULO_EXPLICITO",
    });
  });

  it("reutiliza el mismo snapshot completo por SHA sin volver a escribir", async () => {
    const calls: string[] = [];
    const client: ReceivablesRpcClient = {
      rpc: async (name) => {
        calls.push(name);
        return { data: { carga_id: "load-repeat", estado: "COMPLETA", reutilizada: true, snapshot_version: 1, reemplaza_carga_id: null }, error: null };
      },
    };

    const result = await persistReceivablesFile({ file: xmlFile(), client, cutoffDate: "2026-10-07" });
    expect(result).toMatchObject({ insertadas: 0, sinCambios: 1, vinculadas: 1, snapshotVersion: 1, reusedCompleteSnapshot: true });
    expect(calls).toEqual(["totvs_iniciar_cxc_carga_v1"]);
  });

  it("cancela si una clave del mismo corte tiene otra huella", async () => {
    const calls: string[] = [];
    const client: ReceivablesRpcClient = {
      rpc: async (name) => {
        calls.push(name);
        if (name === "totvs_iniciar_cxc_carga_v1") return { data: { carga_id: "load-conflict", estado: "VALIDANDO", reutilizada: false, snapshot_version: 2, reemplaza_carga_id: "old-load" }, error: null };
        if (name === "totvs_importar_cxc_lote_v1") return { data: { conflictos: 1 }, error: null };
        return { data: null, error: null };
      },
    };

    await expect(persistReceivablesFile({ file: xmlFile(), client, cutoffDate: "2026-10-07" })).rejects.toThrow(/otra huella/i);
    expect(calls.at(-1)).toBe("totvs_cancelar_cxc_carga_v1");
    expect(calls).not.toContain("totvs_finalizar_cxc_carga_v1");
  });
});
