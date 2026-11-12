import { useState } from "react";
import { SalesViewSwitcher } from "@/components/ventas/SalesViewSwitcher";
import { normalizePlate } from "./model";
import type { ManagedVehicle } from "./managementModel";

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
  vehicles: ManagedVehicle[],
) {
  const plates = new Map(
    vehicles.map((vehicle) => [vehicle.id, vehicle.plate]),
  );
  const groups = new Map<string, { id: string; plate: string; rows: T[] }>();
  for (const row of rows) {
    const id = expenseGroupKey(row);
    const group = groups.get(id);
    if (group) group.rows.push(row);
    else
      groups.set(id, {
        id,
        plate: plates.get(row.vehicle_id ?? "") ?? row.plate,
        rows: [row],
      });
  }
  return [...groups.values()];
}

export function useExpenseView() {
  const [view, setView] = useState<"summary" | "detail">("summary");
  const [group, setGroup] = useState<{ id: string; plate: string } | null>(
    null,
  );
  return {
    summary: view === "summary",
    group,
    open: (id: string, plate: string) => {
      setGroup({ id, plate });
      setView("detail");
    },
    switcher: (
      <div className="self-start">
        <SalesViewSwitcher
          value={view}
          options={[
            ["summary", "Resumen"],
            ["detail", group ? "Detalle · " + group.plate : "Detalle"],
          ]}
          onChange={(next) => {
            setGroup(null);
            setView(next);
          }}
        />
      </div>
    ),
  };
}
