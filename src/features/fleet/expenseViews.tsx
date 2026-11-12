import { Panel } from "@/components/layout/AppPrimitives";
import { FleetSalesTable } from "./FleetSalesTable";
import { useState } from "react";
import { SalesViewSwitcher } from "@/components/ventas/SalesViewSwitcher";
import { normalizePlate } from "./model";
import type { ManagementData } from "./VehiclesList";
import { currentVehicleMileage, latestFuelMileage } from "./maintenanceAlert";
import { responsibleDisplay } from "./workspaceModel";
import { type GridField, type GridRow } from "./ManagementTable";

export function expensePlate(
  row: { vehicle_id: string | null; plate: string },
  vehicles: ReadonlyMap<string, { plate: string }>,
) {
  const plate =
    (row.vehicle_id && vehicles.get(row.vehicle_id)?.plate) || row.plate;
  return normalizePlate(plate) || plate;
}

export function matchesExpensePlate(plate: string, selected: string) {
  return !selected || normalizePlate(plate) === normalizePlate(selected);
}

export function expenseGroupKey(row: {
  vehicle_id: string | null;
  plate: string;
}) {
  return row.vehicle_id
    ? "vehicle:" + row.vehicle_id
    : "plate:" + normalizePlate(row.plate);
}

export function groupExpenses<T extends Parameters<typeof expenseGroupKey>[0]>(
  rows: T[],
  data: ManagementData,
  byBranch: boolean,
) {
  const vehicles = new Map(
    data.vehicles.map((vehicle) => [vehicle.id, vehicle]),
  );
  const unlinkedFuelByPlate = new Map<string, ManagementData["fuel"]>();
  if (!byBranch) {
    for (const load of data.fuel) {
      if (load.vehicle_id) continue;
      const plate = normalizePlate(load.plate);
      if (!plate) continue;
      const loads = unlinkedFuelByPlate.get(plate) ?? [];
      loads.push(load);
      unlinkedFuelByPlate.set(plate, loads);
    }
  }
  const groups = new Map<
    string,
    {
      id: string;
      plate: string;
      rows: T[];
      vehicleId: string | null;
      model: string | null;
      responsible: string | null;
      km: number | null;
    }
  >();
  for (const row of rows) {
    const vehicle = vehicles.get(row.vehicle_id ?? "");
    const id = byBranch
      ? vehicle?.branch || "Sin sucursal"
      : expenseGroupKey(row);
    const group = groups.get(id);
    if (group) group.rows.push(row);
    else
      groups.set(id, {
        id,
        plate: byBranch ? id : expensePlate(row, vehicles),
        model: byBranch ? null : (vehicle?.model ?? null),
        vehicleId: byBranch ? null : (vehicle?.id ?? null),
        responsible:
          !byBranch && vehicle
            ? responsibleDisplay(vehicle.id, data.responsibilityEvents)
            : null,
        km: byBranch
          ? null
          : vehicle
            ? currentVehicleMileage(vehicle, data.readings, data.fuel).km
            : (latestFuelMileage(
                unlinkedFuelByPlate.get(normalizePlate(row.plate)) ?? [],
              )?.km ?? null),
        rows: [row],
      });
  }
  return [...groups.values()];
}

export function useExpenseView() {
  const [view, setView] = useState<"summary" | "branch" | "detail">("summary");
  const [group, setGroup] = useState<{ id: string; plate: string } | null>(
    null,
  );
  return {
    mode: view,
    summary: view !== "detail",
    group,
    open: (id: string, plate: string) => {
      setGroup({ id, plate });
      setView("detail");
    },
    switcher: (
      <SalesViewSwitcher
        value={view}
        options={[
          ["summary", "Vehículo"],
          ["branch", "Sucursales"],
          ["detail", group ? "Detalle · " + group.plate : "Detalle"],
        ]}
        onChange={(next) => {
          setGroup(null);
          setView(next);
        }}
      />
    ),
  };
}

export function expenseIdentityFields(branch: boolean): GridField[] {
  return branch
    ? [["plate", "Sucursal"]]
    : [
        ["plate", "Chapa"],
        ["model", "Modelo"],
        ["responsible", "Responsable"],
        ["km", "Kilometraje actual", "number"],
      ];
}

export function expenseMoneyValue(
  rows: { amount: number | null; currency: string | null }[],
) {
  const known = rows.filter((row) => row.amount != null && row.currency);
  return known.length && new Set(known.map((row) => row.currency)).size === 1
    ? known.reduce((sum, row) => sum + Number(row.amount), 0)
    : null;
}

const shortMonth = new Intl.DateTimeFormat("es-PY", {
  month: "short",
  timeZone: "UTC",
});
function monthLabel(value: string) {
  const month = shortMonth
    .format(new Date(value + "T00:00:00Z"))
    .replace(/\.$/, "");
  return month + ". " + value.slice(0, 4);
}

export function ExpensePeriods<T>({
  rows,
  date,
  metrics,
  fields,
  title = "Por período",
  chronological = false,
  description,
  selectedMonth,
  onSelectMonth,
}: {
  title?: string;
  chronological?: boolean;
  description?: string;
  selectedMonth?: string | null;
  onSelectMonth?: (month: string | null) => void;
  rows: T[];
  date: (row: T) => string | null;
  metrics: (rows: T[]) => Omit<GridRow, "id">;
  fields: GridField[];
}) {
  const months = new Map<string, T[]>();
  for (const row of rows) {
    const month = date(row)?.slice(0, 7) || "";
    const group = months.get(month);
    if (group) group.push(row);
    else months.set(month, [row]);
  }
  return (
    <Panel className="sales-periods space-y-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {selectedMonth && onSelectMonth && (
          <button
            type="button"
            className="rounded-full border bg-accent px-2.5 py-1 text-xs"
            onClick={() => onSelectMonth(null)}
          >
            Ver período completo ×
          </button>
        )}
      </div>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      <FleetSalesTable
        label={title}
        chronological={chronological}
        selected={onSelectMonth ? (row) => row.id === selectedMonth : undefined}
        onSelect={
          onSelectMonth
            ? (row) => onSelectMonth(row.id === selectedMonth ? null : row.id)
            : undefined
        }
        fields={[
          ["date", "Mes", "date"],
          ...fields,
          ["expense", "Monto", "number"],
        ]}
        rows={[...months].map(([month, group]) => ({
          ...metrics(group),
          id: month || "undated",
          date: month ? month + "-01" : null,
        }))}
        render={{
          date: (row) =>
            row.date ? monthLabel(String(row.date)) : "Sin fecha",
          expense: (row) => row.expenseLabel,
        }}
      />
    </Panel>
  );
}
