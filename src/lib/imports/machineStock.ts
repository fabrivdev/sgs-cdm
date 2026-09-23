import type { CanonicalImportEnvelope, CanonicalMachineRegistryRow, CanonicalMachineStockRow } from "@/lib/imports/canonical";
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
  const rows: CanonicalMachineStockRow[] = [];

  sheet.rows.forEach((raw, index) => {
    const productCode = text(raw, ["Producto", "CODIGO", "Código"]);
    if (!productCode) return;

    const branchRaw = text(raw, ["FILIAL"]);
    const chassis = text(raw, ["CHASIS", "CHASSIS", "SERIE"]);
    const sourceRow = index + 2;
    const identity = chassis
      ? `CHASIS-${normalizeStableKey(chassis)}`
      : `PRODUCTO-${normalizeStableKey(productCode)}-${normalizeStableKey(branchRaw)}-${normalizeStableKey(text(raw, ["DEPOSITO", "DEPÓSITO", "LOCAL"]))}`;
    const row: CanonicalMachineStockRow = {
      rowId: `${identity}-FILA-${sourceRow}`,
      sourceRow,
      productCode: productCode.trim(),
      branch: normalizeBranch(branchRaw),
      branchRaw,
      warehouse: text(raw, ["DEPOSITO", "DEPÓSITO", "LOCAL"]),
      machineType: text(raw, ["TIPO"]),
      brand: text(raw, ["MARCA"]),
      model: text(raw, ["MODELO"]),
      condition: normalizeCondition(value(raw, ["ESTADO"])),
      chassis,
      balance: parseFlexibleNumber(value(raw, ["Saldo Actual", "SALDO ACTUAL", "SALDO"])) ?? 0,
      raw,
    };

    rows.push(row);
  });

  return {
    sourceSystem: "new_xml_machine_stock",
    sourceFileName,
    worksheetName: sheet.name,
    importedAt: new Date().toISOString(),
    rows,
  };
}

export function mapMachineRegistrySheet(
  sourceFileName: string,
  sheet: SpreadsheetXmlSheet,
): CanonicalImportEnvelope<CanonicalMachineRegistryRow> {
  const rows: CanonicalMachineRegistryRow[] = [];

  sheet.rows.forEach((raw, index) => {
    const productCode = text(raw, ["CODPRO", "Producto", "CODIGO", "Código"]);
    if (!productCode) return;
    const sourceRow = index + 2;
    rows.push({
      rowId: `PRODUCTO-${normalizeStableKey(productCode)}-FILA-${sourceRow}`,
      sourceRow,
      productCode: productCode.trim(),
      chassis: text(raw, ["CHASIS", "CHASSIS", "SERIE"]),
      machineType: text(raw, ["TIPO"]),
      brand: text(raw, ["MARCA"]),
      model: text(raw, ["MODELO"]),
      raw,
    });
  });

  return {
    sourceSystem: "new_xml_machine_registry",
    sourceFileName,
    worksheetName: sheet.name,
    importedAt: new Date().toISOString(),
    rows,
  };
}

export interface MachineStockChassisReconciliation {
  rows: CanonicalMachineStockRow[];
  matched: number;
  filledFromRegistry: number;
  unresolvedPlaceholders: number;
  ambiguousProductCodes: number;
  validConflicts: number;
}

const INVALID_CHASSIS_VALUES = new Set(["SINCHASIS", "NOINFORMADO", "PENDIENTE", "N/A", "S/N", "SN"]);

function isPlaceholderChassis(row: CanonicalMachineStockRow) {
  const chassis = normalizeStableKey(row.chassis);
  if (!chassis || INVALID_CHASSIS_VALUES.has(chassis)) return true;
  return [row.model, row.machineType, row.brand, row.productCode]
    .some((candidate) => candidate && normalizeStableKey(candidate) === chassis);
}

export function reconcileMachineStockChassis(
  stockRows: CanonicalMachineStockRow[],
  registryRows: CanonicalMachineRegistryRow[],
): MachineStockChassisReconciliation {
  const registryByProduct = new Map<string, CanonicalMachineRegistryRow[]>();
  for (const row of registryRows) {
    const key = normalizeStableKey(row.productCode);
    if (!key) continue;
    registryByProduct.set(key, [...(registryByProduct.get(key) ?? []), row]);
  }

  let matched = 0;
  let filledFromRegistry = 0;
  let unresolvedPlaceholders = 0;
  let ambiguousProductCodes = 0;
  let validConflicts = 0;

  const rows = stockRows.map((stockRow) => {
    const candidates = registryByProduct.get(normalizeStableKey(stockRow.productCode)) ?? [];
    if (!candidates.length) {
      if (isPlaceholderChassis(stockRow)) unresolvedPlaceholders += 1;
      return stockRow;
    }
    if (candidates.length !== 1) {
      ambiguousProductCodes += 1;
      if (isPlaceholderChassis(stockRow)) unresolvedPlaceholders += 1;
      return stockRow;
    }

    matched += 1;
    const registryChassis = normalizeText(candidates[0].chassis) || null;
    if (isPlaceholderChassis(stockRow)) {
      if (!registryChassis) {
        unresolvedPlaceholders += 1;
        return stockRow;
      }
      filledFromRegistry += 1;
      return {
        ...stockRow,
        chassis: registryChassis,
        raw: {
          ...stockRow.raw,
          CHASIS_STOCK_ORIGINAL: stockRow.chassis,
          CHASIS_RESPALDO_MAQUINARIAS: registryChassis,
          CHASIS_FUENTE: "maquinarias_por_codpro",
        },
      };
    }

    if (registryChassis && normalizeStableKey(registryChassis) !== normalizeStableKey(stockRow.chassis)) {
      validConflicts += 1;
    }
    return stockRow;
  });

  return { rows, matched, filledFromRegistry, unresolvedPlaceholders, ambiguousProductCodes, validConflicts };
}

export function mapCanonicalMachineStockToRow(row: CanonicalMachineStockRow) {
  const stockKey = row.chassis
    ? `CHASIS:${normalizeStableKey(row.chassis)}`
    : `PRODUCTO:${normalizeStableKey(row.productCode)}:${normalizeStableKey(row.branch)}:${normalizeStableKey(row.warehouse)}:FILA:${row.sourceRow}`;
  return {
    producto_codigo: row.productCode,
    stock_key: stockKey,
    source_row: row.sourceRow,
    sucursal: row.branch,
    filial_original: row.branchRaw,
    deposito: row.warehouse,
    tipo: row.machineType,
    marca: row.brand,
    modelo: row.model,
    estado: row.condition,
    chasis: row.chassis,
    saldo_actual: row.balance,
    datos_fuente: row.raw,
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
