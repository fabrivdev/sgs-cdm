import { useState } from "react";
import {
  ResponsiveDrawer,
  ResponsiveDrawerHeader,
  ResponsiveDrawerBody,
} from "@/components/ui/responsive-drawer";
import { ReadingsView } from "./ReadingsView";
import { initialFilters } from "./workspaceModel";
import { todayInParaguay } from "./period";
import { fuelMonthRows } from "./vehicleFuelSummary";
import { currentVehicleMileage, maintenanceAlert } from "./maintenanceAlert";
import { PageHeader } from "@/components/layout/AppPrimitives";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ManagedVehicle } from "./managementModel";
import type { ManagementData } from "./VehiclesList";
import type { GridRow } from "./ManagementTable";
import { FuelView } from "./FuelView";
import { MaintenanceView } from "./MaintenanceView";
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
  const [administration, setAdministration] = useState(false);
  const [adminFilters, setAdminFilters] = useState({ ...initialFilters });
  const adminChange: FilterChange = (key, value, to) =>
    setAdminFilters((f) =>
      key === "reset"
        ? { ...initialFilters }
        : key === "period"
          ? { ...f, from: value, to: to ?? "" }
          : { ...f, [key]: value },
    );
  const vehicleActions = [
    {
      id: "vehicle-administration",
      label: "Kilometraje y responsable",
      onSelect: () => setAdministration(true),
    },
  ];
  const fuel = data.fuel.filter(
      (r) => r.vehicle_id === vehicle.id && within(r.occurred_at, filters),
    ),
    invoices = data.invoices.filter(
      (r) =>
        r.vehicle_id === vehicle.id &&
        within(r.performed_on ?? r.invoice_date, filters),
    );
  const km = currentVehicleMileage(vehicle, data.readings, data.fuel);
  const alert = maintenanceAlert(vehicle, km, data.history, data.invoices);
  const trend = fuelMonthRows(
    data.fuel.filter((r) => r.vehicle_id === vehicle.id),
    filters,
  )
    .filter((r) => r.to < todayInParaguay())
    .at(-1);
  const lastWork = [
    ...data.history
      .filter((r) => r.vehicle_id === vehicle.id)
      .map((r) => r.occurred_on),
    ...data.invoices
      .filter((r) => r.vehicle_id === vehicle.id && r.status === "uploaded")
      .map((r) => r.performed_on),
  ]
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);
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
              {["Combustible", "Mantenimiento"].map((t) => (
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
        items={
          tab === "Mantenimiento"
            ? [
                [
                  "Último mantenimiento registrado",
                  lastWork?.split("-").reverse().join("/") ?? "—",
                ],
                ["Km actuales", fmt(km.km)],
                ["Próximo mantenimiento", alert.label],
                ["Gasto mantenimiento", invoiceMoney(invoices)],
              ]
            : [
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
                [
                  "Variación mensual",
                  trend && trend.trend !== "—" ? (
                    <span title="Variación de L/100 km frente al mes anterior completo">
                      {trend.trend}{" "}
                      <span className="text-xs text-muted-foreground">
                        ({trend.date.slice(5, 7)}/{trend.date.slice(0, 4)})
                      </span>
                    </span>
                  ) : (
                    "—"
                  ),
                ],
                [
                  "Consumo promedio (L/100 km)",
                  fmt(fleetConsumption(data.fuel, [vehicle], filters)),
                ],
              ]
        }
      />
      {tab === "Mantenimiento" ? (
        <MaintenanceView
          data={data}
          vehicleId={vehicle.id}
          filters={filters}
          onChange={onChange}
          onSelect={onSelect}
          showSummary={false}
          vehicleActions={vehicleActions}
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
          vehicleActions={vehicleActions}
        />
      )}
      <ResponsiveDrawer
        title="Kilometraje y responsable"
        size="xl"
        open={administration}
        onOpenChange={setAdministration}
      >
        <ResponsiveDrawerHeader>
          <h2>Kilometraje y responsable</h2>
        </ResponsiveDrawerHeader>
        <ResponsiveDrawerBody>
          <ReadingsView
            data={data}
            vehicleId={vehicle.id}
            filters={adminFilters}
            onChange={adminChange}
            onSaved={onSaved}
          />
        </ResponsiveDrawerBody>
      </ResponsiveDrawer>
    </>
  );
}
