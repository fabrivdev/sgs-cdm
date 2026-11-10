import { memo, useMemo, type ReactNode } from "react";
import {
  TableScroll,
  RowCount,
  scrollHead,
} from "@/components/ventas/TableScroll";
import { useSalesTableSort } from "@/components/ventas/salesTableInteraction";
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
export type GridField = [string, string, ("text" | "number" | "date")?];
function formatCell(value: Cell, kind?: string) {
  if (value == null || value === "") return "—";
  if (kind === "number")
    return Number(value).toLocaleString("es-PY", { maximumFractionDigits: 2 });
  if (kind === "date")
    return String(value).slice(0, 10).split("-").reverse().join("/");
  return String(value);
}
const DataRow = memo(function DataRow({
  row,
  fields,
  onSelect,
  render,
}: {
  row: GridRow;
  fields: GridField[];
  onSelect?: (r: GridRow) => void;
  render?: Record<string, (r: GridRow) => ReactNode>;
}) {
  return (
    <tr
      className="border-b last:border-0 hover:bg-muted/40"
      onClick={onSelect ? () => onSelect(row) : undefined}
    >
      {fields.map(([key, , kind], i) => (
        <td
          key={key}
          className={`px-3 py-2 text-xs ${kind === "number" ? "text-right tabular-nums" : "text-left"}`}
        >
          <div
            className="max-w-[320px] truncate"
            title={formatCell(row[key], kind)}
          >
            {render?.[key]?.(row) ??
              (i === 0 && onSelect ? (
                <button
                  className="text-left focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(row);
                  }}
                >
                  {formatCell(row[key], kind)}
                </button>
              ) : (
                formatCell(row[key], kind)
              ))}
          </div>
        </td>
      ))}
    </tr>
  );
});
export function ManagementTable({
  rows,
  fields,
  label,
  onSelect,
  render,
  actions = [],
  omittedColumns = [],
}: {
  rows: GridRow[];
  fields: GridField[];
  label: string;
  onSelect?: (r: GridRow) => void;
  render?: Record<string, (r: GridRow) => ReactNode>;
  actions?: SectionAction[];
  omittedColumns?: string[];
}) {
  const { can } = useAuth();
  const omittedKey = omittedColumns.join("|");
  const visible = useMemo(
    () => fields.filter(([k]) => !omittedKey.split("|").includes(k)),
    [fields, omittedKey],
  );
  const columns = useMemo(
    () =>
      fields.map(([key, label, kind]) => ({
        key,
        label,
        kind: kind ?? "text",
        value: (r: GridRow) =>
          kind === "date" && r[key] ? String(r[key]).slice(0, 10) : r[key],
      })),
    [fields],
  );
  const { ordered, sort, toggleSort } = useSalesTableSort(rows, columns, {
    key: fields[0][0],
    direction: fields[0][2] === "date" ? "desc" : "asc",
  });
  const options = [
    ...actions,
    ...(can("datos:exportar") && rows.length
      ? [
          {
            id: "export",
            label: "Exportar Excel",
            onSelect: async () => {
              const XLSX = await import("xlsx");
              const book = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(
                book,
                XLSX.utils.aoa_to_sheet([
                  fields.map((f) => f[1]),
                  ...ordered.map((r) => fields.map(([k]) => r[k] ?? null)),
                ]),
                "Datos",
              );
              XLSX.writeFile(book, `${label}.xlsx`);
            },
          },
        ]
      : []),
  ];
  return (
    <section aria-label={label} className="min-w-0 rounded-lg border bg-card">
      <div className="flex items-center justify-end px-2">
        <RowCount rows={rows.length} className="border-0" />
        {options.length > 0 && <SectionActionsMenu options={options} />}
      </div>
      <TableScroll rows={ordered.length} className="overflow-x-auto">
        <table aria-label={label} className="w-full whitespace-nowrap">
          <thead
            className={`${scrollHead} bg-muted text-[11px] font-medium text-muted-foreground`}
          >
            <tr>
              {visible.map(([key, title, kind]) => (
                <th
                  key={key}
                  aria-sort={
                    sort.key === key
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                  className={`px-3 py-2 font-medium ${kind === "number" ? "text-right" : "text-left"}`}
                >
                  <button onClick={() => toggleSort(key)}>
                    {title}
                    {sort.key === key
                      ? sort.direction === "asc"
                        ? " ↑"
                        : " ↓"
                      : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordered.map((row) => (
              <DataRow
                key={row.id}
                row={row}
                fields={visible}
                onSelect={onSelect}
                render={render}
              />
            ))}
            {!rows.length && (
              <tr>
                <td
                  colSpan={visible.length}
                  className="p-6 text-center text-sm text-muted-foreground"
                >
                  Sin registros
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableScroll>
    </section>
  );
}
