import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SalesSortButton } from "@/components/ventas/SalesTableControls";
import type { SalesColumn, SalesSort } from "@/components/ventas/salesTableInteraction";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { SlidersHorizontal } from "lucide-react";

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
export function CompactListTable<T>({ rows, columns, mobileColumns, id, label, sort, onSort, heading, status, onSelect, rowClassName, actions }: {
  rows: readonly T[]; columns: readonly CompactListColumn<T>[]; id: (row: T) => string; label: string;
  mobileColumns?: readonly CompactListColumn<T>[];
  sort?: SalesSort; onSort?: (key: string) => void; heading?: (key: string) => ReactNode;
  status?: ReactNode; onSelect?: (row: T) => void; rowClassName?: (row: T) => string;
  actions?: { width: string; render: (row: T) => ReactNode };
}) {
  const phone = useIsMobile(640);
  const displayedColumns = phone && mobileColumns ? mobileColumns : columns;
  return <Table className="compact-list-table table-fixed" aria-label={label}>
    <colgroup>{displayedColumns.map(column => <col key={column.key} className={cn(column.width, column.hiddenBelow && visibility[column.hiddenBelow][0])} />)}
      {actions && <col className={actions.width} />}</colgroup>
    <TableHeader><TableRow>{displayedColumns.map((column, index) => <TableHead key={column.key}
      className={cn("h-9 overflow-hidden whitespace-nowrap px-1 text-[12px] sm:px-2 max-md:[&_button]:min-h-11 max-md:[&_span]:whitespace-normal max-md:[&_span]:overflow-visible", axis(column.align), column.hiddenBelow && visibility[column.hiddenBelow][1])}
      aria-sort={sort?.key === column.key ? sort.direction === "asc" ? "ascending" : "descending" : "none"}>
      <div className="flex min-w-0 items-center gap-1">
        <div className="min-w-0 flex-1">{heading && !(phone && mobileColumns && onSort) ? heading(column.key) : onSort ? <SalesSortButton label={column.label} kind={column.kind} align={column.align}
          active={sort?.key === column.key} direction={sort?.direction ?? "asc"} onClick={() => onSort(column.key)} /> : column.label}</div>
        {phone && mobileColumns && index === 0 && (onSort || heading) && <Popover>
          <PopoverTrigger asChild><button type="button" aria-label={`Ordenar ${label}`} className="flex h-11 w-9 shrink-0 items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:ring-ring"><SlidersHorizontal className="h-3.5 w-3.5" /></button></PopoverTrigger>
          <PopoverContent align="start" className="max-h-[70dvh] w-[min(280px,calc(100vw-2rem))] overflow-y-auto p-2">
            <p className="px-2 pb-1 text-[12px] font-medium">Ordenar por</p>
            {columns.map(c => <div key={c.key} className="min-h-11 px-2 [&_button]:min-h-11">{heading ? heading(c.key) : <SalesSortButton label={c.label} kind={c.kind} active={sort?.key === c.key} direction={sort?.direction ?? "asc"} onClick={() => onSort?.(c.key)} />}</div>)}
          </PopoverContent>
        </Popover>}
      </div>
    </TableHead>)}{actions && <TableHead aria-label="Acciones" className="px-0" />}</TableRow></TableHeader>
    <TableBody>{status ? <TableRow><TableCell colSpan={displayedColumns.length + (actions ? 1 : 0)} className="h-20 text-center text-[13px] text-muted-foreground">{status}</TableCell></TableRow> : rows.map(row => <TableRow key={id(row)}
      className={cn(onSelect && "cursor-pointer hover:bg-accent/40", rowClassName?.(row))} onClick={onSelect ? () => onSelect(row) : undefined}>
      {displayedColumns.map(column => <TableCell key={column.key} title={column.title?.(row) ?? String(column.value(row) ?? "—")}
        className={cn("overflow-hidden whitespace-nowrap px-1 py-2 text-[13px] leading-5 sm:px-2", axis(column.align), column.kind === "number" && "tabular-nums", column.hiddenBelow && visibility[column.hiddenBelow][1], column.className)}>
        <div className="min-w-0 truncate max-sm:whitespace-normal">{column.render ? column.render(row) : String(column.value(row) ?? "—")}</div>
      </TableCell>)}{actions && <TableCell className="overflow-hidden whitespace-nowrap px-0 py-2"><div className="flex items-center justify-center gap-1">{actions.render(row)}</div></TableCell>}
    </TableRow>)}</TableBody>
  </Table>;
}

/** Gives phone layouts access to ordering by fields moved into their detail. */
export function CompactListOrderMenu<T>({ label, columns, sort, onSort }: {
  label: string; columns: readonly SalesColumn<T>[]; sort: SalesSort; onSort: (key: string) => void;
}) {
  return <Popover><PopoverTrigger asChild><button type="button" aria-label={`Ordenar ${label}`} className="flex h-11 w-11 items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:ring-ring"><SlidersHorizontal className="h-3.5 w-3.5" /></button></PopoverTrigger>
    <PopoverContent align="start" className="max-h-[70dvh] w-[min(280px,calc(100vw-2rem))] overflow-y-auto p-2">
      <p className="px-2 pb-1 text-[12px] font-medium">Ordenar por</p>
      {columns.map(column => <div key={column.key} className="px-2 [&_button]:min-h-11"><SalesSortButton label={column.label} kind={column.kind} active={sort.key === column.key} direction={sort.direction} onClick={() => onSort(column.key)} /></div>)}
    </PopoverContent>
  </Popover>;
}

export function CompactListInfo({ label, fields, children, summary }: {
  label: string; fields: readonly (readonly [string, string])[]; children?: ReactNode; summary?: ReactNode;
}) {
  return <Popover><PopoverTrigger asChild><button type="button" title={label} aria-label={`Detalle ${label}`}
    className="block min-h-11 max-w-full truncate rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:whitespace-normal max-sm:break-words md:min-h-0"
    onClick={event => event.stopPropagation()}>{summary ?? label}</button></PopoverTrigger>
    <PopoverContent align="start" className="max-w-[calc(100vw-2rem)] text-[13px]" aria-label={`Detalle ${label}`} onClick={event => event.stopPropagation()}>
      <dl className="space-y-1">{fields.map(([key, value]) => <div key={key} className="grid grid-cols-[90px_1fr] gap-2"><dt className="text-muted-foreground">{key}</dt><dd className="min-w-0 break-words">{value}</dd></div>)}</dl>
      {children && <div className="mt-2">{children}</div>}
    </PopoverContent>
  </Popover>;
}
