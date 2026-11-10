import {
  Gauge,
  Route,
  Droplets,
  Coins,
  TrendingUp,
  CalendarDays,
  Fuel,
  Wrench,
} from "lucide-react";
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
import { ManagementTable, type GridRow } from "./ManagementTable";
import { estimatedConsumption } from "./managementModel";
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
  const [calculation, setCalculation] = useState(false);
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
  const consumption = estimatedConsumption(
    data.fuel.filter((r) => r.vehicle_id === vehicle.id),
    filters.from,
    filters.to || "9999-12-31",
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
  const detailSummary = (
    <SummaryCards
      icons={
        tab === "Combustible"
          ? [
              <Gauge size={18} />,
              <Route size={18} />,
              <Droplets size={18} />,
              <Coins size={18} />,
              <TrendingUp size={18} />,
              <Gauge size={18} />,
            ]
          : [
              <CalendarDays size={18} />,
              <Wrench size={18} />,
              <Coins size={18} />,
            ]
      }
      items={
        tab === "Mantenimiento"
          ? [
              [
                "Último mantenimiento",
                lastWork?.split("-").reverse().join("/") ?? "—",
              ],
              ["Próximo mantenimiento", alert.label],
              ["Gasto documentado del período", invoiceMoney(invoices)],
            ]
          : [
              ["Km actuales", fmt(km.km)],
              [
                "Km del período",
                fmt(mileage(data.readings, vehicle.id, filters, data.fuel)),
              ],
              ["Litros", fmt(fuel.reduce((n, r) => n + r.liters, 0))],
              ["Gasto combustible", fuelMoney(fuel)],
              [
                "Variación mensual",
                trend && trend.trend !== "—" ? (
                  <span>
                    {trend.trend}
                    <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                      ({trend.date.slice(0, 7).split("-").reverse().join("/")})
                    </span>
                  </span>
                ) : (
                  "—"
                ),
              ],
              [
                "Consumo promedio",
                <span>
                  {fmt(fleetConsumption(data.fuel, [vehicle], filters))}
                  <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                    L/100 km
                  </span>
                </span>,
              ],
            ]
      }
    />
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
              {["Combustible", "Mantenimiento"].map((t) => (
                <TabsTrigger key={t} value={t}>
                  {t === "Combustible" ? (
                    <Fuel className="mr-1.5 h-4 w-4" />
                  ) : (
                    <Wrench className="mr-1.5 h-4 w-4" />
                  )}
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
      <dl className="grid grid-cols-4 gap-4 rounded-lg border bg-primary/5 px-4 py-3 text-xs">
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
      {tab === "Mantenimiento" ? (
        <MaintenanceView
          data={data}
          vehicleId={vehicle.id}
          filters={filters}
          onChange={onChange}
          onSelect={onSelect}
          showSummary={false}
          detailSummary={detailSummary}
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
          detailSummary={detailSummary}
          vehicleActions={[
            ...vehicleActions,
            {
              id: "consumption-calculation",
              label: "Detalle del cálculo de consumo",
              onSelect: () => setCalculation(true),
            },
          ]}
        />
      )}
      <ResponsiveDrawer
        title="Cálculo de consumo"
        size="xl"
        open={calculation}
        onOpenChange={setCalculation}
      >
        <ResponsiveDrawerHeader>
          <h2>Cálculo de consumo</h2>
        </ResponsiveDrawerHeader>
        <ResponsiveDrawerBody className="space-y-3">
          <dl className="grid grid-cols-3 gap-3 text-sm">
            {[
              [
                "Litros evaluados",
                consumption.intervals ? fmt(consumption.liters) : "—",
              ],
              [
                "Km evaluados",
                consumption.intervals ? fmt(consumption.km) : "—",
              ],
              ["Consumo estimado L/100 km", fmt(consumption.l100)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] text-muted-foreground">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">
            Litros evaluados ÷ kilómetros evaluados × 100. Se usan intervalos
            válidos; se excluyen lecturas inconsistentes. Los litros cargados y
            los importes conservan todos los movimientos.
          </p>
          <ManagementTable
            label="Cálculo por mes"
            showRowCount={false}
            actionsTarget={null}
            fields={[
              ["date", "Mes", "date"],
              ["evaluatedLiters", "Litros evaluados", "number"],
              ["km", "Km evaluados", "number"],
              ["intervals", "Intervalos", "number"],
              ["coverageFrom", "Desde", "date"],
              ["coverageTo", "Hasta", "date"],
              ["consumption", "L/100 km", "number"],
            ]}
            rows={fuelMonthRows(
              data.fuel.filter((r) => r.vehicle_id === vehicle.id),
              filters,
            )}
          />
        </ResponsiveDrawerBody>
      </ResponsiveDrawer>
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
