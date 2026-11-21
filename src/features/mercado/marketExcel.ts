import type { ExportCell } from "@/components/exports/TableExportButton";
import type { WorkBook } from "xlsx";

export type MarketExcelRow = ExportCell[];
export const excelPercent = "0.0%";
export const excelMoney = '"$"#,##0.00';

export function appendMarketSheet(xlsx: typeof import("xlsx"), book: WorkBook, name: string, rows: MarketExcelRow[],
  formats: Readonly<Record<string, string>> = {}) {
  const sheet = xlsx.utils.aoa_to_sheet(rows);
  const widths = rows[0].map((header) => Math.max(10, String(header).length + 3));
  for (const row of rows.slice(1)) row.forEach((value, index) => {
    widths[index] = Math.max(widths[index], String(value ?? "").length + 2);
  });
  sheet["!cols"] = widths.map((width) => ({ wch: Math.min(42, width) }));
  rows[0].forEach((header, column) => {
    const title = String(header);
    const format = formats[title] ?? (title === "Δ %" || title.startsWith("Cuota ") ? excelPercent : title === "Δ p. p." ? "0.0" : null);
    if (!format) return;
    for (let row = 1; row < rows.length; row++) {
      const cell = sheet[xlsx.utils.encode_cell({ r: row, c: column })];
      if (cell?.t === "n") cell.z = format;
    }
  });
  xlsx.utils.book_append_sheet(book, sheet, name);
}
