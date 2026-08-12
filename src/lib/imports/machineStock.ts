import type { CanonicalImportEnvelope, CanonicalMachineStockRow } from "@/lib/imports/canonical";
import { normalizeText, normalizeUpper, parseFlexibleNumber } from "@/lib/imports/fiscal";
import { normalizeStableKey } from "@/lib/imports/mappings";
import type { SpreadsheetXmlSheet } from "@/lib/imports/xmlSpreadsheet";

const value = (row: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const found = Object.entries(row).find(([header]) => normalizeUpper(header) === normalizeUpper(key));
    if (found && normalizeText(found[1])) return found[1];
  }
  return null;
};

const text = (row: Record<string, unknown>, keys: string[]) => normalizeText(value(row, keys)) || null;

function normalizeBranch(raw: unknown) {
  const normalized = normalizeUpper(raw);
  if (normalized.includes("SANTA RITA") || /^01\b/.test(normalized)) return "Santa Rita";
  if (normalized.includes("SANTA ROSA") || /^02\b/.test(normalized)) return "Santa Rosa";
  if (normalized.includes("CAMPO 9") || normalized.includes("CAMPO NUEVE") || /^03\b/.test(normalized)) return "Campo 9";
  if (normalized.includes("MISIONES") || normalized.includes("SAN JUAN BAUTISTA") || /^04\b/.test(normalized)) return "Misiones";
  if (normalized.includes("LOMA PLATA") || /^05\b/.test(normalized)) return "Loma Plata";
  if (normalized.includes("KATUETE") || /^06\b/.test(normalized)) return "Katuete";
  return null;
}

function normalizeCondition(raw: unknown): CanonicalMachineStockRow["condition"] {
  const normalized = normalizeUpper(raw);
  if (normalized.includes("NUEV")) return "Nuevo";
  if (normalized.includes("USAD")) return "Usado";
  return null;
}

export function mapMachineStockSheet(
  sourceFileName: string,
  sheet: SpreadsheetXmlSheet,
): CanonicalImportEnvelope<CanonicalMachineStockRow> {
  const byProduct = new Map<string, CanonicalMachineStockRow>();

  sheet.rows.forEach((raw, index) => {
    const productCode = text(raw, ["Producto", "CODIGO", "Código"]);
    if (!productCode) return;

    const branchRaw = text(raw, ["FILIAL"]);
    const row: CanonicalMachineStockRow = {
      rowId: normalizeStableKey(productCode) || `machine-stock-${index + 1}`,
      productCode: productCode.trim(),
      branch: normalizeBranch(branchRaw),
      branchRaw,
      warehouse: text(raw, ["DEPOSITO", "DEPÓSITO", "LOCAL"]),
      machineType: text(raw, ["TIPO"]),
      brand: text(raw, ["MARCA"]),
      model: text(raw, ["MODELO"]),
      condition: normalizeCondition(value(raw, ["ESTADO"])),
      chassis: text(raw, ["CHASIS", "CHASSIS", "SERIE"]),
      balance: parseFlexibleNumber(value(raw, ["Saldo Actual", "SALDO ACTUAL", "SALDO"])) ?? 0,
      raw,
    };

    const previous = byProduct.get(row.rowId);
    byProduct.set(row.rowId, previous ? { ...row, balance: previous.balance + row.balance } : row);
  });

  return {
    sourceSystem: "new_xml_machine_stock",
    sourceFileName,
    worksheetName: sheet.name,
    importedAt: new Date().toISOString(),
    rows: [...byProduct.values()],
  };
}

export function mapCanonicalMachineStockToRow(row: CanonicalMachineStockRow) {
  return {
    producto_codigo: row.productCode,
    sucursal: row.branch,
    filial_original: row.branchRaw,
    deposito: row.warehouse,
    tipo: row.machineType,
    marca: row.brand,
    modelo: row.model,
    estado: row.condition,
    chasis: row.chassis,
    saldo_actual: row.balance,
    importado_en: new Date().toISOString(),
  };
}

export function parseMachineStockXml(sourceFileName: string, xmlText: string) {
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(xmlText, "application/xml");
  const parserError = documentNode.getElementsByTagName("parsererror")[0];
  if (parserError) throw new Error(parserError.textContent || "No se pudo leer el XML de stock de maquinarias");

  const namespace = "urn:schemas-microsoft-com:office:spreadsheet";
  const worksheet = documentNode.getElementsByTagNameNS(namespace, "Worksheet")[0];
  const table = worksheet?.getElementsByTagNameNS(namespace, "Table")[0];
  const xmlRows = table ? Array.from(table.getElementsByTagNameNS(namespace, "Row")) : [];
  const matrix = xmlRows.map((row) => Array.from(row.getElementsByTagNameNS(namespace, "Cell")).map((cell) => cell.getElementsByTagNameNS(namespace, "Data")[0]?.textContent?.trim() ?? ""));
  const headers = matrix[0] ?? [];
  const sheet: SpreadsheetXmlSheet = {
    name: worksheet?.getAttributeNS(namespace, "Name") ?? "Stock de Maquinarias",
    headers,
    rows: matrix.slice(1).filter((row) => row.some(Boolean)).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]))),
  };
  return mapMachineStockSheet(sourceFileName, sheet);
}
