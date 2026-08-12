export interface CriticidadImportItem {
  codigo_interno: string | null;
  codigo_fabricante: string | null;
  criticidad: "V" | "E" | "D";
}

export interface CriticidadWorkbookResult {
  items: CriticidadImportItem[];
  filasLeidas: number;
  filasInvalidas: number;
  hoja: string;
  marcas: string[];
}

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase();
}

function asCode(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return Number.isInteger(value) ? String(value) : String(value);
  const text = String(value).trim();
  return text || null;
}

function asCriticidad(value: unknown): "V" | "E" | "D" | null {
  const normalized = normalizeHeader(value);
  if (normalized === "V" || normalized === "VITAL") return "V";
  if (normalized === "E" || normalized === "ESENCIAL") return "E";
  if (normalized === "D" || normalized === "DESEABLE") return "D";
  return null;
}

export async function leerCriticidadesDesdeExcel(file: File): Promise<CriticidadWorkbookResult> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", raw: true });
  const sheetName = workbook.SheetNames.find((name) => normalizeHeader(name) === "MATRIZ");
  if (!sheetName) throw new Error("El archivo no contiene una hoja llamada MATRIZ");

  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    defval: null,
    raw: true,
  });
  const headerIndex = rows.findIndex((row) => {
    const headers = row.map(normalizeHeader);
    return headers.includes("CODMERC") && headers.includes("CRITICIDAD");
  });
  if (headerIndex < 0) throw new Error("No se encontraron las columnas Cód. Merc y CRITICIDAD en MATRIZ");

  const headers = rows[headerIndex].map(normalizeHeader);
  const internalIndex = headers.indexOf("CODMERC");
  const manufacturerIndex = headers.findIndex((header) => header === "CODFABR" || header === "CODFABRICANTE");
  const criticalityIndex = headers.indexOf("CRITICIDAD");
  const brandIndex = headers.indexOf("MARCA");
  if (manufacturerIndex < 0) throw new Error("No se encontró la columna Cód. Fabr. en MATRIZ");

  let invalidRows = 0;
  const brands = new Set<string>();
  const deduplicated = new Map<string, CriticidadImportItem>();
  for (const row of rows.slice(headerIndex + 1)) {
    if (brandIndex >= 0 && row[brandIndex]) brands.add(String(row[brandIndex]).trim().toUpperCase());
    const internalCode = asCode(row[internalIndex]);
    const manufacturerCode = asCode(row[manufacturerIndex]);
    const criticality = asCriticidad(row[criticalityIndex]);
    if (!criticality || (!internalCode && !manufacturerCode)) {
      if (row.some((cell) => cell !== null && cell !== "")) invalidRows += 1;
      continue;
    }
    const item: CriticidadImportItem = {
      codigo_interno: internalCode,
      codigo_fabricante: manufacturerCode,
      criticidad: criticality,
    };
    deduplicated.set(`${internalCode ?? ""}|${manufacturerCode ?? ""}`, item);
  }

  return {
    items: [...deduplicated.values()],
    filasLeidas: rows.length - headerIndex - 1,
    filasInvalidas: invalidRows,
    hoja: sheetName,
    marcas: [...brands],
  };
}
