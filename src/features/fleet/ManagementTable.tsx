import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  CompactListTable,
  type CompactListColumn,
} from "@/components/lists/CompactListTable";
import { useSalesTableSort } from "@/components/ventas/salesTableInteraction";
import { FiltersBar } from "@/components/filters/FiltersBar";
import {
  SectionActionsMenu,
  type SectionAction,
} from "@/components/exports/SectionActionsMenu";
import { useAuth } from "@/hooks/useAuth";
export type Cell = string | number | null | undefined;
export interface GridRow {
  id: string;
  [key: string]: Cell;
}
// Desktop widths follow the information, not an equal split of every column.
const fieldWidths: Record<string, number> = {
  plate: 100,
  brand: 115,
  model: 190,
  responsible: 180,
  status: 110,
  km: 105,
  date: 115,
  distance: 110,
  station: 190,
  product: 180,
  liters: 105,
  loaded: 130,
  adjustments: 110,
  currency: 80,
  amount: 125,
  month: 105,
  consumption: 155,
  supplier: 180,
  invoice: 150,
  classification: 170,
  description: 260,
  work: 210,
  value: 170,
  comment: 270,
  field: 170,
  before: 210,
  after: 210,
  actor: 180,
};
function formatCell(value: Cell, kind?: string) {
  if (value == null || value === "") return "—";
  if (kind === "number")
    return Number(value).toLocaleString("es-PY", { maximumFractionDigits: 2 });
  if (kind === "date") {
    const date = String(value).slice(0, 10);
    return date.split("-").reverse().join("/");
  }
  return String(value);
}
export function ManagementTable({
  rows,
  fields,
  label,
  onSelect,
  filters,
  expanded,
  search,
  onSearch,
  actions = [],
  render,
  onReset,
  activeFilters = 0,
}: {
  onReset?: () => void;
  activeFilters?: number;
  rows: GridRow[];
  fields: [string, string, ("text" | "number" | "date")?][];
  label: string;
  onSelect?: (row: GridRow) => void;
  filters?: ReactNode;
  expanded?: ReactNode;
  search?: string;
  onSearch?: (v: string) => void;
  actions?: SectionAction[];
  render?: Record<string, (r: GridRow) => ReactNode>;
}) {
  const { can } = useAuth();
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [rows]);
  const [columnPicker, setColumnPicker] = useState(false),
    [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(rows.length / 50) - 1),
  );
  const columns: CompactListColumn<GridRow>[] = fields.map(
    ([key, label, kind], index) => ({
      key,
      label,
      kind: kind ?? "text",
      width: "",
      widthPx: fieldWidths[key] ?? 160,
      stickyLeft:
        fields.length > 8 && index < 2
          ? index === 0
            ? 0
            : (fieldWidths[fields[0][0]] ?? 160)
          : undefined,
      value: (r) => r[key],
      align: kind === "number" ? "right" : "left",
      render:
        render?.[key] ??
        (onSelect && key === fields[0][0]
          ? (r) => (
              <button
                className="rounded-sm text-left text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(r);
                }}
              >
                {formatCell(r[key], kind)}
              </button>
            )
          : (r) => formatCell(r[key], kind)),
    }),
  );
  const visibleColumns = columns.filter((c) => !hiddenColumns.includes(c.key));
  const tableWidth = fields
    .filter(([k]) => !hiddenColumns.includes(k))
    .reduce((sum, [key]) => sum + (fieldWidths[key] ?? 160), 0);
  const mobileKeys =
    fields[0][0] === "plate"
      ? ["plate", "status", "km"]
      : fields[0][0] === "month"
        ? ["month", "liters", "currency", "amount"]
        : fields.some((f) => f[0] === "liters")
          ? ["date", "plate", "liters", "amount"]
          : fields.slice(0, 3).map((f) => f[0]);
  const { ordered, sort, toggleSort } = useSalesTableSort(rows, columns, {
    key: fields[0][0],
    direction:
      fields[0][2] === "date" || fields[0][0] === "month" ? "desc" : "asc",
  });
  const options = [
    ...actions,
    ...(onSearch && fields.length > 8
      ? [
          {
            id: "columns",
            label: "Elegir columnas",
            onSelect: () => setColumnPicker(true),
          },
        ]
      : []),
    ...(onReset && activeFilters
      ? [{ id: "reset", label: "Limpiar filtros", onSelect: onReset }]
      : []),
    ...(can("datos:exportar") && rows.length > 0
      ? [
          {
            id: "export",
            label: "Exportar Excel",
            disabled: !rows.length,
            onSelect: async () => {
              const XLSX = await import("xlsx");
              const sheet = XLSX.utils.aoa_to_sheet([
                fields.map((f) => f[1]),
                ...ordered.map((r) =>
                  fields.map(([k, , kind]) =>
                    kind === "date" && r[k]
                      ? new Date(String(r[k]))
                      : (r[k] ?? null),
                  ),
                ),
              ]);
              const book = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(book, sheet, "Datos");
              XLSX.writeFile(book, `${label}.xlsx`);
            },
          },
        ]
      : []),
  ];
  return (
    <div className="space-y-3">
      <Dialog open={columnPicker} onOpenChange={setColumnPicker}>
        <DialogContent closeLabel="Cerrar">
          <DialogTitle>Columnas visibles</DialogTitle>
          <div className="grid grid-cols-2 gap-3">
            {fields.map(([key, label], index) => (
              <label key={key} className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={index < 2}
                  checked={!hiddenColumns.includes(key)}
                  onChange={(e) =>
                    setHiddenColumns(
                      e.target.checked
                        ? hiddenColumns.filter((k) => k !== key)
                        : [...hiddenColumns, key],
                    )
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <FiltersBar
        search={
          onSearch
            ? { value: search ?? "", onChange: onSearch, placeholder: "Buscar" }
            : undefined
        }
        expanded={expanded}
        secondaryActions={<SectionActionsMenu options={options} />}
      >
        {filters}
      </FiltersBar>
      {onSearch && (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            {rows.length} registros
            {activeFilters ? ` · ${activeFilters} filtros activos` : ""}
          </span>
          {rows.length > 50 && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                Anterior
              </Button>
              <span>
                {currentPage + 1} / {Math.ceil(rows.length / 50)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={(currentPage + 1) * 50 >= rows.length}
                onClick={() => setPage(currentPage + 1)}
              >
                Siguiente
              </Button>
            </div>
          )}
        </div>
      )}
      <div
        style={{ "--fleet-table-width": `${tableWidth}px` } as CSSProperties}
      >
        <CompactListTable
          className="sm:min-w-[var(--fleet-table-width)]"
          label={label}
          rows={
            onSearch
              ? ordered.slice(currentPage * 50, currentPage * 50 + 50)
              : ordered
          }
          columns={visibleColumns}
          mobileColumns={columns
            .filter((c) => mobileKeys.includes(c.key))
            .map((c) => ({ ...c, widthPx: undefined, stickyLeft: undefined }))}
          id={(r) => r.id}
          sort={sort}
          onSort={toggleSort}
          onSelect={onSelect}
          status={
            !rows.length
              ? activeFilters
                ? "Sin coincidencias"
                : "Sin registros"
              : undefined
          }
        />
      </div>
    </div>
  );
}
