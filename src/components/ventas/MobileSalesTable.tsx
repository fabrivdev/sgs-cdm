import { useId, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Eye, SlidersHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ResponsiveDrawer, ResponsiveDrawerBody, ResponsiveDrawerHeader } from "@/components/ui/responsive-drawer";
import { cn } from "@/lib/utils";
import { salesDate, type SalesColumn, type SalesSort } from "./salesTableInteraction";
import { SalesSortButton } from "./SalesTableControls";

type Column<T> = SalesColumn<T> & { render?: (row: T) => ReactNode };
const number = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 });
function mobileSalesValue<T>(column: Column<T>, row: T): ReactNode {
  if (column.render) return column.render(row);
  const value = column.value(row);
  if (value == null || value === "") return "—";
  if (column.kind === "date") return salesDate(value)?.toLocaleDateString("es-PY") ?? String(value);
  if (typeof value === "number") {
    if (column.excelFormat?.includes("%")) return `${number.format(value * 100)}%`;
    return `${column.excelFormat?.includes("$") ? "$ " : ""}${number.format(value)}`;
  }
  return String(value);
}

/** Presentation only: sorting, pagination and complete Excel exports stay with the caller. */
export function MobileSalesTable<T>({ title, rows, columns, rowKey, sort, toggleSort, primaryKey, metricKey,
  footer, onRowClick, selected, embedded = false, empty = "Sin registros para los filtros seleccionados.",
}: {
  title: string; rows: readonly T[]; columns: readonly Column<T>[]; rowKey: (row: T) => string;
  sort: SalesSort; toggleSort: (key: string) => void; primaryKey?: string; metricKey?: string;
  embedded?: boolean;
  footer?: T; onRowClick?: (row: T) => void; selected?: (row: T) => boolean; empty?: string;
}) {
  const id = useId();
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [metric, setMetric] = useState(metricKey ?? ["neto", "total", "facturado", "mo_total"].find(key => columns.some(c => c.key === key)) ?? columns.find(c => c.kind === "number")?.key);
  const primary = columns.find(c => c.key === primaryKey) ?? columns[0];
  const amount = columns.find(c => c.key === metric && c.key !== primary?.key) ?? columns.find(c => c.key !== primary?.key);
  const detail = rows.find(row => rowKey(row) === detailKey);
  if (!primary || !amount) return null;
  const shown = [primary, amount];
  const amountAlign = amount.align ?? (amount.kind === "number" ? "right" : "left");
  const renderRow = (row: T, isFooter = false) => <tr key={isFooter ? "total" : rowKey(row)} className={cn("border-t", selected?.(row) && "bg-primary/5", isFooter && "bg-muted/30 font-semibold")}>
    <td className="min-w-0 pl-2 text-left">
      {isFooter ? <span>Total</span> : !onRowClick && primary.render ? <div className="flex min-h-11 min-w-0 items-center overflow-hidden">{mobileSalesValue(primary, row)}</div> : <button type="button" className="block min-h-11 w-full truncate text-left font-medium underline-offset-4 focus-visible:underline" onClick={() => onRowClick ? onRowClick(row) : setDetailKey(rowKey(row))} aria-pressed={onRowClick ? selected?.(row) : undefined}>{mobileSalesValue(primary, row)}</button>}
    </td>
    <td className={cn("px-1 tabular-nums", amountAlign === "center" ? "text-center" : amountAlign === "right" ? "text-right" : "text-left", amount.kind === "number" ? "whitespace-nowrap" : "truncate")}>{mobileSalesValue(amount, row)}</td>
    <td>{!isFooter && <button type="button" aria-label={`Ver detalle de ${String(primary.value(row) ?? "registro")}`} onClick={() => setDetailKey(rowKey(row))} className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"><Eye className="h-4 w-4" /></button>}</td>
  </tr>;
  const controls = <Popover><PopoverTrigger asChild><button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md" aria-label={`Columnas y orden de ${title}`}><SlidersHorizontal className="h-4 w-4" /></button></PopoverTrigger>
    <PopoverContent align="end" className="w-[min(360px,calc(100vw-2rem))] p-2">
    <div className="grid grid-cols-2 gap-2 border-b p-2">
      <label htmlFor={`${id}-metric`} className="min-w-0 text-[11px] text-muted-foreground">Mostrar
        <select id={`${id}-metric`} value={amount.key} onChange={e => setMetric(e.target.value)} className="mt-1 h-11 w-full min-w-0 rounded-md border bg-background px-2 text-base text-foreground">
          {columns.filter(c => c.key !== primary.key).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </label>
      <label htmlFor={`${id}-sort`} className="min-w-0 text-[11px] text-muted-foreground">Ordenar
        <select id={`${id}-sort`} value={sort.key} onChange={e => toggleSort(e.target.value)} className="mt-1 h-11 w-full min-w-0 rounded-md border bg-background px-2 text-base text-foreground">
          {columns.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </label>
    </div>
    <button type="button" aria-label={`Invertir orden: ${sort.direction === "asc" ? "ascendente" : "descendente"}`} onClick={()=>toggleSort(sort.key)} className="flex min-h-11 w-full items-center justify-end gap-2 border-b px-3 text-[12px] text-muted-foreground">
      {sort.direction === "asc" ? "Orden ascendente" : "Orden descendente"}{sort.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
    </button>
    </PopoverContent></Popover>;
  return <section aria-label={title} className={cn("min-w-0 overflow-hidden", !embedded && "rounded-md border")}>
    {!embedded && <div className="flex items-center justify-between gap-2 border-b pl-3"><h3 className="text-[13px] font-semibold">{title}</h3>{controls}</div>}
    <table className="w-full table-fixed text-[13px] [&_th_button]:min-h-11 [&_th_span]:whitespace-normal [&_th_span]:overflow-visible" aria-label={title}>
      <colgroup><col /><col className="w-[42%]" /><col className="w-11" /></colgroup>
      <thead className="bg-muted/40 text-[11px] text-muted-foreground"><tr>{shown.map(c => <th key={c.key} className="px-2 py-0" aria-sort={sort.key === c.key ? sort.direction === "asc" ? "ascending" : "descending" : "none"}>
        <SalesSortButton label={c.label} kind={c.kind} align={c === amount ? amountAlign : "left"} active={sort.key === c.key} direction={sort.direction} onClick={() => toggleSort(c.key)} />
      </th>)}<th className="p-0"><span className="sr-only">Detalle</span>{embedded && controls}</th></tr></thead>
      <tbody>{rows.length ? rows.map(row => renderRow(row)) : <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">{empty}</td></tr>}</tbody>
      {footer && rows.length > 0 && <tfoot>{renderRow(footer, true)}</tfoot>}
    </table>
    <ResponsiveDrawer open={detail !== undefined} onOpenChange={open => { if (!open) setDetailKey(null); }}>
      <ResponsiveDrawerHeader><h2 className="text-base font-semibold">{title} · detalle</h2></ResponsiveDrawerHeader>
      <ResponsiveDrawerBody><dl className="divide-y">{detail && columns.map(c => <div key={c.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 py-3 text-[13px]">
        <dt className="text-muted-foreground">{c.label}</dt><dd className="break-words text-right tabular-nums">{mobileSalesValue(c, detail)}</dd>
      </div>)}</dl></ResponsiveDrawerBody>
    </ResponsiveDrawer>
  </section>;
}
