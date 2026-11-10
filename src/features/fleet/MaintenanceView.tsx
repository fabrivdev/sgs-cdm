import { moneyCell } from "./workspaceModel";
import { useMemo } from "react";
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
  ["plate", "Chapa"],
  ["type", "Tipo"],
  ["description", "Descripción"],
  ["supplier", "Proveedor"],
  ["amount", "Importe", "number"],
  ["currency", "Moneda"],
  ["invoice", "Factura"],
  ["status", "Estado"],
];
export function MaintenanceView({
  data,
  vehicleId,
  filters,
  onChange,
  onSelect,
  showSummary = true,
}: {
  data: ManagementData;
  vehicleId?: string;
  filters: FleetFilters;
  onChange: FilterChange;
  onSelect: (r: GridRow) => void;
  showSummary?: boolean;
}) {
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
          description: r.works.map((w) => w.work).join(", "),
          supplier: r.supplier,
          amount: null,
          currency: null,
          invoice: r.invoice_number,
          status: null,
        })),
        ...invoices.map((r) => ({
          id: r.id,
          date: r.performed_on ?? r.invoice_date,
          plate: r.plate,
          type: "Factura",
          description: r.description,
          supplier: r.supplier,
          amount: r.amount,
          currency: r.currency,
          invoice: r.invoice_number,
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
          matches(
            filters.search,
            r.plate,
            r.description,
            r.supplier,
            r.invoice,
          ),
      ),
    [history, invoices, filters.type, filters.search],
  );
  return (
    <>
      <FleetFilterBar
        filters={filters}
        onChange={onChange}
        more={
          <>
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
          label="Tipo"
          value={filters.type}
          onChange={(v) => onChange("type", v)}
          options={["Historial", "Factura"]}
        />
      </FleetFilterBar>
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
        label="Mantenimiento"
        fields={fields}
        rows={rows}
        omittedColumns={vehicleId ? ["plate", "currency"] : ["currency"]}
        render={{
          amount: (r) =>
            moneyCell(r.amount as number | null, r.currency as string | null),
        }}
        onSelect={onSelect}
      />
    </>
  );
}
