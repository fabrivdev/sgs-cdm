import type { CanonicalImportEnvelope, CanonicalKardexRow } from "@/lib/imports/canonical";
import { normalizeCompactDate, normalizeDateLike, normalizeText, normalizeUpper, parseFlexibleNumber } from "@/lib/imports/fiscal";
import type { SpreadsheetXmlSheet } from "@/lib/imports/xmlSpreadsheet";

const REQUIRED_HEADERS = [
  "FECHA", "FILIAL", "DEPOSITO", "Descripcion", "PRODUCTO", "Descripcion_2",
  "CANTIDAD", "C_U_G", "C_U_D_2", "C_U_D_3", "C_T_G", "C_T_D_2", "C_T_D_3",
  "CF", "DOCUMENTO", "SECUENCIA", "MONEDA", "T_C", "TABLA", "TIPO", "RECNO",
] as const;

const headerKey = (value: unknown) => normalizeUpper(value).replace(/\s+/g, "");

function value(row: Record<string, unknown>, header: string) {
  const wanted = headerKey(header);
  const found = Object.entries(row).find(([candidate]) => headerKey(candidate) === wanted);
  return found?.[1] ?? null;
}

function text(row: Record<string, unknown>, header: string) {
  return normalizeText(value(row, header));
}

function displayText(row: Record<string, unknown>, header: string) {
  return String(value(row, header) ?? "").trim().replace(/\s+/g, " ");
}

function stableFingerprint(values: unknown[]) {
  return JSON.stringify(values.map((item) => item == null ? null : item));
}

function requiredNumber(row: Record<string, unknown>, header: string, sourceRow: number) {
  const raw = String(value(row, header) ?? "").trim();
  if (!raw || !/\d/.test(raw)) {
    throw new Error(`Kardex: fila ${sourceRow} con ${header} no num\u00e9rico o vac\u00edo.`);
  }
  return parseFlexibleNumber(raw);
}

export interface KardexDiagnostics {
  rows: number;
  from: string | null;
  to: string | null;
  branches: number;
  warehouses: number;
  currencyCodes: string[];
  duplicateKeys: number;
}

export type KardexImportEnvelope = CanonicalImportEnvelope<CanonicalKardexRow> & {
  diagnostics: KardexDiagnostics;
};

