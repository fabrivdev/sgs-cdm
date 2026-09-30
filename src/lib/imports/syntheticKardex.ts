import type { CanonicalImportEnvelope, CanonicalSyntheticKardexRow } from "@/lib/imports/canonical";
import { normalizeText, parseFlexibleNumber } from "@/lib/imports/fiscal";
import { normalizeStableKey } from "@/lib/imports/mappings";
import type { SpreadsheetXmlSheet } from "@/lib/imports/xmlSpreadsheet";

const EXPECTED_HEADERS = [
  "SUCURSAL", "CODIGO", "PRODUCTO", "DEPOSITO", "Chasis", "SALDO",
  "PPP1", "VALOR_1", "PPP2", "VALOR_2", "PPP3", "VALOR_3",
];

const value = (row: Record<string, unknown>, header: string) => row[header];
const text = (row: Record<string, unknown>, header: string) => normalizeText(value(row, header));
const displayText = (row: Record<string, unknown>, header: string) =>
  String(value(row, header) ?? "").trim().replace(/\s+/g, " ");

function requiredNumber(row: Record<string, unknown>, header: string, sourceRow: number) {
  const raw = String(value(row, header) ?? "").trim();
  if (!raw || !/[0-9]/.test(raw)) {
    throw new Error(`Kardex sint\u00e9tico: fila ${sourceRow} con ${header} no num\u00e9rico o vac\u00edo.`);
  }
  return parseFlexibleNumber(raw);
}

function validateHeaders(sheet: SpreadsheetXmlSheet) {
  const actual = sheet.headers.slice(0, EXPECTED_HEADERS.length);
  const mismatches = EXPECTED_HEADERS.flatMap((expected, index) =>
    actual[index] === expected ? [] : [`columna ${index + 1}: se esperaba "${expected}" y lleg\u00f3 "${actual[index] ?? "vac\u00eda"}"`],
  );
  if (mismatches.length || sheet.headers.length !== EXPECTED_HEADERS.length) {
    throw new Error(`Kardex sint\u00e9tico: estructura inesperada. ${mismatches.slice(0, 3).join("; ")}`);
  }
}

function fingerprint(values: unknown[]) {
  return JSON.stringify(values.map((item) => item == null ? null : item));
}

export function syntheticValueDiffersFromBalance(row: Pick<CanonicalSyntheticKardexRow, "balance" | "averageCost1" | "inventoryValue1">) {
  const calculated = Number((row.balance * row.averageCost1).toFixed(2));
  const reported = Number(row.inventoryValue1.toFixed(2));
  return Math.abs(calculated - reported) > 0.020000001;
}

export interface SyntheticKardexDiagnostics {
  rows: number;
  branches: number;
  warehouses: number;
  products: number;
  chassisRows: number;
  positiveBalances: number;
  negativeBalances: number;
  zeroBalances: number;
  valueFormulaMismatches: number;
  valuationDate: null;
}

export type SyntheticKardexEnvelope = CanonicalImportEnvelope<CanonicalSyntheticKardexRow> & {
  diagnostics: SyntheticKardexDiagnostics;
};

