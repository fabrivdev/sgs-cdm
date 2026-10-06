import { describe, expect, it } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import { readMayorPreflightFile, type MayorImportRow } from "./mayorPreflight";

const headers = [
  "SUCURS", "ANOMES", "FECHA", "LOTE", "SUBLOTE", "DOCUMENTO", "LINEA",
  "SALDO01", "SALDO02", "HIST", "CUENTA", "DESC_CTA", "CCOSTO", "DESCCCOS",
  "ITEMC", "Cliente", "ORIGEN", "TIPO_MOV", "TPSLDO", "CLIFOR", "LOJA",
  "DOCASOC", "T_A", "FECH_INC", "USU_NOM", "ASIENTO",
];

function row(values: string[]) {
  return `<Row>${values.map((value) => `<Cell><Data ss:Type="String">${value}</Data></Cell>`).join("")}</Row>`;
}

describe("readMayorPreflightFile", () => {
  it("resume movimientos y excluye totalizadores sin materializar asientos", async () => {
    const first = ["01", "202607", "2026-07-01T00:00:00", "1", "1", "10", "1", "100", "2.5", "APERTURA", "1.1", "Caja", "10", "Centro", "", "", "ORI", "1", "1"];
    const second = ["02", "202607", "2026-07-02T00:00:00", "1", "1", "11", "1", "-100", "-2.5", "MOV", "2.1", "Ventas", "", "", "", "", "", "2", "9"];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <Workbook xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
        <Worksheet ss:Name="Mayor"><Table>
          ${row(headers)}${row(first)}${row(second)}${row(["Totales"])}${row(["", "", "", "", "", "", "", "0", "0"])}
        </Table></Worksheet>
      </Workbook>`;

    const result = await readMayorPreflightFile(new NodeBlob([xml]) as Blob, "mayor_contable.xml");

    expect(result.worksheetName).toBe("Mayor");
    expect(result.sourceRows).toBe(4);
    expect(result.movementRows).toBe(2);
    expect(result.footerRows).toBe(2);
    expect(result.from).toBe("2026-07-01");
    expect(result.to).toBe("2026-07-02");
    expect(result.branches).toBe(2);
    expect(result.accounts).toBe(2);
    expect(result.costCenters).toBe(1);
    expect(result.openings).toBe(1);
    expect(result.duplicateCandidateKeys).toBe(0);
    expect(result.currencies).toEqual({ SALDO01: "PYG", SALDO02: "USD" });
    expect(result.tpsldo["1"]).toEqual({ rows: 1, amountPyg: 100, amountUsd: 2.5 });
    expect(result.tpsldo["9"]).toEqual({ rows: 1, amountPyg: -100, amountUsd: -2.5 });
    expect(result.missing).toEqual({ account: 0, accountDescription: 0, costCenter: 1, origin: 1 });
    expect(result.signViolations).toEqual({ type1Negative: 0, type2Positive: 0 });
  });

  it("emite lotes de hasta 500 y conserva una cuenta vacía en cuarentena", async () => {
    const first = ["01", "202607", "2026-07-01T00:00:00", "1", "1", "10", "1", "100", "2.5", "APERTURA", "", "", "10", "Centro", "", "", "ORI", "1", "1"];
    const second = ["01", "202607", "2026-07-02T00:00:00", "1", "1", "11", "1", "-100", "-2.5", "MOV", "2.1", "Ventas", "", "", "", "", "", "2", "9"];
    const xml = `<Workbook xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Mayor"><Table>${row(headers)}${row(first)}${row(second)}${row(["Totales"])}</Table></Worksheet></Workbook>`;
    const batches: MayorImportRow[][] = [];

    await readMayorPreflightFile(new NodeBlob([xml]) as Blob, "mayor.xml", {
      batchSize: 1,
      onMovementBatch: (batch) => batches.push(batch),
    });

    expect(batches).toHaveLength(2);
    expect(batches.flat()).toHaveLength(2);
    expect(batches[0][0]).toMatchObject({
      clave_origen: "01|2026-07-01T00:00:00|1|1|10|1",
      fecha_movimiento: "2026-07-01",
      importe_pyg: 100,
      importe_usd: 2.5,
      cuenta_codigo: null,
      es_apertura: true,
      requiere_cuarentena: true,
      fila_origen: 2,
    });
    expect(batches[1][0].tipo_saldo).toBe("9");
  });
});
