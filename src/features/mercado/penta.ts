import type { WorkSheet } from "xlsx";
import type { Movement } from "./model";

export type SourceRow = Record<string, unknown>;
export type SourceFile = Pick<File, "name" | "arrayBuffer">;
export type MonthRange = { start: number; end: number };
export type MarketUpload = { rows: Movement[]; period?: MonthRange };

export const sourceText = (value: unknown) => String(value ?? "").trim();
export const sourceUpper = (value: unknown) =>
  sourceText(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase();
export const monthIndex = (year: number, month: number) =>
  year * 12 + month - 1;

export async function readSourceWorkbook(file: SourceFile, sheets: string[]) {
  const XLSX = await import("xlsx");
  const book = XLSX.read(await file.arrayBuffer(), { sheets });
  const rows = (sheet: WorkSheet) =>
    XLSX.utils
      .sheet_to_json<SourceRow>(sheet)
      .map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key.trim().replace(/\s+/g, " "),
            value,
          ]),
        ),
      );
  const date = (value: unknown): [number, number] => {
    if (typeof value === "number") {
      const parts = XLSX.SSF.parse_date_code(value);
      if (parts) return [parts.y, parts.m];
    }
    const iso = sourceText(value).match(/^(\d{4})-(\d{2})-/);
    if (iso) return [Number(iso[1]), Number(iso[2])];
    const local = sourceText(value).match(/^\d{1,2}[/-](\d{1,2})[/-](\d{4})/);
    if (local) return [Number(local[2]), Number(local[1])];
    throw new Error("Hay una fecha de despacho sin formato válido.");
  };
  function extract(expectedNcm: RegExp) {
    const sheet = book.Sheets.SubItems;
    const parameters = book.Sheets["Parámetros"];
    if (!sheet || !parameters)
      throw new Error(
        "Seleccioná el Excel original de Penta/PYimport con SubItems y Parámetros.",
      );
    const metadata = XLSX.utils
      .sheet_to_json<unknown[]>(parameters, { header: 1 })
      .flat()
      .map(sourceUpper);
    const range = metadata
      .find((line) => /^PERIODO\b/.test(line))
      ?.match(/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2})\/(\d{4})/);
    if (!range)
      throw new Error(file.name + " debe declarar el período en Parámetros.");
    const ncm = metadata.find((line) => /^CODIGO NCM\b/.test(line)) ?? "";
    if (!expectedNcm.test(ncm))
      throw new Error(
        file.name + " no corresponde a la familia de máquinas seleccionada.",
      );
    const [, startMonth, startYear, endMonth, endYear] = range.map(Number);
    const start = monthIndex(startYear, startMonth);
    const end = monthIndex(endYear, endMonth);
    if (
      startMonth < 1 ||
      endMonth > 12 ||
      startMonth > 12 ||
      endMonth < 1 ||
      startYear < 2000 ||
      endYear > 2100 ||
      start > end
    )
      throw new Error(file.name + " declara un período inválido.");
    return { name: file.name, start, end, rows: rows(sheet) };
  }
  return { book, rows, date, extract };
}
