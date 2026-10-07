import { Blob as NodeBlob } from "node:buffer";
import { describe, expect, it } from "vitest";
import { readReceivablesPreflightFile, type ReceivablesImportRow } from "./receivablesPreflight";

const headers = [
  "Suc. Orig", "DOCUMENTO", "Tipo", "SERIE", "CUOTA", "Fch Emision", "Vencimiento",
  "VALOR", "SALDO", "Moneda", "Tasa moneda", "Modalidad", "CLIENTE", "Nombre", "ASESOR",
  "Vencto Orig", "Condicion",
];

function row(values: string[]) {
  return `<Row>${values.map((value) => `<Cell><Data ss:Type="String">${value}</Data></Cell>`).join("")}</Row>`;
}

function document(overrides: Partial<Record<typeof headers[number], string>> = {}) {
  const base: Record<typeof headers[number], string> = {
    "Suc. Orig": "01",
    DOCUMENTO: "100",
    Tipo: "NF",
    SERIE: "FE1",
    CUOTA: "1",
    "Fch Emision": "2026-10-01T00:00:00",
    Vencimiento: "2026-10-06T00:00:00",
    VALOR: "100",
    SALDO: "100",
    Moneda: "2",
    "Tasa moneda": "1",
    Modalidad: "001",
    CLIENTE: "CLI-1",
    Nombre: "Cliente uno",
    ASESOR: "Asesor",
    "Vencto Orig": "2026-10-06T00:00:00",
    Condicion: "Credito",
  };
  const values = { ...base, ...overrides };
  return headers.map((header) => values[header]);
}

function workbook(rows: string[][], includedHeaders = headers) {
  return `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Cuentas Por Cobrar a la Fecha"><Table>${row(includedHeaders)}${rows.map(row).join("")}</Table></Worksheet></Workbook>`;
}

