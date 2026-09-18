import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SalesSortButton } from "@/components/ventas/SalesTableControls";
import type { SalesColumn, SalesSort } from "@/components/ventas/salesTableInteraction";
import { cn } from "@/lib/utils";

export type CompactListColumn<T> = SalesColumn<T> & {
  width: string;
  hiddenBelow?: "sm" | "md" | "lg" | "xl";
  render?: (row: T) => ReactNode;
  title?: (row: T) => string;
  className?: string;
};
const visibility = {
  sm: ["hidden sm:table-column", "hidden sm:table-cell"],
  md: ["hidden md:table-column", "hidden md:table-cell"],
  lg: ["hidden lg:table-column", "hidden lg:table-cell"],
  xl: ["hidden xl:table-column", "hidden xl:table-cell"],
};
const axis = (align?: SalesColumn<unknown>["align"]) => align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";

/** Presentation only: callers supply their complete, filtered, ordered rows. */
export function CompactListTable<T>({ rows, columns, id, label, sort, onSort, heading, status, onSelect, rowClassName, actions }: {
  rows: readonly T[]; columns: readonly CompactListColumn<T>[]; id: (row: T) => string; label: string;
  sort?: SalesSort; onSort?: (key: string) => void; heading?: (key: string) => ReactNode;
  status?: ReactNode; onSelect?: (row: T) => void; rowClassName?: (row: T) => string;
  actions?: { width: string; render: (row: T) => ReactNode };
}) {
  return <Table className="table-fixed" aria-label={label}>
    <colgroup>{columns.map(column => <col key={column.key} className={cn(column.width, column.hiddenBelow && visibility[column.hiddenBelow][0])} />)}
      {actions && <col className={actions.width} />}</colgroup>
    <TableHeader><TableRow>{columns.map(column => <TableHead key={column.key}
      className={cn("h-9 overflow-hidden whitespace-nowrap px-1 text-[12px] sm:px-2", axis(column.align), column.hiddenBelow && visibility[column.hiddenBelow][1])}
      aria-sort={sort?.key === column.key ? sort.direction === "asc" ? "ascending" : "descending" : "none"}>
      {heading ? heading(column.key) : onSort ? <SalesSortButton label={column.label} kind={column.kind} align={column.align}
        active={sort?.key === column.key} direction={sort?.direction ?? "asc"} onClick={() => onSort(column.key)} /> : column.label}
    </TableHead>)}{actions && <TableHead aria-label="Acciones" className="px-0" />}</TableRow></TableHeader>
    <TableBody>{status ? <TableRow><TableCell colSpan={columns.length + (actions ? 1 : 0)} className="h-20 text-center text-[13px] text-muted-foreground">{status}</TableCell></TableRow> : rows.map(row => <TableRow key={id(row)}
      className={cn(onSelect && "cursor-pointer hover:bg-accent/40", rowClassName?.(row))} onClick={onSelect ? () => onSelect(row) : undefined}>
      {columns.map(column => <TableCell key={column.key} title={column.title?.(row) ?? String(column.value(row) ?? "—")}
        className={cn("overflow-hidden whitespace-nowrap px-1 py-2 text-[13px] leading-5 sm:px-2", axis(column.align), column.kind === "number" && "tabular-nums", column.hiddenBelow && visibility[column.hiddenBelow][1], column.className)}>
        <div className="min-w-0 truncate">{column.render ? column.render(row) : String(column.value(row) ?? "—")}</div>
      </TableCell>)}{actions && <TableCell className="overflow-hidden whitespace-nowrap px-0 py-2"><div className="flex items-center justify-center gap-1">{actions.render(row)}</div></TableCell>}
    </TableRow>)}</TableBody>
  </Table>;
}

export function CompactListInfo({ label, fields, children }: {
  label: string; fields: readonly (readonly [string, string])[]; children?: ReactNode;
}) {
  return <Popover><PopoverTrigger asChild><button type="button" title={label} aria-label={`Detalle ${label}`}
    className="block max-w-full truncate rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    onClick={event => event.stopPropagation()}>{label}</button></PopoverTrigger>
    <PopoverContent align="start" className="max-w-[calc(100vw-2rem)] text-[13px]" aria-label={`Detalle ${label}`} onClick={event => event.stopPropagation()}>
      <dl className="space-y-1">{fields.map(([key, value]) => <div key={key} className="grid grid-cols-[90px_1fr] gap-2"><dt className="text-muted-foreground">{key}</dt><dd className="min-w-0 break-words">{value}</dd></div>)}</dl>
      {children && <div className="mt-2">{children}</div>}
    </PopoverContent>
  </Popover>;
}
