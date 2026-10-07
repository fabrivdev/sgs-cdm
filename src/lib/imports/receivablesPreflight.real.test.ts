import { File as NodeFile } from "node:buffer";
import { readFile, stat } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { readReceivablesPreflightFile, type ReceivablesImportRow } from "./receivablesPreflight";

const fixturePath = process.env.TOTVS_CXC_FIXTURE;
const realIt = fixturePath ? it : it.skip;

describe("cuentas por cobrar real", () => {
  realIt("concilia el archivo entregado sin sumar VALOR como mora", async () => {
    const [bytes, info] = await Promise.all([readFile(fixturePath!), stat(fixturePath!)]);
    const file = new NodeFile([bytes], "cuentas_por_cobrar_a_la_fecha_114844.xml", { lastModified: info.mtimeMs }) as unknown as File;
    const batches: ReceivablesImportRow[][] = [];
    const result = await readReceivablesPreflightFile(file, file.name, {
      cutoffDate: "2026-10-07",
      sourceLastModified: file.lastModified,
      onDocumentBatch: (batch) => { batches.push(batch); },
    });

    expect(result).toMatchObject({
      worksheetName: "Cuentas Por Cobrar a la Fecha",
      sourceRows: 2683,
      documentRows: 2681,
      footerRows: 2,
      cutoffDate: "2026-10-07",
      cutoffEvidence: "USER_CONFIRMED",
      documents: 2565,
      installments: 2681,
      clients: 280,
      branches: 6,
      advisors: 18,
      currencyCodes: ["2"],
      currencies: ["USD"],
      documentTypes: { NCC: 48, NF: 2597, RA: 36 },
      grossValue: 14671081.8,
      sourceNetBalance: 8346529.29,
      positiveBalanceRows: 1280,
      positiveBalance: 8847391.38,
      zeroBalanceRows: 1380,
      negativeBalanceRows: 21,
      negativeBalance: -500862.09,
      eligibleInvoiceRows: 1278,
      eligiblePendingUsd: 8845483.46,
      overdueInvoiceRows: 986,
      overdueUsd: 3920103.16,
      dueTodayInvoiceRows: 1,
      dueTodayUsd: 1213.77,
      futureInvoiceRows: 291,
      futureUsd: 4924166.53,
      excludedPositiveNonInvoiceRows: 2,
      excludedPositiveNonInvoiceUsd: 1907.92,
      customerAdvanceRows: 36,
      customerAdvanceBalance: -498713.1,
      customerAdvancePositiveRows: 1,
      customerAdvancePositiveBalance: 1714.69,
      customerAdvanceZeroRows: 17,
      customerAdvanceNegativeRows: 18,
      customerAdvanceNegativeBalance: -500427.79,
      customerAdvanceLinkedRows: 0,
      customerAdvanceApplicationCoverage: "SIN_VINCULO_EXPLICITO",
      exactDuplicateRows: 0,
      conflictingDuplicateKeys: 0,
    });
    expect(batches.map((batch) => batch.length)).toEqual([500, 500, 500, 500, 500, 181]);
    expect(batches.flat()).toHaveLength(2681);
    expect(batches.flat().every((row) => row.moneda === "USD" && row.fecha_corte === "2026-10-07")).toBe(true);
    expect(batches.flat().filter((row) => row.tipo_documento === "RA").every((row) => row.naturaleza_documento === "CUSTOMER_ADVANCE" && !row.elegible_kpi)).toBe(true);
  });
});
