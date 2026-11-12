import { fuelIntervals } from "./managementModel";
import { normalizePlate } from "./model";
import {
  ExpensePeriods,
  expenseIdentityFields,
  expenseMoneyValue,
  expenseGroupKey,
  groupExpenses,
  useExpenseView,
} from "./expenseViews";
import { ArrowUp, ArrowDown, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fuelMonthRows, usesMonthlyFuel } from "./vehicleFuelSummary";
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
  fmt,
  fuelMoney,
  fleetConsumption,
  type FleetFilters,
  type FilterChange,
} from "./workspaceModel";
const fields: GridField[] = [
  ["date", "Fecha", "date"],
  ["plate", "Chapa"],
  ["km", "Kilometraje", "number"],
  ["liters", "Litros", "number"],
  ["amount", "Importe", "number"],
  ["currency", "Moneda"],
  ["station", "Estación"],
];
function monthlyFuelMetrics(rows: ManagementData["fuel"]) {
  const identity = (row: ManagementData["fuel"][number]) =>
    row.vehicle_id || normalizePlate(row.plate) ? expenseGroupKey(row) : null;
  const vehicles = new Set(
    rows
      .filter(
        (row) =>
          row.liters > 0 &&
          row.net_amount >= 0 &&
          /diesel|nafta|gasolina|gasoil/i.test(row.product) &&
          !/aceite|lubricante/i.test(row.product),
      )
      .map(identity)
      .filter(Boolean),
  );
  const distance = fuelIntervals(rows, true, undefined, undefined, identity);
  return {
    ...fuelMetrics(rows),
    vehicles: vehicles.size,
    distance: distance.intervals ? distance.km : null,
  };
}

