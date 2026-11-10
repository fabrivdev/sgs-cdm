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
}: {
  data: ManagementData;
  vehicleId?: string;
  filters: FleetFilters;
  onChange: FilterChange;
  onSelect: (r: GridRow) => void;
  onImport: () => void;
  showSummary?: boolean;
}) {
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
  return (
    <>
      <FleetFilterBar filters={filters} onChange={onChange}>
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
              fmt(fleetConsumption(scope, data.vehicles)),
            ],
          ]}
        />
      )}
      <ManagementTable
        label="Combustible"
        fields={fields}
        rows={rows}
        omittedColumns={vehicleId ? ["plate", "currency"] : ["currency"]}
        render={{
          amount: (r) =>
            moneyCell(r.amount as number | null, r.currency as string | null),
        }}
        onSelect={onSelect}
        actions={[
          { id: "import", label: "Importar combustible", onSelect: onImport },
        ]}
      />
    </>
  );
}
