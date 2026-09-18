import { SalesSortButton } from "@/components/ventas/SalesTableControls";
import type { SalesColumn, SalesSort } from "@/components/ventas/salesTableInteraction";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { purchaseHead } from "./purchaseTableFormat";
import type { ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function PurchaseTableHeading<T>({ column, sort, onSort, className }: {
  column: SalesColumn<T>; sort: SalesSort; onSort: (key: string) => void; className?: string;
}) {
  const active = sort.key === column.key;
  return <TableHead className={cn(purchaseHead, column.align === "center" ? "text-center" : column.align === "right" ? "text-right" : "text-left", className)}
    aria-sort={!active ? "none" : sort.direction === "asc" ? "ascending" : "descending"}>
    <SalesSortButton label={column.label} kind={column.kind} align={column.align}
      active={active} direction={sort.direction} onClick={() => onSort(column.key)} />
  </TableHead>;
}

export function PurchaseInfo({ label, fields, children }: {
  label: string; fields: readonly (readonly [string, string])[]; children?: ReactNode;
}) {
  return <Popover><PopoverTrigger asChild>
    <button type="button" className="block max-w-full truncate rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Detalle ${label}`} title={label} onClick={event=>event.stopPropagation()}>{label}</button>
  </PopoverTrigger><PopoverContent align="start" className="max-w-[calc(100vw-2rem)] text-[13px]" aria-label={`Detalle ${label}`}>
    <dl className="space-y-1">{fields.map(([key,value])=><div key={key} className="grid grid-cols-[90px_1fr] gap-2">
      <dt className="text-muted-foreground">{key}</dt><dd className="min-w-0 break-words">{value}</dd>
    </div>)}</dl>{children && <div className="mt-2">{children}</div>}
  </PopoverContent></Popover>;
}
