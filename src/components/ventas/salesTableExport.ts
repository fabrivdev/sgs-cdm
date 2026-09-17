import * as XLSX from "xlsx";
import { salesDate, type SalesColumn, type SalesValue } from "./salesTableInteraction";

// Build from typed values, NEVER from DOM text, truncated labels or formatted $.
// Text cells remain text, including leading zeros and formula-like descriptions.
export function createSalesWorkbook<T>(rows: readonly T[], columns: readonly SalesColumn<T>[], sheetName: string) {
  const values = rows.map(row => columns.map(column => {
    const value: SalesValue = (column.exportValue ?? column.value)(row);
    if (value == null || value === "") return null;
    if (column.kind === "number") {
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Cantidad o importe inválido para exportar.");
      return value;
    }
    if (column.kind === "date") {
      const date = salesDate(value);
      if (!date) throw new Error("Fecha inválida para exportar.");
      return date;
    }
    return String(value);
  }));
  const sheet = XLSX.utils.aoa_to_sheet([columns.map(column => column.label), ...values]);
  columns.forEach((column, index) => {
    const format = column.excelFormat ?? (column.kind === "date" ? "dd/mm/yy" : column.kind === "number" ? "0.####" : "@");
    for (let row = 1; row <= rows.length; row++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: index })];
      if (cell) cell.z = format;
    }
  });
  sheet["!cols"] = columns.map(column => ({ wch: Math.min(50, Math.max(12, column.label.length + 2)) }));
  if (rows.length) sheet["!autofilter"] = { ref: sheet["!ref"]! };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  return workbook;
}

export function exportSalesTable<T>({ rows, columns, sheetName, fileName }: {
  rows: readonly T[]; columns: readonly SalesColumn<T>[]; sheetName: string; fileName: string;
}) {
  XLSX.writeFile(createSalesWorkbook(rows, columns, sheetName), fileName, { bookType: "xlsx" });
}
