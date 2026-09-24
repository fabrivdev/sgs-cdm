import type { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileSalesTable } from "./MobileSalesTable";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useSalesSectionExport } from "./SalesSectionExports";
import { RowCount, TableScroll, salesHeader, scrollHead } from "./TableScroll";
import { SalesSortButton } from "./SalesTableControls";
import { useSalesTableSort, type SalesColumn, type SalesSort } from "./salesTableInteraction";

export type SalesDisplayColumn<T> = SalesColumn<T> & {
  render?: (row: T) => ReactNode; className?: string; weight?: number;
};
export function SalesDataTable<T>({ title, rows, columns, initialSort, rowKey, fileName, sheetName = "Ventas Servicios",
  empty = "Sin facturación en el período.", footer, onRowClick, selected, countLabel = "filas",
  mobileIdentity,
}: {
  title: string; rows: readonly T[]; columns: readonly SalesDisplayColumn<T>[];
  initialSort: SalesSort; rowKey: (row: T) => string; fileName: string; sheetName?: string;
  empty?: string; footer?: T; onRowClick?: (row: T) => void; selected?: (row: T) => boolean; countLabel?: string;
  mobileIdentity?: (row: T) => string;
}) {
  const { can } = useAuth();
  const isMobile = useIsMobile(1024);
  const { ordered, sort, toggleSort } = useSalesTableSort(rows, columns, initialSort);
  useSalesSectionExport({ id: fileName, label: `Exportar ${title}`, disabled: !ordered.length, onSelect: async () => {
    const snapshot = footer ? [...ordered, footer] : ordered;
    const { exportSalesTable } = await import("./salesTableExport");
    exportSalesTable({ rows: snapshot, columns, fileName, sheetName });
  } }, can("datos:exportar"));
  if (isMobile) return <><MobileSalesTable title={title} rows={ordered} columns={mobileIdentity ? columns.map((c,index)=>index===0?{...c,render:(row:T)=><span className="truncate">{mobileIdentity(row)}</span>}:c) : columns} rowKey={rowKey} sort={sort} toggleSort={toggleSort} footer={footer} onRowClick={onRowClick} selected={selected} empty={empty} /><RowCount rows={ordered.length} label={countLabel} /></>;
  const grid = { gridTemplateColumns: columns.map(column => `minmax(0,${column.weight ?? 1}fr)`).join(" ") };
  const cells = (row: T, interactive = false) => columns.map((column, index) => {
    const value = column.value(row);
    const rendered = column.render?.(row);
    return <div role="cell" key={column.key} title={typeof rendered === "string" ? rendered : column.render ? undefined : value == null ? "No informado" : String(value)}
      className={cn("min-w-0 truncate", column.align === "right" ? "text-right tabular-nums" : column.align === "center" ? "text-center tabular-nums" : "text-left", column.className)}>
      {interactive && index === 0 ? <button type="button" aria-pressed={selected?.(row)} onClick={event => { event.stopPropagation(); onRowClick?.(row); }} className="max-w-full truncate text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{column.render ? rendered : value == null ? "—" : String(value)}</button> : column.render ? rendered : value == null ? "—" : String(value)}
    </div>;
  });
  return <section aria-label={title} className="min-w-0 max-w-full overflow-hidden rounded-md border">
    <div className="flex min-w-0 items-center justify-between gap-2 border-b px-3 py-2">
      <h3 className="truncate text-[12px] font-semibold">{title}</h3>
    </div>
    <div role="table" aria-label={title} aria-colcount={columns.length}>
      <TableScroll rows={ordered.length} className="min-w-0 max-w-full">
        <div role="row" style={grid} className={`grid gap-x-2 bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground ${scrollHead} ${salesHeader}`}>
          {columns.map(column => <div role="columnheader" key={column.key} className="min-w-0 truncate"
            aria-sort={sort.key === column.key ? sort.direction === "asc" ? "ascending" : "descending" : "none"}>
            <SalesSortButton label={column.label} kind={column.kind} align={column.align} active={sort.key === column.key} direction={sort.direction} onClick={() => toggleSort(column.key)} />
          </div>)}
        </div>
        {!ordered.length ? <div className="py-10 text-center text-[12px] text-muted-foreground">{empty}</div>
          : ordered.map(row => onRowClick
            ? <div role="row" key={rowKey(row)} style={grid} onClick={() => onRowClick(row)} className={cn("grid h-9 w-full cursor-pointer items-center gap-x-2 border-t px-3 text-left text-[12px] hover:bg-accent", selected?.(row) && "bg-primary/5 outline outline-1 outline-primary/20")}>{cells(row, true)}</div>
            : <div role="row" key={rowKey(row)} style={grid} className="grid h-9 items-center gap-x-2 border-t px-3 text-[12px] hover:bg-muted/30">{cells(row)}</div>)}
        {footer && ordered.length > 0 && <div role="row" style={grid} className="grid h-9 items-center gap-x-2 border-t bg-muted/30 px-3 text-[12px] font-semibold">{cells(footer)}</div>}
      </TableScroll>
    </div>
    {ordered.length > 0 && <RowCount rows={ordered.length} label={countLabel} />}
  </section>;
}