export function mapSyntheticKardexSheet(sourceFileName: string, sheet: SpreadsheetXmlSheet): SyntheticKardexEnvelope {
  validateHeaders(sheet);
  const seen = new Set<string>();

  const rows = sheet.rows.map((raw, index): CanonicalSyntheticKardexRow => {
    const sourceRow = index + 2;
    const branch = text(raw, "SUCURSAL");
    const productCode = text(raw, "CODIGO");
    const warehouse = text(raw, "DEPOSITO");
    if (!branch || !productCode || !warehouse) {
      throw new Error(`Kardex sint\u00e9tico: fila ${sourceRow} sin SUCURSAL, CODIGO o DEPOSITO.`);
    }
    const chassis = text(raw, "Chasis") || null;
    const balance = requiredNumber(raw, "SALDO", sourceRow);
    const averageCost1 = requiredNumber(raw, "PPP1", sourceRow);
    const inventoryValue1 = requiredNumber(raw, "VALOR_1", sourceRow);
    const averageCost2 = requiredNumber(raw, "PPP2", sourceRow);
    const inventoryValue2 = requiredNumber(raw, "VALOR_2", sourceRow);
    const averageCost3 = requiredNumber(raw, "PPP3", sourceRow);
    const inventoryValue3 = requiredNumber(raw, "VALOR_3", sourceRow);
    const productDescription = displayText(raw, "PRODUCTO") || null;
    const rowId = [branch, productCode, warehouse, chassis ?? "SIN_CHASIS"].map(normalizeStableKey).join("|");
    if (seen.has(rowId)) {
      throw new Error(`Kardex sint\u00e9tico: clave SUCURSAL + CODIGO + DEPOSITO + Chasis repetida en fila ${sourceRow}.`);
    }
    seen.add(rowId);
    const sourceFingerprint = fingerprint([
      branch, productCode, productDescription, warehouse, chassis, balance,
      averageCost1, inventoryValue1, averageCost2, inventoryValue2, averageCost3, inventoryValue3,
    ]);
    return {
      rowId, sourceFileName, sourceRow, branch, productCode, productDescription, warehouse,
      chassis, balance, averageCost1, inventoryValue1, averageCost2, inventoryValue2,
      averageCost3, inventoryValue3, sourceFingerprint, raw,
    };
  });

  return {
    sourceSystem: "totvs_kardex_sintetico",
    sourceFileName,
    worksheetName: sheet.name,
    importedAt: new Date().toISOString(),
    rows,
    diagnostics: {
      rows: rows.length,
      branches: new Set(rows.map((row) => row.branch)).size,
      warehouses: new Set(rows.map((row) => row.warehouse)).size,
      products: new Set(rows.map((row) => row.productCode)).size,
      chassisRows: rows.filter((row) => row.chassis).length,
      positiveBalances: rows.filter((row) => row.balance > 0).length,
      negativeBalances: rows.filter((row) => row.balance < 0).length,
      zeroBalances: rows.filter((row) => row.balance === 0).length,
      valueFormulaMismatches: rows.filter(syntheticValueDiffersFromBalance).length,
      valuationDate: null,
    },
  };
}

export function mergeSyntheticKardexRows(rows: CanonicalSyntheticKardexRow[]) {
  const merged = new Map<string, CanonicalSyntheticKardexRow>();
  let duplicatesSkipped = 0;
  for (const row of rows) {
    const previous = merged.get(row.rowId);
    if (!previous) {
      merged.set(row.rowId, row);
      continue;
    }
    if (previous.sourceFingerprint !== row.sourceFingerprint) {
      throw new Error(
        `Kardex sint\u00e9tico: la clave ${row.rowId} difiere entre ${previous.sourceFileName} (fila ${previous.sourceRow}) y ${row.sourceFileName} (fila ${row.sourceRow}).`,
      );
    }
    duplicatesSkipped += 1;
  }
  return { rows: [...merged.values()], duplicatesSkipped };
}

export function mapCanonicalSyntheticKardexToRow(row: CanonicalSyntheticKardexRow) {
  return {
    sucursal: row.branch,
    producto_codigo: row.productCode,
    producto_descripcion: row.productDescription,
    deposito: row.warehouse,
    chasis: row.chassis,
    saldo: row.balance,
    ppp_1: row.averageCost1,
    valor_1: row.inventoryValue1,
    ppp_2: row.averageCost2,
    valor_2: row.inventoryValue2,
    ppp_3: row.averageCost3,
    valor_3: row.inventoryValue3,
    archivo_origen: row.sourceFileName,
    fila_origen: row.sourceRow,
    huella_origen: row.sourceFingerprint,
    datos_fuente: row.raw,
  };
}