describe("readReceivablesPreflightFile", () => {
  it("usa SALDO de facturas USD positivas y separa vencido, vence hoy, futuro, cero, negativos y otros tipos", async () => {
    const rows = [
      document(),
      document({ DOCUMENTO: "101", "Fch Emision": "2026-10-07T00:00:00", Vencimiento: "2026-10-07T00:00:00", SALDO: "50" }),
      document({ DOCUMENTO: "102", Vencimiento: "2026-10-08T00:00:00", SALDO: "75" }),
      document({ DOCUMENTO: "103", SALDO: "0" }),
      document({ DOCUMENTO: "104", SALDO: "-10" }),
      document({ DOCUMENTO: "105", Tipo: "NCC", SERIE: "CE1", VALOR: "-20", SALDO: "-20", Modalidad: "DEVOL" }),
      document({ DOCUMENTO: "106", Tipo: "RA", SERIE: "REC", VALOR: "-5", SALDO: "5", "Vencto Orig": "" }),
      ["Totales"],
      ["", "", "", "", "", "", "", "300", "200", "0", "0"],
    ];
    const batches: ReceivablesImportRow[][] = [];

    const result = await readReceivablesPreflightFile(new NodeBlob([workbook(rows)]) as Blob, "cxc.xml", {
      cutoffDate: "2026-10-07",
      batchSize: 2,
      sourceLastModified: new Date(2026, 9, 7, 12).getTime(),
      onDocumentBatch: (batch) => { batches.push(batch); },
    });

    expect(result).toMatchObject({
      worksheetName: "Cuentas Por Cobrar a la Fecha",
      sourceRows: 9,
      documentRows: 7,
      footerRows: 2,
      cutoffDate: "2026-10-07",
      cutoffEvidence: "USER_CONFIRMED",
      positiveBalanceRows: 4,
      zeroBalanceRows: 1,
      negativeBalanceRows: 2,
      eligibleInvoiceRows: 3,
      eligiblePendingUsd: 225,
      overdueInvoiceRows: 1,
      overdueUsd: 100,
      dueTodayInvoiceRows: 1,
      dueTodayUsd: 50,
      futureInvoiceRows: 1,
      futureUsd: 75,
      excludedPositiveNonInvoiceRows: 1,
      excludedPositiveNonInvoiceUsd: 5,
      customerAdvanceRows: 1,
      customerAdvanceBalance: 5,
      customerAdvancePositiveRows: 1,
      customerAdvancePositiveBalance: 5,
      customerAdvanceZeroRows: 0,
      customerAdvanceNegativeRows: 0,
      customerAdvanceNegativeBalance: 0,
      customerAdvanceLinkedRows: 0,
      customerAdvanceApplicationCoverage: "SIN_VINCULO_EXPLICITO",
      missingOriginalDueDate: 1,
    });
    expect(batches.map((batch) => batch.length)).toEqual([2, 2, 2, 1]);
    expect(batches.flat()[0]).toMatchObject({
      clave_origen: "2026-10-07|01|NF|FE1|100|1|CLI-1",
      moneda: "USD",
      elegible_kpi: true,
    });
    expect(batches.flat().find((item) => item.tipo_documento === "RA")).toMatchObject({
      naturaleza_documento: "CUSTOMER_ADVANCE",
      elegible_kpi: false,
    });
  });

  it("conserva anticipos RA positivos, cero y negativos sin aplicarlos a facturas", async () => {
    const rows = [
      document({ DOCUMENTO: "201", Tipo: "RA", SERIE: "REC", SALDO: "5", "Vencto Orig": "" }),
      document({ DOCUMENTO: "202", Tipo: "RA", SERIE: "REC", SALDO: "0", "Vencto Orig": "" }),
      document({ DOCUMENTO: "203", Tipo: "RA", SERIE: "REC", SALDO: "-30", "Vencto Orig": "" }),
    ];
    const emitted: ReceivablesImportRow[][] = [];
    const result = await readReceivablesPreflightFile(new NodeBlob([workbook(rows)]) as Blob, "ra.xml", {
      cutoffDate: "2026-10-07",
      onDocumentBatch: (batch) => { emitted.push(batch); },
    });

    expect(result).toMatchObject({
      customerAdvanceRows: 3,
      customerAdvanceBalance: -25,
      customerAdvancePositiveRows: 1,
      customerAdvancePositiveBalance: 5,
      customerAdvanceZeroRows: 1,
      customerAdvanceNegativeRows: 1,
      customerAdvanceNegativeBalance: -30,
      customerAdvanceLinkedRows: 0,
      customerAdvanceApplicationCoverage: "SIN_VINCULO_EXPLICITO",
      eligibleInvoiceRows: 0,
      eligiblePendingUsd: 0,
    });
    expect(emitted.flat().every((item) => item.naturaleza_documento === "CUSTOMER_ADVANCE" && !item.elegible_kpi)).toBe(true);
  });

  it("no descuenta nuevamente un RA del SALDO pendiente de una NF", async () => {
    const result = await readReceivablesPreflightFile(new NodeBlob([workbook([
      document({ DOCUMENTO: "301", Tipo: "NF", SALDO: "100", Vencimiento: "2026-10-06T00:00:00" }),
      document({ DOCUMENTO: "302", Tipo: "RA", SERIE: "REC", VALOR: "-30", SALDO: "-30", "Vencto Orig": "" }),
    ])]) as Blob, "nf-ra.xml", { cutoffDate: "2026-10-07" });

    expect(result).toMatchObject({
      sourceNetBalance: 70,
      eligibleInvoiceRows: 1,
      eligiblePendingUsd: 100,
      overdueInvoiceRows: 1,
      overdueUsd: 100,
      customerAdvanceRows: 1,
      customerAdvanceBalance: -30,
    });
  });

  it("omite duplicados exactos y bloquea una misma clave con otra huella", async () => {
    const same = document();
    const exact = await readReceivablesPreflightFile(new NodeBlob([workbook([same, same])]) as Blob, "cxc.xml", { cutoffDate: "2026-10-01" });
    expect(exact.documentRows).toBe(1);
    expect(exact.exactDuplicateRows).toBe(1);

    const changed = document({ SALDO: "99" });
    await expect(readReceivablesPreflightFile(new NodeBlob([workbook([same, changed])]) as Blob, "cxc.xml", { cutoffDate: "2026-10-01" })).rejects.toThrow(/contenido distinto/i);
  });

  it("rechaza corte distinto, moneda desconocida y columnas faltantes", async () => {
    await expect(readReceivablesPreflightFile(new NodeBlob([workbook([document()])]) as Blob, "cxc.xml", { cutoffDate: "2026-09-30" })).rejects.toThrow(/anterior/i);
    await expect(readReceivablesPreflightFile(new NodeBlob([workbook([document({ Moneda: "9" })])]) as Blob, "cxc.xml", { cutoffDate: "2026-10-01" })).rejects.toThrow(/moneda no soportado/i);
    await expect(readReceivablesPreflightFile(new NodeBlob([workbook([document({ Moneda: "1" })])]) as Blob, "cxc.xml", { cutoffDate: "2026-10-01" })).rejects.toThrow(/única moneda USD/i);
    const shortHeaders = headers.filter((header) => header !== "SALDO");
    const shortRow = document().filter((_, index) => headers[index] !== "SALDO");
    await expect(readReceivablesPreflightFile(new NodeBlob([workbook([shortRow], shortHeaders)]) as Blob, "cxc.xml", { cutoffDate: "2026-10-01" })).rejects.toThrow(/SALDO/);
  });
});
