import { fuelOdometerIssues } from "./fuelOdometer";
import { fuelPeriodSegments } from "./fuelPeriodSegments";
import { fuelIntervals } from "./managementModel";
import { normalizePlate } from "./model";
import {
  ExpensePeriods,
  expenseIdentityFields,
  expenseMoneyValue,
  expenseGroupKey,
  expensePlate,
  matchesExpensePlate,
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
  responsibleDisplay,
  rangeError,
  type FleetFilters,
  type FilterChange,
} from "./workspaceModel";
const vehicleFilterFields = [
  ["branch", "Sucursal", "branch"],
  ["department", "Departamento", "department"],
  ["brand", "Marca", "brand"],
  ["model", "Modelo", "model"],
  ["responsible", "Responsable", "responsible"],
  ["vehicleType", "Tipo de vehículo", "vehicle_type"],
  ["state", "Estado operativo", "operational_status"],
] as const;

const fields: GridField[] = [
  ["date", "Fecha", "date"],
  ["plate", "Chapa"],
  ["responsible", "Responsable"],
  ["km", "Kilometraje", "number"],
  ["distance", "Km recorrido", "number"],
  ["liters", "Litros", "number"],
  ["amount", "Importe", "number"],
  ["currency", "Moneda"],
  ["station", "Estación"],
];
const fuelIdentity = (row: ManagementData["fuel"][number]) =>
  row.vehicle_id || normalizePlate(row.plate) ? expenseGroupKey(row) : null;

