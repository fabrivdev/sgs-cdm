import { PageHeader } from "@/components/layout/AppPrimitives";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ManagedVehicle } from "./managementModel";
import { vehicleMileageDisplay } from "./managementModel";
import { vehicleLatestReading } from "./model";
import type { ManagementData } from "./VehiclesList";
import type { GridRow } from "./ManagementTable";
import { FuelView } from "./FuelView";
import { MaintenanceView } from "./MaintenanceView";
import { ReadingsView } from "./ReadingsView";
import { SummaryCards } from "./workspaceShared";
import {
  fmt,
  mileage,
  responsible,
  within,
  fuelMoney,
  invoiceMoney,
  fleetConsumption,
  type FleetFilters,
  type FilterChange,
} from "./workspaceModel";
export function VehicleDetail({
  vehicle,
  data,
  filters,
  onChange,
  tab,
  onTab,
  onBack,
  onEdit,
  onSelect,
  onImport,
  onSaved,
}: {
  vehicle: ManagedVehicle;
  data: ManagementData;
  filters: FleetFilters;
  onChange: FilterChange;
  tab: string;
  onTab: (v: string) => void;
  onBack: () => void;
  onEdit: () => void;
  onSelect: (r: GridRow) => void;
  onImport: () => void;
  onSaved: () => Promise<void>;
}) {
  const fuel = data.fuel.filter(
      (r) => r.vehicle_id === vehicle.id && within(r.occurred_at, filters),
    ),
    invoices = data.invoices.filter(
      (r) =>
        r.vehicle_id === vehicle.id &&
        within(r.performed_on ?? r.invoice_date, filters),
    );
  const km = vehicleMileageDisplay(
    vehicle,
    vehicleLatestReading(vehicle.id, data.readings),
  );
  return (
    <>
      <Button variant="ghost" size="sm" onClick={onBack}>
        ← Vehículos
      </Button>
      <PageHeader
        title={vehicle.plate}
        tabs={
          <Tabs value={tab} onValueChange={onTab}>
            <TabsList>
              {["Combustible", "Mantenimiento", "Lecturas"].map((t) => (
                <TabsTrigger key={t} value={t}>
                  {t}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
        actions={
          <Button variant="outline" size="sm" onClick={onEdit}>
            Editar
          </Button>
        }
      />
      <dl className="grid grid-cols-4 gap-3 border-y py-2 text-xs">
        {[
          [
            "Marca/modelo",
            [vehicle.brand, vehicle.model].filter(Boolean).join(" "),
          ],
          ["Responsable", responsible(vehicle.id, data.responsibilityEvents)],
          ["Sucursal", vehicle.branch],
          ["Estado", vehicle.operational_status],
        ].map(([l, v]) => (
          <div key={l}>
            <dt className="text-[11px] text-muted-foreground">{l}</dt>
            <dd>{v || "—"}</dd>
          </div>
        ))}
      </dl>
      <SummaryCards
        items={[
          [
            "Km actuales",
            <span title={km.source ?? undefined}>{fmt(km.km)}</span>,
          ],
          [
            "Km del período",
            fmt(mileage(data.readings, vehicle.id, filters, data.fuel)),
          ],
          ["Litros", fmt(fuel.reduce((n, r) => n + r.liters, 0))],
          ["Gasto combustible", fuelMoney(fuel)],
          ["Gasto mantenimiento", invoiceMoney(invoices)],
          [
            "Consumo estimado (L/100 km)",
            fmt(fleetConsumption(data.fuel, [vehicle], filters)),
          ],
        ]}
      />
      {tab === "Lecturas" ? (
        <ReadingsView
          data={data}
          vehicleId={vehicle.id}
          filters={filters}
          onChange={onChange}
          onSaved={onSaved}
        />
      ) : tab === "Mantenimiento" ? (
        <MaintenanceView
          data={data}
          vehicleId={vehicle.id}
          filters={filters}
          onChange={onChange}
          onSelect={onSelect}
          showSummary={false}
        />
      ) : (
        <FuelView
          data={data}
          vehicleId={vehicle.id}
          filters={filters}
          onChange={onChange}
          onSelect={onSelect}
          onImport={onImport}
          showSummary={false}
        />
      )}
    </>
  );
}
