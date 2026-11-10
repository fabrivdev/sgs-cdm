import type { CSSProperties, ReactNode } from "react";
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
}: {
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
                className="text-left text-primary underline"
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
  const tableWidth = fields.reduce(
    (sum, [key]) => sum + (fieldWidths[key] ?? 160),
    0,
  );
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
      <div
        style={{ "--fleet-table-width": `${tableWidth}px` } as CSSProperties}
      >
        <CompactListTable
          className="sm:min-w-[var(--fleet-table-width)]"
          label={label}
          rows={ordered}
          columns={columns}
          mobileColumns={columns
            .filter((c) => mobileKeys.includes(c.key))
            .map((c) => ({ ...c, widthPx: undefined, stickyLeft: undefined }))}
          id={(r) => r.id}
          sort={sort}
          onSort={toggleSort}
          onSelect={onSelect}
          status={!rows.length ? "Sin registros" : undefined}
        />
      </div>
    </div>
  );
}