function monthlyFuelMetrics(
  rows: ManagementData["fuel"],
  segments: ReturnType<typeof fuelPeriodSegments>,
) {
  const vehicles = new Set(
    rows
      .filter(
        (row) =>
          row.liters > 0 &&
          row.net_amount >= 0 &&
          /diesel|nafta|gasolina|gasoil/i.test(row.product) &&
          !/aceite|lubricante/i.test(row.product),
      )
      .map(fuelIdentity)
      .filter(Boolean),
  );
  let km = 0;
  let liters = 0;
  for (const row of rows) {
    const segment = segments.get(row.id);
    if (!segment) continue;
    km += segment.km;
    liters += segment.liters;
  }
  return {
    ...fuelMetrics(rows),
    vehicles: vehicles.size,
    distance: km || null,
    consumption: km > 0 ? (liters / km) * 100 : null,
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
function expenseConsumption(
  rows: ManagementData["fuel"],
  filters: FleetFilters,
) {
  if (rangeError(filters)) return null;
  const args = [
    filters.from,
    filters.to || undefined,
    expenseGroupKey,
  ] as const;
  return (
    fuelIntervals(rows, true, ...args).l100 ??
    fuelIntervals(rows, false, ...args).l100
  );
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
  onImport?: () => void;
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
  const vehicleMetadata = useMemo(
    () =>
      new Map(
        data.vehicles.map((vehicle) => [
          vehicle.id,
          {
            ...vehicle,
            responsible: responsibleDisplay(
              vehicle.id,
              data.responsibilityEvents,
            ),
          },
        ]),
      ),
    [data.vehicles, data.responsibilityEvents],
  );
  const scope = useMemo(
    () =>
      data.fuel.filter((row) => {
        if (!within(row.occurred_at, filters)) return false;
        if (vehicleId)
          return (
            row.vehicle_id === vehicleId &&
            matchesExpensePlate(
              expensePlate(row, vehicleMetadata),
              filters.plate,
            )
          );
        const vehicle = row.vehicle_id
          ? vehicleMetadata.get(row.vehicle_id)
          : undefined;
        const ownership = vehicle ? "Propio" : "Terceros";
        return (
          matchesExpensePlate(
            expensePlate(row, vehicleMetadata),
            filters.plate,
          ) &&
          (!filters.ownership ||
            ((vehicle || normalizePlate(row.plate)) &&
              filters.ownership === ownership)) &&
          vehicleFilterFields.every(
            ([key, , field]) =>
              !filters[key] || vehicle?.[field] === filters[key],
          )
        );
      }),
    [data.fuel, vehicleId, filters, vehicleMetadata],
  );
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const periodRows = useMemo(
    () =>
      scope.filter((r) =>
        matches(
          filters.search,
          expensePlate(r, vehicleMetadata),
          r.plate,
          r.station,
          r.product,
          r.raw_data,
        ),
      ),
    [scope, filters.search, vehicleMetadata],
  );
  const activeMonth =
    !vehicleId &&
    selectedMonth &&
    periodRows.some((row) => row.occurred_at.startsWith(selectedMonth))
      ? selectedMonth
      : null;
  const visible = useMemo(
    () =>
      activeMonth
        ? periodRows.filter((row) => row.occurred_at.startsWith(activeMonth))
        : periodRows,
    [activeMonth, periodRows],
  );
  const movementFilters = { ...filters };
  if (activeMonth) {
    const [year, month] = activeMonth.split("-").map(Number);
    const first = activeMonth + "-01";
    const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    if (!movementFilters.from || movementFilters.from < first)
      movementFilters.from = first;
    if (!movementFilters.to || movementFilters.to > last)
      movementFilters.to = last;
  }
  const periodSegments = useMemo(
    () => (vehicleId ? new Map() : fuelPeriodSegments(data.fuel, fuelIdentity)),
    [data.fuel, vehicleId],
  );
  const distanceByLoad = useMemo(() => {
    const distances = new Map<string, number>();
    fuelIntervals(
      data.fuel,
      false,
      undefined,
      undefined,
      fuelIdentity,
      distances,
    );
    return distances;
  }, [data.fuel]);
  const odometerIssues = useMemo(
    () => fuelOdometerIssues(data.fuel, fuelIdentity),
    [data.fuel],
  );
  const rows = useMemo(
    () =>
      visible.map((r) => ({
        id: r.id,
        group: expenseGroupKey(r),
        date: r.occurred_at,
        plate: expensePlate(r, vehicleMetadata),
        responsible: r.vehicle_id
          ? responsibleDisplay(r.vehicle_id, data.responsibilityEvents)
          : null,
        km: odometerIssues.has(r) ? null : r.odometer_km,
        originalKm: r.odometer_km,
        odometerIssue: odometerIssues.get(r),
        distance: distanceByLoad.get(r.id) ?? null,
        liters: r.liters,
        amount: r.net_amount,
        currency: r.currency,
        station: r.station,
      })),
    [
      visible,
      vehicleMetadata,
      data.responsibilityEvents,
      distanceByLoad,
      odometerIssues,
    ],
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
        more={
          !vehicleId &&
          vehicleFilterFields.map(([key, label, field]) => (
            <Choice
              key={key}
              label={label}
              value={filters[key] ?? ""}
              onChange={(value) => onChange(key, value)}
              options={options(
                [...vehicleMetadata.values()].map((vehicle) => vehicle[field]),
              )}
            />
          ))
        }
      >
        <PeriodFields filters={filters} onChange={onChange} />
        {!vehicleId && (
          <Choice
            label="Pertenencia"
            value={filters.ownership ?? ""}
            onChange={(value) => onChange("ownership", value)}
            options={["Propio", "Terceros"]}
          />
        )}
        {!vehicleId && (
          <Choice
            label="Chapa"
            value={filters.plate}
            onChange={(v) => onChange("plate", v)}
            options={options(
              data.fuel.map((row) => expensePlate(row, vehicleMetadata)),
            )}
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
                vehicleId
                  ? fleetConsumption(
                      data.fuel,
                      data.vehicles.filter(
                        (vehicle) => vehicle.id === vehicleId,
                      ),
                      movementFilters,
                    )
                  : monthlyFuelMetrics(
                      scope.filter(
                        (row) =>
                          within(row.occurred_at, movementFilters) &&
                          (!view.group ||
                            expenseGroupKey(row) === view.group.id),
                      ),
                      periodSegments,
                    ).consumption,
              ),
            ],
          ]}
        />
      )}
      {!vehicleId && (
        <>
          <ExpensePeriods
            title="Gasto en combustible por periodo"
            chronological
            description="Los tramos se contabilizan en el mes de la carga que los cierra."
            rows={periodRows}
            selectedMonth={activeMonth}
            onSelectMonth={setSelectedMonth}
            date={(row) => row.occurred_at}
            fields={[
              ["vehicles", "Vehículos que cargaron", "number"],
              ["loads", "Cargas", "number"],
              ["distance", "Kilómetros recorridos", "number"],
              ["consumption", "Consumo promedio", "number"],
              ["liters", "Litros", "number"],
            ]}
            metrics={(rows) => monthlyFuelMetrics(rows, periodSegments)}
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
                model: g.model,
                responsible: g.responsible,
                km: g.km,
                ...fuelMetrics(g.rows),
                consumption: byBranch
                  ? null
                  : expenseConsumption(
                      data.fuel.filter((row) => expenseGroupKey(row) === g.id),
                      movementFilters,
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
          ...(!byVehicle && !monthly
            ? {
                km: (row: GridRow) =>
                  row.odometerIssue ? (
                    <span
                      className="text-muted-foreground"
                      title={
                        fmt(row.originalKm as number | null) +
                        " km en el comprobante. " +
                        row.odometerIssue
                      }
                    >
                      Por verificar
                    </span>
                  ) : (
                    fmt(row.km as number | null)
                  ),
              }
            : {}),
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
          ...(onImport ? [{ id: "import", label: "Importar combustible", onSelect: onImport }] : []),
        ]}
      />
    </>
  );
}