export function mapKardexSheet(sourceFileName: string, sheet: SpreadsheetXmlSheet): KardexImportEnvelope {
  const present = new Set(sheet.headers.map(headerKey));
  const missing = REQUIRED_HEADERS.filter((header) => !present.has(headerKey(header)));
  if (missing.length) {
    throw new Error(`Kardex: faltan columnas requeridas: ${missing.join(", ")}.`);
  }

  const seen = new Set<string>();
  let duplicateKeys = 0;
  const rows = sheet.rows.map((raw, index): CanonicalKardexRow => {
    const sourceRow = index + 2;
    const sourceTable = text(raw, "TABLA").toUpperCase();
    const sourceRecno = text(raw, "RECNO");
    const movementDate = normalizeDateLike(value(raw, "FECHA")) ?? normalizeCompactDate(value(raw, "FECHA"));
    const branch = text(raw, "FILIAL");
    const warehouse = text(raw, "DEPOSITO");
    const productCode = text(raw, "PRODUCTO");
    const direction = text(raw, "TIPO").toUpperCase();
    const documentKind = text(raw, "CF").toUpperCase();
    const documentNumber = text(raw, "DOCUMENTO");
    const sequence = text(raw, "SECUENCIA");
    const currencyCode = text(raw, "MONEDA");

    const missingValues = [
      ["FECHA", movementDate], ["FILIAL", branch], ["DEPOSITO", warehouse],
      ["PRODUCTO", productCode], ["CF", documentKind], ["DOCUMENTO", documentNumber],
      ["SECUENCIA", sequence], ["MONEDA", currencyCode], ["TABLA", sourceTable], ["RECNO", sourceRecno],
    ].filter(([, fieldValue]) => !fieldValue).map(([name]) => name);
    if (missingValues.length) {
      throw new Error(`Kardex: fila ${sourceRow} sin ${missingValues.join(", ")}.`);
    }
    if (direction !== "E" && direction !== "S") {
      throw new Error(`Kardex: fila ${sourceRow} con TIPO inv\u00e1lido (${direction || "vac\u00edo"}).`);
    }

    const rowId = `${sourceTable}:${sourceRecno}`;
    if (seen.has(rowId)) duplicateKeys += 1;
    seen.add(rowId);

    const numericValues = [
      requiredNumber(raw, "CANTIDAD", sourceRow),
      requiredNumber(raw, "C_U_G", sourceRow),
      requiredNumber(raw, "C_U_D_2", sourceRow),
      requiredNumber(raw, "C_U_D_3", sourceRow),
      requiredNumber(raw, "C_T_G", sourceRow),
      requiredNumber(raw, "C_T_D_2", sourceRow),
      requiredNumber(raw, "C_T_D_3", sourceRow),
      requiredNumber(raw, "T_C", sourceRow),
    ];
    const [quantity, unitCostGs, unitCostCurrency2, unitCostCurrency3, totalCostGs, totalCostCurrency2, totalCostCurrency3, exchangeRate] = numericValues;
    const warehouseDescription = displayText(raw, "Descripcion") || null;
    const productDescription = displayText(raw, "Descripcion_2") || null;
    const movementDetail = displayText(raw, "TIPO_MOVIMIENTO") || null;
    const series = text(raw, "SERIE") || null;
    const counterpartyCode = text(raw, "CLIFOR") || null;
    const counterpartyStore = text(raw, "LOJA") || null;
    const productGroup = text(raw, "Grupo") || null;
    const accountingAccount = text(raw, "Cta.Contable") || null;
    const fingerprint = stableFingerprint([
      movementDate, branch, warehouse, warehouseDescription, productCode, productDescription, quantity,
      unitCostGs, unitCostCurrency2, unitCostCurrency3,
      totalCostGs, totalCostCurrency2, totalCostCurrency3,
      movementDetail, documentKind, documentNumber, sequence, currencyCode, exchangeRate,
      sourceTable, direction, sourceRecno, series, counterpartyCode, counterpartyStore,
      productGroup, accountingAccount,
    ]);

    return {
      rowId,
      sourceFileName,
      sourceRow,
      movementDate: movementDate!,
      branch,
      warehouse,
      warehouseDescription,
      productCode,
      productDescription,
      quantity,
      unitCostGs,
      unitCostCurrency2,
      unitCostCurrency3,
      totalCostGs,
      totalCostCurrency2,
      totalCostCurrency3,
      movementDetail,
      documentKind,
      documentNumber,
      sequence,
      currencyCode,
      exchangeRate,
      sourceTable,
      direction: direction as "E" | "S",
      sourceRecno,
      series,
      counterpartyCode,
      counterpartyStore,
      productGroup,
      accountingAccount,
      sourceFingerprint: fingerprint,
      raw,
    };
  });

  if (duplicateKeys) {
    throw new Error(`Kardex: ${duplicateKeys} clave(s) TABLA + RECNO repetida(s) dentro de ${sourceFileName}.`);
  }

  const dates = rows.map((row) => row.movementDate).sort();
  return {
    sourceSystem: "totvs_kardex_analitico",
    sourceFileName,
    worksheetName: sheet.name,
    importedAt: new Date().toISOString(),
    rows,
    diagnostics: {
      rows: rows.length,
      from: dates[0] ?? null,
      to: dates[dates.length - 1] ?? null,
      branches: new Set(rows.map((row) => row.branch)).size,
      warehouses: new Set(rows.map((row) => row.warehouse)).size,
      currencyCodes: [...new Set(rows.map((row) => row.currencyCode))].sort(),
      duplicateKeys,
    },
  };
}

export interface KardexMergeResult {
  rows: CanonicalKardexRow[];
  duplicatesSkipped: number;
}

const KARDEX_CONFLICT_FIELDS: Array<[keyof CanonicalKardexRow, string]> = [
  ["movementDate", "fecha"], ["branch", "filial"], ["warehouse", "dep\u00f3sito"],
  ["warehouseDescription", "descripci\u00f3n dep\u00f3sito"], ["productCode", "producto"],
  ["productDescription", "descripci\u00f3n producto"], ["quantity", "cantidad"],
  ["unitCostGs", "costo unitario Gs"], ["unitCostCurrency2", "costo unitario moneda 2"],
  ["unitCostCurrency3", "costo unitario moneda 3"], ["totalCostGs", "costo total Gs"],
  ["totalCostCurrency2", "costo total moneda 2"], ["totalCostCurrency3", "costo total moneda 3"],
  ["movementDetail", "detalle movimiento"], ["documentKind", "especie"],
  ["documentNumber", "documento"], ["sequence", "secuencia"], ["currencyCode", "moneda"],
  ["exchangeRate", "tipo de cambio"], ["direction", "direcci\u00f3n"], ["series", "serie"],
  ["counterpartyCode", "contraparte"], ["counterpartyStore", "tienda contraparte"],
  ["productGroup", "grupo"], ["accountingAccount", "cuenta contable"],
];

