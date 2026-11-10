import { fuelMonthRows, usesMonthlyFuel } from "./vehicleFuelSummary";
import { moneyCell } from "./workspaceModel";
import { useMemo, useState } from "react";
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
  fmt,
  fuelMoney,
  fleetConsumption,
  type FleetFilters,
  type FilterChange,
} from "./workspaceModel";
const fields: GridField[] = [
  ["date", "Fecha", "date"],
  ["plate", "Chapa"],
  ["km", "Km", "number"],
  ["liters", "Litros", "number"],
  ["amount", "Importe", "number"],
  ["currency", "Moneda"],
];
export function FuelView({
  data,
  vehicleId,
  filters,
  onChange,
  onSelect,
  onImport,
  showSummary = true,
  vehicleActions = [],
}: {
  data: ManagementData;
  vehicleId?: string;
  filters: FleetFilters;
  onChange: FilterChange;
  onSelect: (r: GridRow) => void;
  onImport: () => void;
  showSummary?: boolean;
  vehicleActions?: { id: string; label: string; onSelect: () => void }[];
}) {
  const [actionsTarget, setActionsTarget] = useState<HTMLDivElement | null>(
    null,
  );
  const scope = useMemo(
    () =>
      data.fuel.filter(
        (r) =>
          (!vehicleId || r.vehicle_id === vehicleId) &&
          (!filters.plate || r.plate === filters.plate) &&
          within(r.occurred_at, { from: filters.from, to: filters.to }),
      ),
    [data.fuel, vehicleId, filters.from, filters.to, filters.plate],
  );
  const visible = useMemo(
    () =>
      scope.filter((r) =>
        matches(filters.search, r.plate, r.station, r.product, r.raw_data),
      ),
    [scope, filters.search],
  );
  const rows = useMemo(
    () =>
      visible.map((r) => ({
        id: r.id,
        date: r.occurred_at,
        plate: r.plate,
        km: r.odometer_km,
        liters: r.liters,
        amount: r.net_amount,
        currency: r.currency,
      })),
    [visible],
  );
  const monthly = !!vehicleId && usesMonthlyFuel(filters);
  const monthRows = useMemo(
    () =>
      fuelMonthRows(
        data.fuel.filter((r) => r.vehicle_id === vehicleId),
        filters,
      ),
    [data.fuel, vehicleId, filters],
  );
  return (
    <>
      <FleetFilterBar
        secondaryActions={<div ref={setActionsTarget} />}
        filters={filters}
        onChange={onChange}
      >
        <PeriodFields filters={filters} onChange={onChange} />
        {!vehicleId && (
          <Choice
            label="Chapa"
            value={filters.plate}
            onChange={(v) => onChange("plate", v)}
            options={options(data.fuel.map((v) => v.plate))}
          />
        )}
      </FleetFilterBar>
      {showSummary && (
        <SummaryCards
          items={[
            ["Litros", fmt(scope.reduce((n, r) => n + r.liters, 0))],
            ["Gasto combustible", fuelMoney(scope)],
            ["Cargas", scope.length],
            [
              "Consumo estimado (L/100 km)",
              fmt(
                fleetConsumption(
                  data.fuel,
                  data.vehicles
                    .filter((v) => !vehicleId || v.id === vehicleId)
                    .filter(
                      (v) =>
                        !filters.plate ||
                        data.fuel.some(
                          (r) =>
                            r.vehicle_id === v.id && r.plate === filters.plate,
                        ),
                    ),
                  filters,
                ),
              ),
            ],
          ]}
        />
      )}
      <ManagementTable
        showRowCount={false}
        actionsTarget={actionsTarget}
        label={monthly ? "Combustible por mes" : "Combustible"}
        fields={
          monthly
            ? [
                ["date", "Mes", "date"],
                ["loads", "Cargas", "number"],
                ["liters", "Litros", "number"],
                ["expense", "Importe"],
                ["km", "Km evaluados", "number"],
                ["consumption", "L/100 km", "number"],
                ["trend", "Variación mensual"],
              ]
            : fields
        }
        rows={
          monthly
            ? monthRows.filter(
                (m) =>
                  !filters.search ||
                  scope.some(
                    (r) =>
                      r.occurred_at.startsWith(m.id) &&
                      matches(
                        filters.search,
                        m.id,
                        r.station,
                        r.product,
                        r.raw_data,
                      ),
                  ),
              )
            : rows
        }
        omittedColumns={vehicleId ? ["plate", "currency"] : ["currency"]}
        render={{
          ...(monthly
            ? {
                date: (r: GridRow) => (
                  <button
                    className="text-primary underline underline-offset-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange("period", String(r.from), String(r.to));
                    }}
                  >
                    {String(r.date).slice(0, 7).split("-").reverse().join("/")}
                  </button>
                ),
              }
            : {}),
          amount: (r) =>
            moneyCell(r.amount as number | null, r.currency as string | null),
        }}
        onSelect={
          monthly
            ? (r) => onChange("period", String(r.from), String(r.to))
            : onSelect
        }
        actions={[
          ...vehicleActions,
          { id: "import", label: "Importar combustible", onSelect: onImport },
        ]}
      />
    </>
  );
}
