import { StoredDocumentViewer } from "@/components/StoredDocumentViewer";
import { LoadingScreen } from "@/components/LoadingScreen";
import { SalesSectionExportsProvider } from "@/components/ventas/SalesSectionExports";
import { quickPeriodPresets } from "@/components/filters/quickPeriodPresets";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { PageShell, PageHeader } from "@/components/layout/AppPrimitives";
import { Button } from "@/components/ui/button";
import { loadManagement } from "./managementApi";
import { VehiclesList } from "./VehiclesList";
import { VehicleDetail } from "./VehicleDetail";
import { FuelView } from "./FuelView";
import { MaintenanceView } from "./MaintenanceView";
import { VehicleEditor } from "./VehicleEditor";
import { ExpenseDetails } from "./ExpenseDetails";
import { FuelImport } from "./FuelImport";
import type { ManagedVehicle } from "./managementModel";
import type { GridRow } from "./ManagementTable";
import {
  initialFilters,
  type FleetFilters,
  type FilterChange,
} from "./workspaceModel";
export function ManagementWorkspace() {
  const { user } = useAuth(),
    cache = useQueryClient(),
    location = useLocation(),
    [params, setParams] = useSearchParams();
  const section = location.pathname.endsWith("/combustible")
    ? "fuel"
    : location.pathname.endsWith("/mantenimientos")
      ? "maintenance"
      : "vehicles";
  const vehicleId = params.get("vehicle") ?? undefined;
  const query = useQuery({
    queryKey: ["fleet-management", user?.id, "all"],
    queryFn: () => loadManagement("all"),
    retry: false,
  });
  const [editor, setEditor] = useState<ManagedVehicle | "new" | null>(null),
    [detail, setDetail] = useState<GridRow | null>(null),
    [importing, setImporting] = useState(false);
  const [defaultPeriod] = useState(() =>
    quickPeriodPresets(new Date()).find((p) => p.key === "current-year")!,
  );
  const maintenanceDetail =
    !!vehicleId && params.get("vehicleTab") === "Mantenimiento";
  const prefix = vehicleId
    ? `vehicle:${vehicleId}:${maintenanceDetail ? "maintenance:" : ""}`
    : section + ":";
  const filters = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(initialFilters).map((k) => [
          k,
          params.get(prefix + k) ??
            (maintenanceDetail || (!vehicleId && section === "maintenance")
              ? ""
              : k === "from"
                ? defaultPeriod.from
                : k === "to"
                  ? defaultPeriod.to
                  : ""),
        ]),
      ) as unknown as FleetFilters,
    [params, prefix, defaultPeriod, maintenanceDetail, vehicleId, section],
  );
  const change: FilterChange = (key, value, to) =>
    setParams(
      (old) => {
        const p = new URLSearchParams(old);
        if (key === "period") {
          p.set(prefix + "from", value);
          p.set(prefix + "to", to ?? "");
        } else if (key === "reset") {
          Object.keys(initialFilters).forEach((k) => p.delete(prefix + k));
        } else if (value || key === "from" || key === "to")
          p.set(prefix + key, value);
        else p.delete(prefix + key);
        return p;
      },
      { replace: true },
    );
  const open = (id: string) => {
    setDetail(null);
    setParams((old) => {
      const p = new URLSearchParams(old);
      p.set("vehicle", id);
      if (!p.has(`vehicle:${id}:from`) && !p.has(`vehicle:${id}:to`)) {
        p.set(`vehicle:${id}:from`, filters.from);
        p.set(`vehicle:${id}:to`, filters.to);
      }
      p.set(
        "vehicleTab",
        section === "maintenance" ? "Mantenimiento" : "Combustible",
      );
      return p;
    });
  };
  const refresh = async () => {
    await cache.invalidateQueries({ queryKey: ["fleet-management"] });
    await cache.invalidateQueries({ queryKey: ["fleet-snapshot"] });
  };
  if (query.isPending) return <LoadingScreen />;
  if (query.isError)
    return (
      <PageShell>
        <p role="alert">No se pudo cargar Flota</p>
        <Button onClick={() => query.refetch()}>Reintentar</Button>
      </PageShell>
    );
  const data = query.data,
    vehicle = data.vehicles.find((v) => v.id === vehicleId);
  const back = () =>
    setParams((old) => {
      const p = new URLSearchParams(old);
      p.delete("vehicle");
      p.delete("vehicleTab");
      return p;
    });
  if (vehicleId && !vehicle)
    return (
      <PageShell>
        <p role="alert">Vehículo no disponible</p>
        <Button onClick={back}>Volver a vehículos</Button>
      </PageShell>
    );
  return (
    <PageShell>
      {vehicle ? (
        <VehicleDetail
          vehicle={vehicle}
          data={data}
          filters={filters}
          onChange={change}
          tab={
            ["Combustible", "Mantenimiento"].includes(
              params.get("vehicleTab") ?? "",
            )
              ? params.get("vehicleTab")!
              : "Combustible"
          }
          onTab={(tab) =>
            setParams((old) => {
              const p = new URLSearchParams(old);
              p.set("vehicleTab", tab);
              return p;
            })
          }
          onBack={back}
          onEdit={() => setEditor(vehicle)}
          onSelect={setDetail}
          onImport={() => setImporting(true)}
          onSaved={refresh}
        />
      ) : section === "vehicles" ? (
        <VehiclesList
          data={data}
          filters={filters}
          onChange={change}
          onOpen={open}
          onCreate={() => setEditor("new")}
        />
      ) : (
        <>
          <PageHeader
            title={section === "fuel" ? "Combustible" : "Mantenimiento"}
          />
          <SalesSectionExportsProvider>
            {section === "fuel" ? (
              <FuelView
                data={data}
                filters={filters}
                onChange={change}
                onSelect={setDetail}
                onImport={() => setImporting(true)}
              />
            ) : (
              <MaintenanceView
                data={data}
                filters={filters}
                onChange={change}
                onSelect={setDetail}
              />
            )}
          </SalesSectionExportsProvider>
        </>
      )}
      {editor && (
        <VehicleEditor
          vehicle={editor === "new" ? undefined : editor}
          responsibleCandidates={data.responsibleCandidates}
          responsibilityEvents={data.responsibilityEvents}
          onClose={() => setEditor(null)}
          onSaved={() => void refresh()}
        />
      )}
      <ExpenseDetails
        data={data}
        detail={detail}
        onClose={() => setDetail(null)}
        refresh={refresh}
        vehicle={vehicleId}
        onVehicle={open}
      />
      <StoredDocumentViewer bucket="fleet-invoices" />
      {importing && (
        <FuelImport onClose={() => setImporting(false)} onSaved={refresh} />
      )}
    </PageShell>
  );
}
