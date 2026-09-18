import { money } from "@/components/dashboard/utils";
import type { SalesDisplayColumn } from "./SalesDataTable";

const decimal = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 });
export const dollars = '"$" #,##0.00;"$" -#,##0.00';
export function serviceMoneyColumn<T>(key: string, label: string, value: (row: T) => number): SalesDisplayColumn<T> {
  return { key, label, kind: "number", value, align: "right", excelFormat: dollars,
    render: row => money(value(row)), className: key === "neto" || key === "total" ? "font-semibold" : "text-muted-foreground" };
}
export function serviceNumberColumn<T>(key: string, label: string, value: (row: T) => number | null): SalesDisplayColumn<T> {
  return { key, label, kind: "number", value, align: "center", render: row => value(row) == null ? "—" : decimal.format(value(row)!) };
}
export function serviceShareColumn<T>(value: (row: T) => number | null, key = "participacion", label = "Participación"): SalesDisplayColumn<T> {
  return { key, label, kind: "number", value, align: "right", excelFormat: "0%", render: row => {
    const share = value(row);
    return share == null ? "—" : `${Math.round(share * 100)}%`;
  } };
}