const KARDEX_COST_FIELDS = new Set<keyof CanonicalKardexRow>([
  "unitCostGs", "unitCostCurrency2", "unitCostCurrency3",
  "totalCostGs", "totalCostCurrency2", "totalCostCurrency3",
]);

function changedConflictFields(previous: CanonicalKardexRow, current: CanonicalKardexRow) {
  return KARDEX_CONFLICT_FIELDS.filter(([field]) => previous[field] !== current[field]);
}

function describeConflict(previous: CanonicalKardexRow, current: CanonicalKardexRow) {
  const fields = changedConflictFields(previous, current).map(([, label]) => label);
  return `${current.rowId} difiere en ${fields.slice(0, 5).join(", ") || "contenido"} entre ${previous.sourceFileName} (fila ${previous.sourceRow}) y ${current.sourceFileName} (fila ${current.sourceRow})`;
}

export function mergeKardexRows(rows: CanonicalKardexRow[]): KardexMergeResult {
  const merged = new Map<string, CanonicalKardexRow>();
  let duplicatesSkipped = 0;
  let conflictCount = 0;
  let costOnlyConflictCount = 0;
  let nonMonetaryConflictCount = 0;
  const conflictExamples: string[] = [];
  for (const row of rows) {
    const previous = merged.get(row.rowId);
    if (!previous) {
      merged.set(row.rowId, row);
      continue;
    }
    if (previous.sourceFingerprint !== row.sourceFingerprint) {
      conflictCount += 1;
      const changedFields = changedConflictFields(previous, row);
      if (changedFields.every(([field]) => KARDEX_COST_FIELDS.has(field))) costOnlyConflictCount += 1;
      else nonMonetaryConflictCount += 1;
      if (conflictExamples.length < 3) conflictExamples.push(describeConflict(previous, row));
      continue;
    }
    duplicatesSkipped += 1;
  }
  if (conflictCount) {
    throw new Error(
      `Kardex: ${conflictCount.toLocaleString("es-PY")} claves TABLA + RECNO tienen versiones contradictorias: ${costOnlyConflictCount.toLocaleString("es-PY")} cambian solo costos y ${nonMonetaryConflictCount.toLocaleString("es-PY")} cambian campos no monetarios. No se import\u00f3 ninguna para evitar elegir un archivo arbitrariamente. ${conflictExamples.join("; ")}.`,
    );
  }
  return { rows: [...merged.values()], duplicatesSkipped };
}

export function mapCanonicalKardexToRow(row: CanonicalKardexRow) {
  return {
    tabla_origen: row.sourceTable,
    recno_origen: row.sourceRecno,
    fecha_movimiento: row.movementDate,
    filial: row.branch,
    deposito: row.warehouse,
    deposito_descripcion: row.warehouseDescription,
    producto_codigo: row.productCode,
    producto_descripcion: row.productDescription,
    cantidad: row.quantity,
    costo_unitario_gs: row.unitCostGs,
    costo_unitario_moneda_2: row.unitCostCurrency2,
    costo_unitario_moneda_3: row.unitCostCurrency3,
    costo_total_gs: row.totalCostGs,
    costo_total_moneda_2: row.totalCostCurrency2,
    costo_total_moneda_3: row.totalCostCurrency3,
    movimiento_detalle: row.movementDetail,
    especie_documento: row.documentKind,
    documento: row.documentNumber,
    secuencia: row.sequence,
    moneda_codigo: row.currencyCode,
    tipo_cambio: row.exchangeRate,
    direccion: row.direction,
    serie: row.series,
    contraparte_codigo: row.counterpartyCode,
    contraparte_tienda: row.counterpartyStore,
    grupo_producto: row.productGroup,
    cuenta_contable: row.accountingAccount,
    archivo_origen: row.sourceFileName,
    fila_origen: row.sourceRow,
    huella_origen: row.sourceFingerprint,
    datos_fuente: row.raw,
  };
}
