import {
  ExpensePeriods,
  expenseIdentityFields,
  expenseMoneyValue,
  expenseGroupKey,
  groupExpenses,
  useExpenseView,
} from "./expenseViews";
import { MaintenanceGroupCell } from "./MaintenanceGroupCell";
import {
  maintenanceGroups,
  groupHistoryWorks,
  groupInvoiceWorks,
  exportWorkGroups,
} from "./maintenanceGroups";
import { formatInvoiceNumber } from "./invoiceNumber";
import { workCategories } from "./maintenancePresentation";
import { maintenanceCategories } from "./managementModel";
import { moneyCell } from "./workspaceModel";
import { useMemo, useState, type ReactNode } from "react";
import { type GridField, type GridRow } from "./ManagementTable";
import { FleetExpenseTable } from "./FleetSalesTable";
import type { ManagementData } from "./VehiclesList";
import {
  Choice,
  FleetFilterBar,
  PeriodFields,
  SummaryCards,
} from "./workspaceShared";
import {
  options,
  matches,
  within,
  money,
  type FleetFilters,
  type FilterChange,
} from "./workspaceModel";
const fields: GridField[] = [
  ["date", "Fecha", "date"],
  ["invoice", "N.º de factura"],
  ["supplier", "Proveedor"],
  ["km", "Kilometraje", "number"],
  ...maintenanceGroups.map((group): GridField => ["group" + group, group]),
  ["amount", "Monto", "number"],
  ["classification", "Clasificación"],
  ["plate", "Chapa"],
  ["type", "Origen"],
  ["description", "Detalle de trabajos"],
  ["currency", "Moneda"],
  ["status", "Estado"],
];
const maintenanceMetricsFields: GridField[] = [
  ["history", "Registros históricos", "number"],
  ["invoices", "Facturas", "number"],
  ["pending", "Cargas incompletas", "number"],
];
function maintenanceMetrics(
  rows: {
    type: string;
    status: string | null;
    amount: number | null;
    currency: string | null;
  }[],
) {
  const documented = rows.filter((row) => row.status === "Completa");
  return {
    history: rows.filter((row) => row.type === "Historial").length,
    invoices: rows.filter((row) => row.type === "Factura").length,
    pending: rows.filter((row) => row.status === "Incompleta").length,
    expense: expenseMoneyValue(documented),
    expenseLabel: money(documented),
  };
}
export function MaintenanceView({
  data,
  vehicleId,
  filters,
  onChange,
  onSelect,
  showSummary = true,
  detailSummary,
  vehicleActions = [],
}: {
  data: ManagementData;
  vehicleId?: string;
  filters: FleetFilters;
  onChange: FilterChange;
  onSelect: (r: GridRow) => void;
  showSummary?: boolean;
  detailSummary?: ReactNode;
  vehicleActions?: { id: string; label: string; onSelect: () => void }[];
}) {
  const view = useExpenseView();
  const byBranch = !vehicleId && view.mode === "branch";
  const byVehicle = !vehicleId && view.summary;
  const [actionsTarget, setActionsTarget] = useState<HTMLDivElement | null>(
    null,
  );
  const invoices = useMemo(
    () =>
      data.invoices.filter(
        (r) =>
          (!vehicleId || r.vehicle_id === vehicleId) &&
          (!filters.plate || r.plate === filters.plate) &&
          (!filters.supplier || r.supplier === filters.supplier) &&
          (!filters.invoiceState
            ? r.status !== "void"
            : r.status ===
              { Completa: "uploaded", Incompleta: "pending", Anulada: "void" }[
                filters.invoiceState
              ]) &&
          within(r.performed_on ?? r.invoice_date, filters),
      ),
    [data.invoices, vehicleId, filters],
  );
  const history = useMemo(
    () =>
      data.history.filter(
        (r) =>
          (!vehicleId || r.vehicle_id === vehicleId) &&
          (!filters.plate || r.plate === filters.plate) &&
          (!filters.supplier || r.supplier === filters.supplier) &&
          !filters.invoiceState &&
          within(r.occurred_on, filters),
      ),
    [data.history, vehicleId, filters],
  );
  const groupsById = useMemo(
    () =>
      new Map([
        ...history.map(
          (r) =>
            [
              r.id,
              { groups: groupHistoryWorks(r.works), description: undefined },
            ] as const,
        ),
        ...invoices.map(
          (r) =>
            [
              r.id,
              { groups: groupInvoiceWorks(r), description: r.description },
            ] as const,
        ),
      ]),
    [history, invoices],
  );
  const rows = useMemo(
    () =>
      [
        ...history.map((r) => ({
          ...exportWorkGroups(groupHistoryWorks(r.works)),
          id: r.id,
          vehicle_id: r.vehicle_id,
          group: expenseGroupKey(r),
          date: r.occurred_on,
          plate: r.plate,
          type: "Historial",
          classification: workCategories(r.works).join(" · "),
          km: r.odometer_km,
          description: r.works
            .map((w) =>
              [
                w.work,
                w.value == null || w.value === "X" ? "" : String(w.value),
                w.comment,
              ]
                .filter(Boolean)
                .join(": "),
            )
            .join(" · "),
          supplier: r.supplier,
          amount: null,
          currency: null,
          invoice: formatInvoiceNumber(r.invoice_number),
          status: null,
        })),
        ...invoices.map((r) => ({
          ...exportWorkGroups(groupInvoiceWorks(r)),
          id: r.id,
          vehicle_id: r.vehicle_id,
          group: expenseGroupKey(r),
          date: r.performed_on ?? r.invoice_date,
          plate: r.plate,
          type: "Factura",
          classification: (r.categories ?? []).join(" · "),
          km: r.odometer_km,
          description: r.description,
          supplier: r.supplier,
          amount: r.amount,
          currency: r.currency,
          invoice: formatInvoiceNumber(r.invoice_number),
          status:
            r.status === "uploaded"
              ? "Completa"
              : r.status === "void"
                ? "Anulada"
                : "Incompleta",
        })),
      ].filter(
        (r) =>
          (!filters.type || r.type === filters.type) &&
          (!filters.category ||
            r.classification.split(" · ").includes(filters.category)) &&
          matches(
            filters.search,
            r.plate,
            r.description,
            r.classification,
            r.supplier,
            r.invoice,
          ),
      ),
    [history, invoices, filters.type, filters.category, filters.search],
  );
  const detailRows = rows.filter(
    (row) => vehicleId || !view.group || row.group === view.group.id,
  );
  const totals = byVehicle ? rows : detailRows;
  return (
    <>
      <FleetFilterBar
        secondaryActions={<div ref={setActionsTarget} />}
        filters={filters}
        onChange={onChange}
        more={
          <>
            <Choice
              label="Origen"
              value={filters.type}
              onChange={(v) => onChange("type", v)}
              options={["Historial", "Factura"]}
            />
            <Choice
              label="Proveedor"
              value={filters.supplier}
              onChange={(v) => onChange("supplier", v)}
              options={options(
                [...data.history, ...data.invoices].map((r) => r.supplier),
              )}
            />
            <Choice
              label="Estado de factura"
              value={filters.invoiceState}
              onChange={(v) => onChange("invoiceState", v)}
              options={["Completa", "Incompleta", "Anulada"]}
            />
          </>
        }
      >
        <PeriodFields filters={filters} onChange={onChange} />
        {!vehicleId && (
          <Choice
            label="Chapa"
            value={filters.plate}
            onChange={(v) => onChange("plate", v)}
            options={options(
              [...data.history, ...data.invoices].map((r) => r.plate),
            )}
          />
        )}
        <Choice
          label="Clasificación"
          value={filters.category ?? ""}
          onChange={(v) => onChange("category", v)}
          options={[...maintenanceCategories]}
        />
      </FleetFilterBar>
      {detailSummary}
      {showSummary && (
        <SummaryCards
          items={[
            [
              "Gasto mantenimiento",
              money(totals.filter((r) => r.status === "Completa")),
            ],
            [
              "Registros históricos",
              totals.filter((r) => r.type === "Historial").length,
            ],
            ["Facturas", totals.filter((r) => r.type === "Factura").length],
            [
              "Cargas incompletas",
              totals.filter((r) => r.status === "Incompleta").length,
            ],
          ]}
        />
      )}
      {!vehicleId && (
        <>
          <ExpensePeriods
            rows={rows}
            date={(row) => row.date}
            fields={maintenanceMetricsFields}
            metrics={maintenanceMetrics}
          />
        </>
      )}
      <FleetExpenseTable
        general={!vehicleId}
        switcher={view.switcher}
        key={vehicleId ? "vehicle" : view.mode}
        detailStyle={!!vehicleId}
        columnWidths={
          vehicleId
            ? {
                date: "10%",
                invoice: "15%",
                supplier: "20%",
                km: "9%",
                groupAceites: "7%",
                groupFiltros: "7%",
                groupCubiertas: "8%",
                groupRepuestos: "8%",
                groupOtros: "6%",
                amount: "10%",
              }
            : undefined
        }
        centeredColumns={maintenanceGroups.map((group) => "group" + group)}
        showRowCount={false}
        actionsTarget={actionsTarget}
        label={
          byVehicle
            ? byBranch
              ? "Mantenimiento por sucursal"
              : "Mantenimiento por vehículo"
            : "Mantenimiento"
        }
        fields={
          byVehicle
            ? [
                ...expenseIdentityFields(byBranch),
                ...maintenanceMetricsFields,
                ["latest", "Último servicio", "date"],
                ["expense", "Monto", "number"],
              ]
            : fields
        }
        rows={
          byVehicle
            ? groupExpenses(rows, data, byBranch).map((g) => ({
                id: g.id,
                plate: g.plate,
                responsible: g.responsible,
                km: g.km,
                ...maintenanceMetrics(g.rows),
                latest: g.rows
                  .filter(
                    (r) => r.type === "Historial" || r.status === "Completa",
                  )
                  .map((r) => r.date)
                  .sort()
                  .at(-1),
              }))
            : detailRows
        }
        omittedColumns={
          vehicleId
            ? [
                "plate",
                "currency",
                "description",
                "type",
                "status",
                "classification",
              ]
            : ["currency", "description", "classification", "type", "status"]
        }
        render={{
          expense: (r) => r.expenseLabel,
          ...Object.fromEntries(
            maintenanceGroups.map((group) => [
              "group" + group,
              (r: GridRow) => (
                <MaintenanceGroupCell
                  group={group}
                  works={groupsById.get(r.id)?.groups[group] ?? []}
                  invoiceDescription={groupsById.get(r.id)?.description}
                />
              ),
            ]),
          ),
          amount: (r) =>
            moneyCell(r.amount as number | null, r.currency as string | null),
        }}
        actions={vehicleActions}
        onSelect={
          byBranch
            ? undefined
            : byVehicle
              ? (row) => view.open(row.id, String(row.plate))
              : onSelect
        }
      />
    </>
  );
}
