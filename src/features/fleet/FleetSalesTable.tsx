import { createPortal } from "react-dom";
import {
  SalesDataTable,
  type SalesDisplayColumn,
} from "@/components/ventas/SalesDataTable";
import { SalesSectionExportMenu } from "@/components/ventas/SalesSectionExports";
import { SalesExplorerPanel } from "@/components/ventas/SalesExplorerPanel";
import type { ComponentProps, ReactNode } from "react";
import { ManagementTable, type GridRow } from "./ManagementTable";

export function FleetSalesTable({
  rows,
  fields,
  label,
  onSelect,
  render,
  omittedColumns = [],
  centeredColumns = [],
  actionsTarget,
  actions = [],
  hideTitle = true,
  chronological = false,
}: ComponentProps<typeof ManagementTable> & {
  hideTitle?: boolean;
  chronological?: boolean;
}) {
  const mapped: SalesDisplayColumn<GridRow>[] = fields.map(
    ([key, title, kind]) => {
      const value = (row: GridRow) =>
        kind === "date" && row[key] ? String(row[key]).slice(0, 10) : row[key];
      return {
        key,
        label: title,
        kind: kind ?? "text",
        align: centeredColumns.includes(key)
          ? "center"
          : kind === "number"
            ? "right"
            : "left",
        weight: [
          "supplier",
          "responsible",
          "station",
          "vehicles",
          "distance",
        ].includes(key)
          ? 1.7
          : key.startsWith("group")
            ? 0.75
            : 1,
        value,
        exportValue:
          key === "expense" ? (row) => row.expenseLabel ?? value(row) : value,
        render:
          render?.[key] ??
          ((row) => {
            const cell = value(row);
            if (cell == null || cell === "") return "—";
            if (kind === "date")
              return String(cell).split("-").reverse().join("/");
            if (kind === "number")
              return Number(cell).toLocaleString("es-PY", {
                maximumFractionDigits: 2,
              });
            return String(cell);
          }),
      };
    },
  );
  return (
    <>
      {actionsTarget &&
        createPortal(
          <SalesSectionExportMenu extraActions={actions} />,
          actionsTarget,
        )}
      <div className="min-w-0 [&_[role=row]]:gap-x-4">
        <SalesDataTable
          title={label}
          hideDesktopTitle={hideTitle}
          rows={rows}
          columns={mapped.filter(
            (column) => !omittedColumns.includes(column.key),
          )}
          exportColumns={mapped}
          initialSort={{
            key: fields[0][0],
            direction:
              !chronological && fields[0][2] === "date" ? "desc" : "asc",
          }}
          rowKey={(row) => row.id}
          fileName={label + ".xlsx"}
          sheetName="Flota"
          empty="Sin registros"
          onRowClick={onSelect}
          desktopBreakpoint={640}
          fixedSort={chronological}
        />
      </div>
    </>
  );
}

export function FleetExpenseTable(
  props: ComponentProps<typeof ManagementTable> & {
    general: boolean;
    switcher: ReactNode;
  },
) {
  const { general, switcher, ...table } = props;
  return general ? (
    <SalesExplorerPanel title="Movimientos" switcher={switcher}>
      <div className="mt-3">
        <FleetSalesTable {...table} />
      </div>
    </SalesExplorerPanel>
  ) : (
    <ManagementTable {...table} />
  );
}
