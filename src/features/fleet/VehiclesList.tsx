import { currentVehicleMileage, maintenanceAlert } from "./maintenanceAlert";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/AppPrimitives";
import { ManagementTable, type GridField } from "./ManagementTable";
import { type ManagedVehicle } from "./managementModel";
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
  responsibleDisplay,
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
  ["maintenance", "Próximo mantenimiento"],
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
  const [actionsTarget, setActionsTarget] = useState<HTMLDivElement | null>(
    null,
  );
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
        km: currentVehicleMileage(v, data.readings, data.fuel).km,
        maintenance: maintenanceAlert(
          v,
          currentVehicleMileage(v, data.readings, data.fuel),
          data.history,
          data.invoices,
        ).label,
        distance: mileage(data.readings, v.id, filters, data.fuel),
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
        secondaryActions={<div ref={setActionsTarget} />}
        filters={filters}
        onChange={onChange}
        more={
          <>
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

            <Choice
              label="Marca"
              value={filters.brand}
              onChange={(v) => onChange("brand", v)}
              options={options(data.vehicles.map((v) => v.brand))}
            />
          </>
        }
      >
        <PeriodFields filters={filters} onChange={onChange} />
        <Choice
          label="Estado"
          value={filters.state}
          onChange={(v) => onChange("state", v)}
          options={options(data.vehicles.map((v) => v.operational_status))}
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
        showRowCount={false}
        actionsTarget={actionsTarget}
        fields={fields}
        rows={rows}
        render={{
          responsible: (r) => (
            <span title={String(r.responsible ?? "")}>
              {responsibleDisplay(r.id, data.responsibilityEvents) ?? "—"}
            </span>
          ),
          maintenance: (r) => (
            <span
              className={
                String(r.maintenance).startsWith("Vencido") ||
                r.maintenance === "Corresponde ahora"
                  ? "text-destructive font-medium"
                  : undefined
              }
            >
              {r.maintenance}
            </span>
          ),
        }}
        onSelect={(r) => onOpen(r.id)}
      />
    </>
  );
}
