import { formatInvoiceNumber } from "./invoiceNumber";
import { workCategories, compactCategories } from "./maintenancePresentation";
import { maintenanceCategories } from "./managementModel";
import { moneyCell } from "./workspaceModel";
import { useMemo, useState, type ReactNode } from "react";
import {
  ManagementTable,
  type GridField,
  type GridRow,
} from "./ManagementTable";
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
  invoiceMoney,
  type FleetFilters,
  type FilterChange,
} from "./workspaceModel";
const fields: GridField[] = [
  ["date", "Fecha", "date"],
  ["invoice", "N.º de factura"],
  ["supplier", "Proveedor"],
  ["classification", "Descripción"],
  ["amount", "Monto", "number"],
  ["km", "Km", "number"],
  ["plate", "Chapa"],
  ["type", "Origen"],
  ["description", "Detalle de trabajos"],
  ["currency", "Moneda"],
  ["status", "Estado"],
];
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
  const rows = useMemo(
    () =>
      [
        ...history.map((r) => ({
          id: r.id,
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
          id: r.id,
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
            ["Gasto mantenimiento", invoiceMoney(invoices)],
            ["Registros históricos", history.length],
            ["Facturas", invoices.length],
            [
              "Cargas incompletas",
              invoices.filter((r) => r.status === "pending").length,
            ],
          ]}
        />
      )}
      <ManagementTable
        detailStyle={!!vehicleId}
        showRowCount={false}
        actionsTarget={actionsTarget}
        label="Mantenimiento"
        fields={fields}
        rows={rows}
        omittedColumns={
          vehicleId
            ? ["plate", "currency", "description", "type", "status"]
            : ["currency", "description"]
        }
        render={{
          classification: (r) => (
            <span title={String(r.classification || "Sin clasificar")}>
              {compactCategories(String(r.classification || "").split(" · "))}
            </span>
          ),
          amount: (r) =>
            moneyCell(r.amount as number | null, r.currency as string | null),
        }}
        actions={vehicleActions}
        onSelect={onSelect}
      />
    </>
  );
}
