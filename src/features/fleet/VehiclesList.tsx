import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/AppPrimitives";
import { ManagementTable, type GridField } from "./ManagementTable";
import { type ManagedVehicle, vehicleMileageDisplay } from "./managementModel";
import { vehicleLatestReading } from "./model";
import type { loadManagement } from "./managementApi";
import {
  Choice,
  FleetFilterBar,
  PeriodFields,
  SummaryCards,
} from "./workspaceShared";
import {
  options,
  matches,
  mileage,
  responsible,
  within,
  fmt,
  fuelMoney,
  invoiceMoney,
  type FleetFilters,
  type FilterChange,
} from "./workspaceModel";
export type ManagementData = Awaited<ReturnType<typeof loadManagement>>;
const fields: GridField[] = [
  ["plate", "Chapa"],
  ["model", "Marca/modelo"],
  ["responsible", "Responsable"],
  ["branch", "Sucursal"],
  ["state", "Estado"],
  ["km", "Última lectura (km)", "number"],
  ["distance", "Km del período", "number"],
];
export function VehiclesList({
  data,
  filters,
  onChange,
  onOpen,
  onCreate,
}: {
  data: ManagementData;
  filters: FleetFilters;
  onChange: FilterChange;
  onOpen: (id: string) => void;
  onCreate: () => void;
}) {
  const vehicles = useMemo(
    () =>
      data.vehicles.filter(
        (v) =>
          (!filters.state || v.operational_status === filters.state) &&
          (!filters.branch || v.branch === filters.branch) &&
          (!filters.department || v.department === filters.department) &&
          (!filters.brand || v.brand === filters.brand) &&
          matches(
            filters.search,
            v.plate,
            v.brand,
            v.model,
            responsible(v.id, data.responsibilityEvents),
          ),
      ),
    [data, filters],
  );
  const rows = useMemo(
    () =>
      vehicles.map((v) => ({
        id: v.id,
        plate: v.plate,
        model: [v.brand, v.model].filter(Boolean).join(" "),
        responsible: responsible(v.id, data.responsibilityEvents),
        branch: v.branch,
        state: v.operational_status,
        km: vehicleMileageDisplay(v, vehicleLatestReading(v.id, data.readings))
          .km,
        distance: mileage(data.readings, v.id, filters),
      })),
    [vehicles, data, filters],
  );
  const ids = new Set(vehicles.map((v) => v.id));
  const distances = rows
    .map((r) => r.distance)
    .filter((n): n is number => n != null);
  return (
    <>
      <PageHeader
        title="Vehículos"
        actions={
          <Button size="sm" onClick={onCreate}>
            Nuevo vehículo
          </Button>
        }
      />
      <FleetFilterBar
        filters={filters}
        onChange={onChange}
        more={
          <>
            <PeriodFields filters={filters} onChange={onChange} />
            <Choice
              label="Marca"
              value={filters.brand}
              onChange={(v) => onChange("brand", v)}
              options={options(data.vehicles.map((v) => v.brand))}
            />
          </>
        }
      >
        <Choice
          label="Estado"
          value={filters.state}
          onChange={(v) => onChange("state", v)}
          options={options(data.vehicles.map((v) => v.operational_status))}
        />
        <Choice
          label="Sucursal"
          value={filters.branch}
          onChange={(v) => onChange("branch", v)}
          options={options(data.vehicles.map((v) => v.branch))}
        />
        <Choice
          label="Departamento"
          value={filters.department}
          onChange={(v) => onChange("department", v)}
          options={options(data.vehicles.map((v) => v.department))}
        />
      </FleetFilterBar>
      <SummaryCards
        items={[
          [
            "Vehículos activos",
            vehicles.filter((v) => v.lifecycle_status === "Activa").length,
          ],
          [
            "Km del período",
            distances.length ? fmt(distances.reduce((a, b) => a + b, 0)) : "—",
          ],
          [
            "Gasto combustible",
            fuelMoney(
              data.fuel.filter(
                (r) =>
                  ids.has(r.vehicle_id ?? "") && within(r.occurred_at, filters),
              ),
            ),
          ],
          [
            "Gasto mantenimiento",
            invoiceMoney(
              data.invoices.filter(
                (r) =>
                  ids.has(r.vehicle_id ?? "") &&
                  within(r.performed_on ?? r.invoice_date, filters),
              ),
            ),
          ],
        ]}
      />
      <ManagementTable
        label="Vehículos"
        fields={fields}
        rows={rows}
        onSelect={(r) => onOpen(r.id)}
      />
    </>
  );
}
