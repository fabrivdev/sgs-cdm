import type { StockMatrizRow, StockSortKey } from "@/hooks/useRepuestos";
import { MarcaBadge } from "@/components/StatusBadges";
import { SalesSortButton } from "@/components/ventas/SalesTableControls";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const branches: { key: StockSortKey & keyof StockMatrizRow; label: string }[] = [
  { key: "santa_rita", label: "S. Rita" },
  { key: "santa_rosa", label: "S. Rosa" },
  { key: "campo_9", label: "Campo 9" },
  { key: "misiones", label: "Misiones" },
  { key: "loma_plata", label: "L. Plata" },
  { key: "katuete", label: "Katuete" },
];

// Do not add client-side sorting for identity fields unsupported by the RPC:
// this catalogue is paginated, so an order of the visible page would be false.
const columns: { key: keyof StockMatrizRow; label: string; sortKey?: StockSortKey; numeric?: boolean; width: string }[] = [
  { key: "codigo_interno", label: "Código", sortKey: "codigo_interno", width: "w-[32%] md:w-[14%] lg:w-[12%]" },
  { key: "codigo_fabricante", label: "Cód. fabr.", width: "hidden lg:table-column lg:w-[8%]" },
  { key: "marca", label: "Marca", width: "w-[21%] md:w-[9%] lg:w-[8%]" },
  { key: "descripcion", label: "Descripción", sortKey: "descripcion", width: "w-[25%] md:w-[13%] lg:w-[14%]" },
  ...branches.map(branch => ({ ...branch, sortKey: branch.key, numeric: true, width: "hidden md:table-column md:w-[9%] lg:w-[8%]" })),
  { key: "total", label: "Total", sortKey: "total", numeric: true, width: "w-[22%] md:w-[10%]" },
];
const compactColumns = new Set<keyof StockMatrizRow>(["codigo_interno", "marca", "descripcion", "total"]);
const responsiveColumn = (key: keyof StockMatrizRow) => key === "codigo_fabricante" ? "hidden lg:table-cell" : !compactColumns.has(key) ? "hidden md:table-cell" : undefined;

export function PartsStockTable({ rows, sortKey, sortDir, onSort, onSelect }: {
  rows: StockMatrizRow[];
  sortKey: StockSortKey;
  sortDir: "asc" | "desc";
  onSort: (key: StockSortKey) => void;
  onSelect: (row: StockMatrizRow) => void;
}) {
  return <Table className="table-fixed" aria-label="Stock de repuestos">
    <colgroup>{columns.map(column => <col key={column.key} className={column.width} />)}</colgroup>
    <TableHeader><TableRow>{columns.map(column => <TableHead key={column.key}
      className={cn("h-9 overflow-hidden whitespace-nowrap px-1 lg:px-2", responsiveColumn(column.key), column.numeric ? "text-center" : "text-left")}
      aria-sort={column.sortKey ? sortKey === column.sortKey ? sortDir === "asc" ? "ascending" : "descending" : "none" : undefined}>
      {column.sortKey ? <SalesSortButton label={column.label} kind={column.numeric ? "number" : "text"}
        align={column.numeric ? "center" : "left"} active={sortKey === column.sortKey} direction={sortDir}
        onClick={() => onSort(column.sortKey!)} /> : <span className="block truncate" title={column.label}>{column.label}</span>}
    </TableHead>)}</TableRow></TableHeader>
    <TableBody>{rows.map(row => <TableRow key={row.codigo_interno} className="cursor-pointer" onClick={() => onSelect(row)}>
      {columns.map(column => {
        const value = row[column.key];
        const text = value == null || value === "" ? "—" : column.numeric ? Number(value).toLocaleString("es-PY") : String(value);
        const title = column.key === "descripcion"
          ? `${text} · Fabricante: ${row.codigo_fabricante || "—"}` : text;
        return <TableCell key={column.key} title={title}
          className={cn("overflow-hidden whitespace-nowrap px-1 py-2 text-[13px] leading-5 lg:px-2", responsiveColumn(column.key),
            column.numeric ? "text-center tabular-nums" : "text-left",
            column.key === "codigo_interno" || column.key === "codigo_fabricante" ? "font-mono" : "",
            column.key === "descripcion" || column.key === "total" ? "font-medium" : "",
            column.numeric && value === 0 && column.key !== "total" && "text-destructive/70")}>
          {column.key === "marca" ? <MarcaBadge marca={row.marca} className="px-1.5" /> : <span className="block truncate">{text}</span>}
        </TableCell>;
      })}
    </TableRow>)}</TableBody>
  </Table>;
}
