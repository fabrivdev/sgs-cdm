import type { CanonicalImportEnvelope, CanonicalSupplierRow } from "@/lib/imports/canonical";
import { normalizeText } from "@/lib/imports/fiscal";
import { normalizeStableKey } from "@/lib/imports/mappings";
import type { SpreadsheetXmlSheet } from "@/lib/imports/xmlSpreadsheet";

const EXPECTED_HEADERS = [
  "Codigo", "Tienda", "Razon Social", "RUC", "N Fantasía", "Direccion", "DEPART",
  "Municipio", "E-Mail", "Teléfono", "PAIS", "Ag. Ret.IVA?", "Ag. Ret.IVA?_2", "ESTADO",
];
const value = (row: Record<string, unknown>, header: string) => row[header];
const text = (row: Record<string, unknown>, header: string) => normalizeText(value(row, header));
const display = (row: Record<string, unknown>, header: string) => String(value(row, header) ?? "").trim().replace(/\s+/g, " ");

function validateHeaders(sheet: SpreadsheetXmlSheet) {
  const mismatches = EXPECTED_HEADERS.flatMap((expected, index) => sheet.headers[index] === expected ? [] : [expected]);
  if (mismatches.length || sheet.headers.length !== EXPECTED_HEADERS.length) {
    throw new Error(`Maestro de proveedores: estructura inesperada; columnas distintas: ${mismatches.slice(0, 3).join(", ") || "cantidad de columnas"}.`);
  }
}

export function mapSupplierSheet(sourceFileName: string, sheet: SpreadsheetXmlSheet): CanonicalImportEnvelope<CanonicalSupplierRow> {
  validateHeaders(sheet);
  const seen = new Set<string>();
  const rows = sheet.rows.map((raw, index): CanonicalSupplierRow => {
    const sourceRow = index + 2;
    const supplierCode = text(raw, "Codigo");
    const store = text(raw, "Tienda");
    const legalName = display(raw, "Razon Social");
    if (!supplierCode || !store || !legalName) throw new Error(`Maestro de proveedores: fila ${sourceRow} sin Codigo, Tienda o Razon Social.`);
    const rowId = [supplierCode, store].map(normalizeStableKey).join("|");
    if (seen.has(rowId)) throw new Error(`Maestro de proveedores: Codigo + Tienda repetido en fila ${sourceRow}.`);
    seen.add(rowId);
    const values = [
      supplierCode, store, legalName, text(raw, "RUC"), display(raw, "N Fantasía"), display(raw, "Direccion"),
      display(raw, "DEPART"), display(raw, "Municipio"), display(raw, "E-Mail"), display(raw, "Teléfono"),
      display(raw, "PAIS"), text(raw, "Ag. Ret.IVA?"), text(raw, "Ag. Ret.IVA?_2"), display(raw, "ESTADO"),
    ];
    return {
      rowId, sourceFileName, sourceRow, supplierCode, store, legalName, taxId: values[3] || null,
      tradeName: values[4] || null, address: values[5] || null, department: values[6] || null,
      municipality: values[7] || null, email: values[8] || null, phone: values[9] || null,
      country: values[10] || null, withholdingFlag1: values[11] || null, withholdingFlag2: values[12] || null,
      status: values[13] || null, sourceFingerprint: JSON.stringify(values), raw,
    };
  });
  return { sourceSystem: "totvs_proveedores", sourceFileName, worksheetName: sheet.name, importedAt: new Date().toISOString(), rows };
}

export function mergeSupplierRows(rows: CanonicalSupplierRow[]) {
  const merged = new Map<string, CanonicalSupplierRow>();
  let duplicatesSkipped = 0;
  for (const row of rows) {
    const previous = merged.get(row.rowId);
    if (!previous) merged.set(row.rowId, row);
    else if (previous.sourceFingerprint !== row.sourceFingerprint) throw new Error(`Maestro de proveedores: la clave ${row.rowId} difiere entre archivos.`);
    else duplicatesSkipped += 1;
  }
  return { rows: [...merged.values()], duplicatesSkipped };
}

export function mapCanonicalSupplierToRow(row: CanonicalSupplierRow) {
  return {
    codigo: row.supplierCode, tienda: row.store, razon_social: row.legalName, ruc: row.taxId,
    nombre_fantasia: row.tradeName, direccion: row.address, departamento: row.department,
    municipio: row.municipality, email: row.email, telefono: row.phone, pais: row.country,
    retencion_bandera_1: row.withholdingFlag1, retencion_bandera_2: row.withholdingFlag2,
    estado: row.status, archivo_origen: row.sourceFileName, fila_origen: row.sourceRow,
    huella_origen: row.sourceFingerprint, datos_fuente: row.raw,
  };
}
