import { useMemo, useState } from "react";

export type SalesValue = string | number | Date | null | undefined;
export type SalesSort = { key: string; direction: "asc" | "desc" };
export type SalesColumn<T> = {
  key: string; label: string; kind: "text" | "number" | "date";
  value: (row: T) => SalesValue;
  exportValue?: (row: T) => SalesValue;
  align?: "left" | "center" | "right";
  excelFormat?: string;
};
const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true });

export function salesDate(value: SalesValue): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}
function comparable<T>(value: SalesValue, kind: SalesColumn<T>["kind"]): string | number | null {
  if (value == null || (typeof value === "string" && !value.trim())) return null;
  if (kind === "date") return salesDate(value)?.getTime() ?? null;
  if (kind === "number") return typeof value === "number" && Number.isFinite(value) ? value : null;
  return String(value).trim();
}

// Operates only on a complete result. Paged reports must sort in SQL first.
// Stable ties and nulls-last in BOTH directions preserve every financial line.
export function sortSalesRows<T>(rows: readonly T[], columns: readonly SalesColumn<T>[], sort: SalesSort): T[] {
  const column = columns.find(item => item.key === sort.key);
  if (!column) return [...rows];
  const direction = sort.direction === "asc" ? 1 : -1;
  return rows.map((row, index) => ({ row, index, value: comparable(column.value(row), column.kind) }))
    .sort((a, b) => {
      if (a.value == null || b.value == null) return a.value == null && b.value == null ? a.index - b.index : a.value == null ? 1 : -1;
      const comparison = typeof a.value === "number" && typeof b.value === "number"
        ? a.value - b.value : collator.compare(String(a.value), String(b.value));
      return comparison * direction || a.index - b.index;
    }).map(item => item.row);
}

export function useSalesTableSort<T>(rows: readonly T[], columns: readonly SalesColumn<T>[], initial: SalesSort) {
  const [sort, setSort] = useState<SalesSort>(initial);
  const ordered = useMemo(() => sortSalesRows(rows, columns, sort), [rows, columns, sort]);
  const toggleSort = (key: string) => setSort(previous => ({ key, direction: previous.key === key && previous.direction === "asc" ? "desc" : "asc" }));
  return { ordered, sort, toggleSort };
}
