import type { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { TableScroll, RowCount, salesHeader } from "@/components/ventas/TableScroll";
import { SalesSortButton } from "@/components/ventas/SalesTableControls";
import type { SalesSort } from "@/components/ventas/salesTableInteraction";
import { CompactListOrderMenu, type CompactListColumn } from "@/components/lists/CompactListTable";

const visibility = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell", xl: "hidden xl:table-cell" };
const colVisibility = { sm: "hidden sm:table-column", md: "hidden md:table-column", lg: "hidden lg:table-column", xl: "hidden xl:table-column" };
const axis = (align?: string) => align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

/** Same native table, header, scroll and row-count structure as RepuestosVentas.
 * This section deliberately keeps one visual line per record on phones too. */
export function PartsAnalysisTable<T>({ rows, columns, mobileColumns, id, label, sort, onSort, status, onSelect, total }: {
  rows: readonly T[]; columns: readonly CompactListColumn<T>[]; mobileColumns: readonly CompactListColumn<T>[];
  id: (row: T) => string; label: string; sort: SalesSort; onSort: (key: string) => void;
  status?: ReactNode; onSelect: (row: T) => void; total: number;
}) {
  const phone = useIsMobile(640);
  const shown = phone ? mobileColumns : columns;
  return <div className="overflow-hidden rounded-md border">
    {phone && <div className="flex justify-end border-b"><CompactListOrderMenu label={label} columns={columns} sort={sort} onSort={onSort} /></div>}
    <TableScroll rows={rows.length} className="!overflow-x-hidden">
      <table aria-label={label} className="w-full table-fixed text-[12px] leading-4 tabular-nums [&_th]:h-8 [&_th]:px-3 [&_th]:text-[11px] [&_th]:font-medium [&_td]:h-8 [&_td]:px-3 [&_td]:align-middle [&_tbody_tr]:border-t max-sm:[&_th]:px-1 max-sm:[&_td]:px-1 max-sm:[&_th_button]:min-h-11 max-sm:[&_td]:h-11">
        <colgroup>{shown.map(c => <col key={c.key} className={cn(c.width,c.hiddenBelow && colVisibility[c.hiddenBelow])} />)}</colgroup>
        <thead className={cn("text-muted-foreground",salesHeader)}><tr>{shown.map(c => <th key={c.key} className={cn("sticky top-0 z-10 bg-muted/60",axis(c.align),c.hiddenBelow && visibility[c.hiddenBelow])} aria-sort={sort.key===c.key ? sort.direction==="asc" ? "ascending" : "descending" : "none"}>
          {c.label && <SalesSortButton label={c.label} kind={c.kind} align={c.align} active={sort.key===c.key} direction={sort.direction} onClick={()=>onSort(c.key)} />}
        </th>)}</tr></thead>
        <tbody>{status ? <tr><td colSpan={shown.length} className="h-20 text-center text-muted-foreground">{status}</td></tr> : rows.map(row => <tr key={id(row)} className="cursor-pointer hover:bg-accent" onClick={()=>onSelect(row)}>
          {shown.map(c => <td key={c.key} title={c.title?.(row) ?? String(c.value(row) ?? "—")} className={cn("whitespace-nowrap",axis(c.align),c.hiddenBelow && visibility[c.hiddenBelow],c.kind!=="number" && "overflow-hidden")}>
            <div className={cn("min-w-0",c.kind!=="number" && "truncate")}>{c.render ? c.render(row) : String(c.value(row) ?? "—")}</div>
          </td>)}
        </tr>)}</tbody>
      </table>
    </TableScroll>
    <RowCount rows={total} loaded={rows.length} />
  </div>;
}