function fuelMetrics(rows: ManagementData["fuel"]) {
  return {
    loads: rows.length,
    liters: rows.reduce((sum, row) => sum + row.liters, 0),
    expenseLabel: fuelMoney(rows),
    expense: expenseMoneyValue(
      rows.map((row) => ({ amount: row.net_amount, currency: row.currency })),
    ),
  };
}
export function FuelView({
  data,
  vehicleId,
  filters,
  onChange,
  onSelect,
  onImport,
  showSummary = true,
  detailSummary,
  vehicleActions = [],
}: {
  data: ManagementData;
  vehicleId?: string;
  filters: FleetFilters;
  onChange: FilterChange;
  onSelect: (r: GridRow) => void;
  onImport: () => void;
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
        group: expenseGroupKey(r),
        date: r.occurred_at,
        plate: r.plate,
        km: r.odometer_km,
        liters: r.liters,
        amount: r.net_amount,
        currency: r.currency,
        station: r.station,
      })),
    [visible],
  );
  const totalRows = vehicleId
    ? scope
    : visible.filter(
        (row) => !view.group || expenseGroupKey(row) === view.group.id,
      );
  const [returnPeriod, setReturnPeriod] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const openMonth = (r: GridRow) => {
    setReturnPeriod({ from: filters.from, to: filters.to });
    onChange("period", String(r.from), String(r.to));
  };
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
      {!monthly && returnPeriod && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => {
            onChange("period", returnPeriod.from, returnPeriod.to);
            setReturnPeriod(null);
          }}
        >
          ← Volver al período anterior
        </Button>
      )}
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
      {detailSummary}
      {showSummary && (
        <SummaryCards
          items={[
            ["Litros", fmt(totalRows.reduce((n, r) => n + r.liters, 0))],
            ["Gasto combustible", fuelMoney(totalRows)],
            ["Cargas", totalRows.length],
            [
              "Consumo estimado (L/100 km)",
              fmt(
                fleetConsumption(
                  data.fuel,
                  data.vehicles
                    .filter((v) => !vehicleId || v.id === vehicleId)
                    .filter(
                      (v) => !view.group || "vehicle:" + v.id === view.group.id,
                    )
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
      {!vehicleId && (
        <>
          <ExpensePeriods
            rows={visible}
            date={(row) => row.occurred_at}
            fields={[
              ["vehicles", "Vehículos que cargaron", "number"],
              ["loads", "Cargas", "number"],
              ["distance", "Kilómetros recorridos", "number"],
              ["liters", "Litros", "number"],
            ]}
            metrics={monthlyFuelMetrics}
          />
        </>
      )}
      <FleetExpenseTable
        general={!vehicleId}
        switcher={view.switcher}
        key={vehicleId ? "vehicle" : view.mode}
        detailStyle={!!vehicleId}
        showRowCount={false}
        actionsTarget={actionsTarget}
        label={
          byVehicle
            ? byBranch
              ? "Combustible por sucursal"
              : "Combustible por vehículo"
            : monthly
              ? "Combustible por mes"
              : "Combustible"
        }
        fields={
          byVehicle
            ? [
                ...expenseIdentityFields(byBranch),
                ["loads", "Cargas", "number"],
                ["liters", "Litros", "number"],
                ["expense", "Monto", "number"],
                ...(!byBranch
                  ? [["consumption", "L/100 km", "number"] as GridField]
                  : []),
              ]
            : monthly
              ? [
                  ["date", "Mes", "date"],
                  ["loads", "Cargas", "number"],
                  ["liters", "Litros", "number"],
                  ["expense", "Monto"],
                  ["km", "Km evaluados", "number"],
                  ["consumption", "L/100 km", "number"],
                  ["trend", "Variación mensual"],
                ]
              : fields
        }
        rows={
          byVehicle
            ? groupExpenses(visible, data, byBranch).map((g) => ({
                id: g.id,
                plate: g.plate,
                responsible: g.responsible,
                km: g.km,
                ...fuelMetrics(g.rows),
                consumption: byBranch
                  ? null
                  : fleetConsumption(
                      data.fuel,
                      data.vehicles.filter(
                        (v) =>
                          expenseGroupKey({
                            vehicle_id: v.id,
                            plate: v.plate,
                          }) === g.id,
                      ),
                      filters,
                    ),
              }))
            : monthly
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
              : rows.filter(
                  (row) =>
                    vehicleId || !view.group || row.group === view.group.id,
                )
        }
        omittedColumns={vehicleId ? ["plate", "currency"] : ["currency"]}
        render={{
          expense: (r) => (
            <span className="block text-right tabular-nums">
              {r.expenseLabel ?? r.expense}
            </span>
          ),
          ...(monthly
            ? {
                consumption: (r: GridRow) => (
                  <span className="inline-flex items-center justify-end gap-1 tabular-nums">
                    {fmt(r.consumption as number | null)}
                    {r.consumption != null &&
                      r.average != null &&
                      Number(r.consumption) > Number(r.average) && (
                        <span
                          className="text-destructive"
                          role="img"
                          aria-label="Supera el consumo promedio del período"
                          title={
                            "Supera el promedio del período: " +
                            fmt(r.average as number) +
                            " L/100 km"
                          }
                        >
                          <TriangleAlert
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                        </span>
                      )}
                  </span>
                ),
                trend: (r: GridRow) => (
                  <span
                    className={
                      "inline-flex items-center gap-1 tabular-nums " +
                      (Number(r.trendValue) > 0
                        ? "text-destructive"
                        : Number(r.trendValue) < 0
                          ? "text-primary"
                          : "text-muted-foreground")
                    }
                  >
                    {Number(r.trendValue) > 0 ? (
                      <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : Number(r.trendValue) < 0 ? (
                      <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : null}
                    {r.trend}
                  </span>
                ),
                date: (r: GridRow) => (
                  <button
                    className="text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={(e) => {
                      e.stopPropagation();
                      openMonth(r);
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
          byBranch
            ? undefined
            : byVehicle
              ? (row) => view.open(row.id, String(row.plate))
              : monthly
                ? openMonth
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
