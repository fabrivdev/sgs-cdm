import {
  InvoiceActions,
  InvoiceActionMenu,
} from "@/features/fleet/InvoiceActions";
import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { mobileHeaderCreateButton } from "@/lib/ui-classes";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { PageShell, PageHeader } from "@/components/layout/AppPrimitives";
import { Button } from "@/components/ui/button";
import { FilterDate } from "@/components/filters/FiltersBar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ResponsiveDrawer,
  ResponsiveDrawerHeader,
  ResponsiveDrawerBody,
  ResponsiveDrawerFooter,
} from "@/components/ui/responsive-drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import InvoiceUpload from "@/features/fleet/InvoiceUpload";
import {
  loadManagement,
  fleetRpc,
  invoiceUrl,
} from "@/features/fleet/managementApi";
import {
  canManageFleet,
  canSubmitInvoice,
  maintenanceCategories,
  monthlyFuel,
  estimatedConsumption,
  type Invoice,
  type ManagedVehicle,
} from "@/features/fleet/managementModel";
import {
  ManagementTable,
  type GridRow,
} from "@/features/fleet/ManagementTable";
import { VehicleEditor } from "@/features/fleet/VehicleEditor";
import {
  currentFleetResponsibility,
  vehicleLatestReading,
} from "@/features/fleet/model";
import { periodMileage, todayInParaguay } from "@/features/fleet/period";
import Flota from "./Flota";

export default function FleetWorkspace() {
  const auth = useAuth();
  const allowed = auth.hasSectionAccess("servicios.flota");
  if (!canSubmitInvoice(auth.roles, allowed))
    return <Navigate to="/sin-acceso" replace />;
  if (!canManageFleet(auth.roles, allowed))
    return <InvoiceUpload key={auth.user?.id} />;
  return <ManagementWorkspace />;
}
const show = (v: unknown) =>
  v == null || v === ""
    ? "—"
    : typeof v === "object"
      ? JSON.stringify(v)
      : String(v);
const vehicleLabels: Record<string, string> = {
  plate: "Chapa",
  brand: "Marca",
  model: "Modelo",
  model_year: "Año",
  chassis: "Chasis",
  department: "Departamento",
  branch: "Sucursal",
  color: "Color",
  vehicle_type: "Tipo",
  fuel_provider: "Proveedor de combustible",
  notes: "Observaciones",
  operational_status: "Estado operativo",
  lifecycle_status: "Situación patrimonial",
};
const sourceWorkOrder = [
  "MOTOR / Filtro.Comb.",
  "MOTOR / Filtro Aceite",
  "MOTOR / Filtro Aire",
  "MOTOR / Correa Dentada",
  "CAJAS / ACEITE",
  "DIFERENCIAL / ACEITE",
  "MOTOR / ACEITE",
  "GASTOS / VARIOS",
  "REPUESTOS / VARIOS",
  "SERVICIOS / VARIOS",
  "CUBIERTAS",
];
const workLabelsForDisplay: Record<string, string> = Object.fromEntries(
  sourceWorkOrder.map((label, i) => [
    label,
    [
      "Filtro combustible",
      "Filtro aceite",
      "Filtro aire",
      "Correa dentada",
      "Aceite caja",
      "Aceite diferencial",
      "Aceite motor",
      "Gastos varios",
      "Repuestos varios",
      "Servicios varios",
      "Cubiertas",
    ][i],
  ]),
);
function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="flex min-w-28 flex-col gap-1 text-xs">
      {label}
      <select
        aria-label={label}
        className="h-8 rounded-md border bg-background px-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Todos</option>
        {options.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    </label>
  );
}
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
  const scope = params.get("vehicle")
    ? params.get("vehicleTab") === "Datos e historial"
      ? "vehicles"
      : params.get("vehicleTab") === "Mantenimiento"
        ? "maintenance"
        : "fuel"
    : section;
  const query = useQuery({
    queryKey: ["fleet-management", user?.id, scope],
    queryFn: () => loadManagement(scope),
    retry: false,
  });
  const [editor, setEditor] = useState<ManagedVehicle | "new" | null>(null),
    [upload, setUpload] = useState(false),
    [detail, setDetail] = useState<GridRow | null>(null);
  const [fuelImport, setFuelImport] = useState<
    Record<string, unknown>[] | null
  >(null);
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false),
    [amountInvoice, setAmountInvoice] = useState<Invoice | null>(null),
    [amount, setAmount] = useState(""),
    [currency, setCurrency] = useState(""),
    [saving, setSaving] = useState(false);
  const [invoiceAction, setInvoiceAction] = useState<{
    invoice: Invoice;
    mode: "edit" | "file" | "void" | "audit";
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const data = query.data;
  const prefix = params.get("vehicle")
    ? "vehicle:" +
      params.get("vehicle") +
      ":" +
      (params.get("vehicleTab") ?? "Combustible") +
      ":"
    : section + ":";
  const get = (key: string) => params.get(prefix + key) ?? "";
  const set = (key: string, value: string) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set(prefix + key, value);
        else next.delete(prefix + key);
        return next;
      },
      { replace: true },
    );
  const vehicle = data?.vehicles.find((v) => v.id === params.get("vehicle"));
  const search = get("search"),
    from = get("from"),
    to = get("to"),
    category = get("category"),
    supplier = get("supplier"),
    association = get("association"),
    plateFilter = get("plate");
  const tab = params.get("vehicleTab") || "Combustible",
    view =
      get("view") ||
      ((vehicle ? tab === "Mantenimiento" : section === "maintenance")
        ? "Actividad"
        : "Mensual");
  const refresh = async () => {
    await cache.invalidateQueries({ queryKey: ["fleet-management"] });
    await cache.invalidateQueries({ queryKey: ["fleet-snapshot"] });
  };
  const openVehicle = (id: string) => {
    setDetail(null);
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set("vehicle", id);
      n.set(
        "vehicleTab",
        section === "maintenance"
          ? "Mantenimiento"
          : section === "vehicles"
            ? "Datos e historial"
            : "Combustible",
      );
      return n;
    });
  };
  const within = (date: string | null) =>
    (!from && !to) ||
    (!!date &&
      (!from || date.slice(0, 10) >= from) &&
      (!to || date.slice(0, 10) <= to));
  const matches = (...values: unknown[]) =>
    !search ||
    values
      .map(show)
      .join(" ")
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase());
  const matchesVehicle = (id: string | null, plate: string) =>
    vehicle
      ? id === vehicle.id
      : (!plateFilter || plate === plateFilter) &&
        (!association || (association === "De la flota" ? !!id : !id));
  const monthlyView =
    (vehicle ? tab === "Combustible" : section === "fuel") && view !== "Cargas";
  const dates = monthlyView ? (
    <>
      <label className="text-xs">
        Desde mes
        <Input
          type="month"
          aria-label="Desde mes"
          value={from.slice(0, 7)}
          onChange={(e) =>
            set("from", e.target.value ? e.target.value + "-01" : "")
          }
        />
      </label>
      <label className="text-xs">
        Hasta mes
        <Input
          type="month"
          aria-label="Hasta mes"
          value={to.slice(0, 7)}
          onChange={(e) => {
            const m = e.target.value;
            set(
              "to",
              m
                ? m +
                    "-" +
                    new Date(
                      Number(m.slice(0, 4)),
                      Number(m.slice(5)),
                      0,
                    ).getDate()
                : "",
            );
          }}
        />
      </label>
    </>
  ) : (
    <>
      <FilterDate label="Desde" value={from} onChange={(v) => set("from", v)} />
      <FilterDate label="Hasta" value={to} onChange={(v) => set("to", v)} />
    </>
  );
  const invoiceView =
    (section === "maintenance" && !vehicle) ||
    (vehicle && tab === "Mantenimiento");
  const fuelView =
    (section === "fuel" && !vehicle) || (vehicle && tab === "Combustible");
  const historyView = invoiceView && view === "Historial";
  const activityView =
    invoiceView && view !== "Facturas" && view !== "Historial";
  const invoices = (data?.invoices ?? []).filter(
    (r) =>
      (!get("invoiceState")
        ? r.status !== "void"
        : r.status === get("invoiceState")) &&
      (!get("missingAmount") ||
        (r.status === "uploaded" && r.amount == null)) &&
      within(
        activityView ? (r.performed_on ?? r.invoice_date) : r.invoice_date,
      ) &&
      matchesVehicle(r.vehicle_id, r.plate) &&
      (!supplier || r.supplier === supplier) &&
      (!category || r.categories.includes(category)) &&
      matches(
        r.supplier_tax_id,
        r.plate,
        r.supplier,
        r.invoice_number,
        r.description,
        r.categories,
      ),
  );
  const history = (data?.history ?? []).filter(
    (r) =>
      within(r.occurred_on) &&
      matchesVehicle(r.vehicle_id, r.plate) &&
      (!supplier || r.supplier === supplier) &&
      matches(r.plate, r.supplier, r.invoice_number, r.works),
  );
  const fuel = (data?.fuel ?? []).filter(
    (r) =>
      within(r.occurred_at) &&
      matchesVehicle(r.vehicle_id, r.plate) &&
      matches(r.plate, r.product, r.station, r.raw_data),
  );
  const canEstimate =
    !!vehicle ||
    (!!plateFilter &&
      fuel.length > 0 &&
      fuel.every((r) => !!r.vehicle_id && r.vehicle_id === fuel[0].vehicle_id));
  const consume = canEstimate ? estimatedConsumption(fuel) : null;
  async function importFuel(file?: File) {
    if (!file || importing) return;
    setImporting(true);
    try {
      if (file.size > 20 * 1024 * 1024) throw Error("El Excel supera 20 MB.");
      const XLSX = await import("xlsx"),
        { parseFuel } = await import("@/features/fleet/workbookImports.mjs");
      const rows = parseFuel(
        XLSX.read(await file.arrayBuffer(), { type: "array" }),
      );
      setFuelImport(rows);
      setImportError("");
    } catch (e) {
      toast.error(show((e as { message?: string }).message ?? e));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  async function confirmFuelImport() {
    if (!fuelImport || importing) return;
    setImporting(true);
    setImportError("");
    try {
      const count = await fleetRpc<number>("fleet_import_fuel_entries", {
        p_rows: fuelImport,
      });
      await refresh();
      toast.success(
        count +
          " cargas incorporadas · " +
          (fuelImport.length - count) +
          " repetidas omitidas",
      );
      setFuelImport(null);
    } catch (e) {
      setImportError(String((e as { message?: string }).message ?? e));
    } finally {
      setImporting(false);
    }
  }
  if (query.isPending)
    return (
      <PageShell>
        <p role="status">Cargando Flota…</p>
      </PageShell>
    );
  if (query.isError)
    return (
      <PageShell>
        <p role="alert">No se pudo cargar Flota.</p>
        <Button onClick={() => query.refetch()}>Reintentar</Button>
      </PageShell>
    );
  const responsible = (id: string) =>
    currentFleetResponsibility(
      id,
      data!.responsibilityEvents,
      todayInParaguay(),
    )?.responsible_name_snapshot ?? null;
  const columns: [string, string, ("text" | "number" | "date")?][] = [];
  let rows: GridRow[] = [];
  if (!vehicle && section === "vehicles") {
    columns.push(
      ["plate", "Chapa"],
      ["brand", "Marca"],
      ["model", "Modelo"],
      ["responsible", "Responsable"],
      ["status", "Estado operativo"],
      ["lifecycle", "Situación patrimonial"],
      ["km", "Último km", "number"],
      ["date", "Fecha lectura", "date"],
      ["distance", "Km período", "number"],
    );
    rows = data!.vehicles
      .filter(
        (v) =>
          matches(v.plate, v.brand, v.model, responsible(v.id)) &&
          (!get("state") || v.operational_status === get("state")) &&
          (!get("lifecycle") || v.lifecycle_status === get("lifecycle")) &&
          (!get("department") || v.department === get("department")) &&
          (!get("branch") || v.branch === get("branch")),
      )
      .map((v) => {
        const reading = vehicleLatestReading(v.id, data!.readings),
          distance =
            from && to
              ? periodMileage(
                  data!.readings.filter((r) => r.vehicle_id === v.id),
                  { from, to, valid: from <= to },
                )
              : null;
        return {
          id: v.id,
          plate: v.plate,
          brand: v.brand,
          model: v.model,
          responsible: responsible(v.id),
          status: v.operational_status,
          lifecycle: v.lifecycle_status,
          km: reading?.odometer_km,
          date: reading?.reading_date,
          distance: distance?.coverageFrom ? distance.exactKm : null,
        };
      });
  } else if (fuelView) {
    if (view === "Cargas") {
      columns.push(
        ["date", "Fecha", "date"],
        ["plate", "Chapa"],
        ["station", "Estación"],
        ["product", "Producto"],
        ["liters", "Litros", "number"],
        ["currency", "Moneda"],
        ["amount", "Gasto neto", "number"],
      );
      rows = fuel.map((r) => ({
        id: r.id,
        date: r.occurred_at,
        plate: r.plate,
        station: r.station,
        product: r.product,
        liters: r.liters,
        currency: r.currency,
        amount: r.net_amount,
      }));
    } else {
      columns.push(
        ["month", "Mes"],
        ["loaded", "Litros cargados", "number"],
        ["adjustments", "Ajustes L", "number"],
        ["liters", "Litros netos", "number"],
        ["currency", "Moneda"],
        ["amount", "Gasto neto", "number"],
      );
      if (canEstimate)
        columns.push(["consumption", "L/100 km estimado", "number"]);
      rows = monthlyFuel(fuel).map((r) => ({
        id: r.month + "|" + r.currency,
        ...r,
        consumption: canEstimate
          ? estimatedConsumption(
              fuel.filter((f) => f.occurred_at.startsWith(r.month)),
            ).l100
          : null,
      }));
    }
  } else if (activityView) {
    columns.push(
      ["date", "Fecha de referencia", "date"],
      ["plate", "Chapa"],
      ["origin", "Origen"],
      ["invoice_date", "Fecha de factura", "date"],
      ["performed", "Fecha del trabajo", "date"],
      ["km", "Kilometraje", "number"],
      ["supplier", "Proveedor"],
      ["invoice", "N.º factura"],
      ["description", "Descripción"],
    );
    rows = [
      ...history.map((r) => ({
        id: r.id,
        date: r.occurred_on,
        plate: r.plate,
        origin: "Planilla inicial",
        invoice_date: null,
        performed: r.occurred_on,
        km: r.odometer_km,
        supplier: r.supplier,
        invoice: r.invoice_number,
        description: null,
      })),
      ...invoices
        .filter((r) => r.status === "uploaded")
        .map((r) => ({
          id: r.id,
          date: r.performed_on ?? r.invoice_date,
          plate: r.plate,
          origin: "Factura",
          invoice_date: r.invoice_date,
          performed: r.performed_on,
          km: r.odometer_km,
          supplier: r.supplier,
          invoice: r.invoice_number,
          description: r.description,
        })),
    ];
  } else if (invoiceView) {
    columns.push(
      ["date", "Fecha", "date"],
      ["plate", "Chapa"],
      ...(historyView
        ? [["km", "Kilometraje", "number"] as [string, string, "number"]]
        : []),
      ["supplier", "Proveedor"],
      ["invoice", "N.º factura"],
    );
    if (historyView) {
      const workLabels = [
        ...new Set(data!.history.flatMap((r) => r.works.map((w) => w.work))),
      ].sort(
        (a, b) =>
          (sourceWorkOrder.includes(a) ? sourceWorkOrder.indexOf(a) : 100) -
          (sourceWorkOrder.includes(b) ? sourceWorkOrder.indexOf(b) : 100),
      );
      columns.push(
        ...workLabels.map(
          (label, i) =>
            ["work" + i, workLabelsForDisplay[label] ?? label] as [
              string,
              string,
            ],
        ),
      );
      rows = history.map((r) => ({
        id: r.id,
        date: r.occurred_on,
        plate: r.plate,
        km: r.odometer_km,
        supplier: r.supplier,
        invoice: r.invoice_number,
        ...Object.fromEntries(
          workLabels.map((label, i) => [
            "work" + i,
            r.works
              .filter((w) => w.work === label)
              .map((w) => show(w.value))
              .join("; ") || null,
          ]),
        ),
      }));
    } else {
      columns.push(
        ["status", "Estado de carga"],
        ["supplier_tax_id", "RUC"],
        ["classification", "Clasificación"],
        ["description", "Descripción"],
        ["currency", "Moneda"],
        ["amount", "Importe", "number"],
      );
      rows = invoices.map((r) => ({
        id: r.id,
        date: r.invoice_date,
        plate: r.plate,
        supplier: r.supplier,
        invoice: r.invoice_number,
        status:
          r.status === "pending"
            ? "Incompleta"
            : r.status === "void"
              ? "Anulada"
              : "Completa",
        supplier_tax_id: r.supplier_tax_id,
        classification: r.categories.join(", "),
        description: r.description,
        currency: r.currency,
        amount: r.amount,
      }));
    }
  }
  const sectionTitle =
    section === "vehicles"
      ? "Vehículos"
      : section === "fuel"
        ? "Gastos de combustible"
        : "Gastos de mantenimiento";
  const selectedInvoice = invoices.find((r) => r.id === detail?.id),
    selectedHistory = history.find((r) => r.id === detail?.id),
    selectedFuel = fuel.find((r) => r.id === detail?.id);
  const opts = (values: (string | null | undefined)[]) =>
    [...new Set(values.filter((v): v is string => !!v))].sort();
  return (
    <PageShell>
      {vehicle && (
        <Button
          variant="ghost"
          onClick={() => {
            setDetail(null);
            setParams((p) => {
              const n = new URLSearchParams(p);
              n.delete("vehicle");
              return n;
            });
          }}
        >
          ← {sectionTitle}
        </Button>
      )}
      <PageHeader
        title={vehicle?.plate ?? sectionTitle}
        actions={
          !vehicle && section === "vehicles" ? (
            <Button
              size="sm"
              aria-label="Nuevo vehículo"
              className={mobileHeaderCreateButton}
              onClick={() => setEditor("new")}
            >
              <Plus className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Nuevo vehículo</span>
            </Button>
          ) : undefined
        }
      />
      {vehicle && (
        <>
          <dl className="grid grid-cols-2 gap-3 border-y py-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Marca", vehicle.brand],
              ["Modelo", vehicle.model],
              ["Responsable", responsible(vehicle.id)],
              ["Departamento", vehicle.department],
              ["Sucursal", vehicle.branch],
              ["Estado", vehicle.operational_status],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{show(label)}</dt>
                <dd>{show(value)}</dd>
              </div>
            ))}
          </dl>
          <Tabs
            value={tab}
            onValueChange={(v) => {
              setDetail(null);
              setParams((p) => {
                const n = new URLSearchParams(p);
                n.set("vehicleTab", v);
                return n;
              });
            }}
          >
            <TabsList>
              {["Combustible", "Mantenimiento", "Datos e historial"].map(
                (t) => (
                  <TabsTrigger key={t} value={t}>
                    {t}
                  </TabsTrigger>
                ),
              )}
            </TabsList>
          </Tabs>
        </>
      )}
      {vehicle && tab === "Datos e historial" ? (
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditor(vehicle)}
          >
            Editar datos y estado
          </Button>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm lg:grid-cols-4">
            {[
              ["Chasis", vehicle.chassis],
              ["Año", vehicle.model_year],
              ["Color", vehicle.color],
              ["Tipo", vehicle.vehicle_type],
              ["Situación patrimonial", vehicle.lifecycle_status],
              ["Proveedor de combustible", vehicle.fuel_provider],
              ["Observaciones", vehicle.notes],
              [
                "Km de planilla inicial",
                vehicle.source_data?.raw_data?.Kilometraje,
              ],
              [
                "Cargo de planilla inicial",
                vehicle.source_data?.raw_data?.Cargo,
              ],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-muted-foreground">{show(label)}</dt>
                <dd>{show(value)}</dd>
              </div>
            ))}
          </dl>
          <Flota key={vehicle.id} initialVehicleId={vehicle.id} />
          <ManagementTable
            label="Cambios del vehículo"
            fields={[
              ["date", "Fecha", "date"],
              ["field", "Campo"],
              ["before", "Anterior"],
              ["after", "Nuevo"],
              ["actor", "Autor"],
              ["reason", "Motivo"],
            ]}
            rows={data!.changes
              .filter((c) => c.vehicle_id === vehicle.id)
              .flatMap((c) =>
                Object.keys(c.after_data)
                  .filter(
                    (k) =>
                      show(c.before_data[k]) !== show(c.after_data[k]) &&
                      !!vehicleLabels[k],
                  )
                  .map((k) => ({
                    id: c.id + k,
                    date: c.occurred_at,
                    field: vehicleLabels[k],
                    before: show(c.before_data[k]),
                    after: show(c.after_data[k]),
                    actor: c.actor_name,
                    reason: c.reason,
                  })),
              )}
          />
        </>
      ) : (
        <>
          {(fuelView || invoiceView) && (
            <Tabs
              value={
                fuelView
                  ? view === "Cargas"
                    ? "Cargas"
                    : "Mensual"
                  : view === "Facturas"
                    ? "Facturas"
                    : view === "Historial"
                      ? "Historial"
                      : "Actividad"
              }
              onValueChange={(v) => {
                set("view", v);
                setDetail(null);
              }}
            >
              <div className="flex items-center justify-between">
                <TabsList>
                  {(fuelView
                    ? ["Mensual", "Cargas"]
                    : ["Actividad", "Historial", "Facturas"]
                  ).map((t) => (
                    <TabsTrigger key={t} value={t}>
                      {t}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {invoiceView && !historyView && !activityView && (
                  <Button size="sm" onClick={() => setUpload(true)}>
                    Cargar factura
                  </Button>
                )}
              </div>
            </Tabs>
          )}
          {fuelView && (
            <div className="flex flex-wrap gap-6 border-y py-2 text-sm">
              <span>
                Litros netos:{" "}
                {fuel.length
                  ? fuel
                      .reduce((s, r) => s + r.liters, 0)
                      .toLocaleString("es-PY")
                  : "—"}
              </span>
              {opts(fuel.map((r) => r.currency ?? "Sin moneda")).map((c) => (
                <span key={c}>
                  Gasto neto ({c}):{" "}
                  {fuel
                    .filter((r) => (r.currency ?? "Sin moneda") === c)
                    .reduce((s, r) => s + r.net_amount, 0)
                    .toLocaleString("es-PY")}
                </span>
              ))}
              {consume && (
                <>
                  <span>Km evaluados: {consume.km || "—"}</span>
                  <details>
                    <summary className="cursor-pointer">
                      L/100 km estimado:{" "}
                      {consume.l100?.toLocaleString("es-PY", {
                        maximumFractionDigits: 2,
                      }) ?? "—"}
                    </summary>
                    <dl className="grid grid-cols-2 gap-2 py-2">
                      <dt>Intervalos válidos</dt>
                      <dd>{consume.intervals}</dd>
                      <dt>Litros evaluados</dt>
                      <dd>{consume.liters.toLocaleString("es-PY")}</dd>
                      <dt>Desde</dt>
                      <dd>
                        {consume.from?.split("-").reverse().join("/") ?? "—"}
                      </dd>
                      <dt>Hasta</dt>
                      <dd>
                        {consume.to?.split("-").reverse().join("/") ?? "—"}
                      </dd>
                    </dl>
                    <p className="max-w-md text-xs">
                      Se usan intervalos consecutivos dentro del mes, con
                      kilometraje creciente y cargas compatibles. Se excluyen
                      ajustes, discontinuidades y lecturas ambiguas. Sin
                      intervalos válidos no se calcula consumo.
                    </p>
                  </details>
                </>
              )}
            </div>
          )}
          {invoiceView && !historyView && !activityView && (
            <div className="flex gap-5 text-sm">
              <span>
                Sin importe:{" "}
                {
                  invoices.filter(
                    (r) => r.status === "uploaded" && r.amount == null,
                  ).length
                }
              </span>
              <span>
                Cargas incompletas:{" "}
                {invoices.filter((r) => r.status === "pending").length}
              </span>
              {opts(
                invoices
                  .filter((r) => r.status === "uploaded" && r.amount != null)
                  .map((r) => r.currency),
              ).map((c) => (
                <span key={c}>
                  Importe documentado ({c}):{" "}
                  {invoices
                    .filter((r) => r.status === "uploaded" && r.currency === c)
                    .reduce((s, r) => s + Number(r.amount ?? 0), 0)
                    .toLocaleString("es-PY")}
                </span>
              ))}
            </div>
          )}
          {from && to && from > to ? (
            <p role="alert">El período es inválido.</p>
          ) : null}
          <ManagementTable
            key={section + (vehicle?.id ?? "") + tab + view}
            label={
              vehicle
                ? fuelView
                  ? "Combustible"
                  : "Mantenimiento"
                : sectionTitle
            }
            rows={from && to && from > to ? [] : rows}
            fields={columns.length ? columns : [["id", "Registro"]]}
            onReset={() =>
              setParams(
                (previous) => {
                  const n = new URLSearchParams(previous);
                  for (const k of Array.from(n.keys()))
                    if (k.startsWith(prefix) && !k.endsWith(":view"))
                      n.delete(k);
                  return n;
                },
                { replace: true },
              )
            }
            activeFilters={
              Array.from(params.entries()).filter(
                ([k, v]) => k.startsWith(prefix) && !k.endsWith(":view") && !!v,
              ).length
            }
            search={search}
            onSearch={(v) => set("search", v)}
            filters={
              <>
                {dates}
                {!vehicle && section === "vehicles" ? (
                  <Choice
                    label="Estado"
                    value={get("state")}
                    onChange={(v) => set("state", v)}
                    options={opts(
                      data!.vehicles.map((v) => v.operational_status),
                    )}
                  />
                ) : !vehicle ? (
                  <Choice
                    label="Chapa"
                    value={plateFilter}
                    onChange={(v) => set("plate", v)}
                    options={opts(
                      [...data!.fuel, ...data!.history, ...data!.invoices].map(
                        (r) => r.plate,
                      ),
                    )}
                  />
                ) : null}
              </>
            }
            expanded={
              !vehicle && section === "vehicles" ? (
                <>
                  <Choice
                    label="Situación patrimonial"
                    value={get("lifecycle")}
                    onChange={(v) => set("lifecycle", v)}
                    options={["Activa", "Vendida", "Baja"]}
                  />
                  <Choice
                    label="Departamento"
                    value={get("department")}
                    onChange={(v) => set("department", v)}
                    options={opts(data!.vehicles.map((v) => v.department))}
                  />
                  <Choice
                    label="Sucursal"
                    value={get("branch")}
                    onChange={(v) => set("branch", v)}
                    options={opts(data!.vehicles.map((v) => v.branch))}
                  />
                </>
              ) : (
                <>
                  {!vehicle && (
                    <Choice
                      label="Pertenencia"
                      value={association}
                      onChange={(v) => set("association", v)}
                      options={["De la flota", "Sin vínculo con la flota"]}
                    />
                  )}{" "}
                  {invoiceView && (
                    <Choice
                      label="Proveedor"
                      value={supplier}
                      onChange={(v) => set("supplier", v)}
                      options={opts(
                        [...data!.invoices, ...data!.history].map(
                          (r) => r.supplier,
                        ),
                      )}
                    />
                  )}{" "}
                  {invoiceView && !historyView && (
                    <>
                      <label className="text-xs">
                        Estado de carga
                        <select
                          aria-label="Estado de carga"
                          className="block h-8 border rounded-md bg-background"
                          value={get("invoiceState")}
                          onChange={(e) => set("invoiceState", e.target.value)}
                        >
                          <option value="">Vigentes</option>
                          <option value="pending">Incompletas</option>
                          <option value="uploaded">Completas</option>
                          <option value="void">Anuladas</option>
                        </select>
                      </label>
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={!!get("missingAmount")}
                          onChange={(e) =>
                            set("missingAmount", e.target.checked ? "yes" : "")
                          }
                        />
                        Sin importe
                      </label>
                    </>
                  )}
                  {invoiceView && !historyView && (
                    <Choice
                      label="Clasificación"
                      value={category}
                      onChange={(v) => set("category", v)}
                      options={[...maintenanceCategories]}
                    />
                  )}
                </>
              )
            }
            actions={
              fuelView && !vehicle
                ? [
                    {
                      id: "import",
                      label: "Importar combustible",
                      disabled: importing,
                      onSelect: () => fileRef.current?.click(),
                    },
                  ]
                : []
            }
            render={
              section === "vehicles" && !vehicle
                ? {
                    plate: (r) => (
                      <button
                        className="text-primary underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          openVehicle(r.id);
                        }}
                      >
                        {r.plate}
                      </button>
                    ),
                  }
                : undefined
            }
            onSelect={(r) => {
              if (!vehicle && section === "vehicles") openVehicle(r.id);
              else if (fuelView && view !== "Cargas") {
                setParams((p) => {
                  const n = new URLSearchParams(p);
                  const month = String(r.month);
                  n.set(prefix + "from", month + "-01");
                  n.set(
                    prefix + "to",
                    month +
                      "-" +
                      new Date(
                        Number(month.slice(0, 4)),
                        Number(month.slice(5, 7)),
                        0,
                      ).getDate(),
                  );
                  n.set(prefix + "view", "Cargas");
                  return n;
                });
              } else setDetail(r);
            }}
          />
        </>
      )}
      <ResponsiveDrawer
        title="Importar combustible"
        open={!!fuelImport}
        onOpenChange={(open) => {
          if (!open && !importing) setFuelImport(null);
        }}
      >
        <ResponsiveDrawerHeader>
          <h2 className="font-semibold">Importar combustible</h2>
        </ResponsiveDrawerHeader>
        <ResponsiveDrawerBody className="space-y-4">
          {fuelImport && (
            <>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <dt>Movimientos</dt>
                <dd>{fuelImport.length}</dd>
                <dt>Comprobantes existentes</dt>
                <dd>
                  {
                    fuelImport.filter((r) =>
                      data!.fuel.some((f) => f.source_key === r.source_key),
                    ).length
                  }
                </dd>
                <dt>Desde</dt>
                <dd>
                  {fuelImport
                    .map((r) => String(r.occurred_at).slice(0, 10))
                    .sort()[0]
                    ?.split("-")
                    .reverse()
                    .join("/")}
                </dd>
                <dt>Hasta</dt>
                <dd>
                  {fuelImport
                    .map((r) => String(r.occurred_at).slice(0, 10))
                    .sort()
                    .at(-1)
                    ?.split("-")
                    .reverse()
                    .join("/")}
                </dd>
                <dt>Litros netos del archivo</dt>
                <dd>
                  {fuelImport
                    .reduce((n, r) => n + Number(r.liters), 0)
                    .toLocaleString("es-PY")}
                </dd>
              </dl>
              {importError && (
                <p role="alert" className="text-destructive text-sm">
                  {importError}
                </p>
              )}
            </>
          )}
        </ResponsiveDrawerBody>
        <ResponsiveDrawerFooter>
          <Button disabled={importing} onClick={() => void confirmFuelImport()}>
            {importing ? "Importando…" : "Importar archivo"}
          </Button>
        </ResponsiveDrawerFooter>
      </ResponsiveDrawer>
      <input
        ref={fileRef}
        hidden
        type="file"
        accept=".xlsx,.xls"
        onChange={(e) => void importFuel(e.target.files?.[0])}
      />
      {editor && (
        <VehicleEditor
          vehicle={editor === "new" ? undefined : editor}
          onClose={() => setEditor(null)}
          onSaved={() => void refresh()}
        />
      )}
      {invoiceAction && (
        <InvoiceActions
          invoice={invoiceAction.invoice}
          initialMode={invoiceAction.mode}
          onClose={() => setInvoiceAction(null)}
          onSaved={async () => {
            await refresh();
            setInvoiceAction(null);
          }}
        />
      )}
      <ResponsiveDrawer
        title="Cargar factura"
        size="xl"
        open={upload}
        onOpenChange={setUpload}
      >
        <ResponsiveDrawerHeader>
          <h2 className="font-semibold">Cargar factura</h2>
        </ResponsiveDrawerHeader>
        <InvoiceUpload
          embedded
          plate={vehicle?.plate}
          onDone={() => {
            setUpload(false);
            void refresh();
          }}
        />
      </ResponsiveDrawer>
      <ResponsiveDrawer
        title={
          selectedInvoice
            ? "Factura"
            : selectedHistory
              ? "Mantenimiento"
              : "Carga de combustible"
        }
        size="xl"
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <ResponsiveDrawerHeader>
          <h2 className="font-semibold">
            {selectedInvoice
              ? "Factura"
              : selectedHistory
                ? "Mantenimiento"
                : "Carga de combustible"}
          </h2>
        </ResponsiveDrawerHeader>
        <ResponsiveDrawerBody className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {detail &&
              Object.entries(detail)
                .filter(
                  ([k]) =>
                    k !== "id" &&
                    !(
                      selectedInvoice &&
                      ["classification", "description"].includes(k)
                    ) &&
                    !(selectedHistory && k.startsWith("work")),
                )
                .map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-muted-foreground">
                      {columns.find((c) => c[0] === key)?.[1] ?? key}
                    </dt>
                    <dd>
                      {key === "date"
                        ? show(value)
                            .slice(0, 10)
                            .split("-")
                            .reverse()
                            .join("/")
                        : show(value)}
                    </dd>
                  </div>
                ))}
          </dl>
          {(selectedInvoice?.vehicle_id ||
            selectedHistory?.vehicle_id ||
            selectedFuel?.vehicle_id) && (
            <Button
              variant="link"
              onClick={() =>
                openVehicle(
                  (selectedInvoice?.vehicle_id ||
                    selectedHistory?.vehicle_id ||
                    selectedFuel?.vehicle_id)!,
                )
              }
            >
              Ver vehículo
            </Button>
          )}
          {selectedInvoice && (
            <>
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt>Clasificación</dt>
                  <dd>{selectedInvoice.categories.join(", ")}</dd>
                </div>
                <div>
                  <dt>Descripción del trabajo</dt>
                  <dd>{selectedInvoice.description}</dd>
                </div>
              </dl>
              <div className="flex gap-3">
                <InvoiceActionMenu
                  invoice={selectedInvoice}
                  onSelect={(mode) => {
                    setInvoiceAction({ invoice: selectedInvoice, mode });
                    setDetail(null);
                  }}
                />
                <Button
                  className={
                    selectedInvoice.status !== "uploaded" ? "hidden" : undefined
                  }
                  onClick={async () => {
                    const popup = window.open("about:blank", "_blank");
                    if (!popup) {
                      toast.error(
                        "Permití abrir una pestaña para consultar la factura.",
                      );
                      return;
                    }
                    popup.opener = null;
                    try {
                      popup.location.replace(await invoiceUrl(selectedInvoice));
                    } catch {
                      popup.close();
                      toast.error("No se pudo abrir el archivo.");
                    }
                  }}
                >
                  Abrir factura
                </Button>
                <Button
                  variant="outline"
                  className={
                    selectedInvoice.status !== "uploaded" ? "hidden" : undefined
                  }
                  onClick={() => {
                    setAmountInvoice(selectedInvoice);
                    setDetail(null);
                    setAmount(
                      selectedInvoice.amount == null
                        ? ""
                        : String(selectedInvoice.amount),
                    );
                    setCurrency(selectedInvoice.currency ?? "");
                  }}
                >
                  Registrar importe
                </Button>
              </div>
            </>
          )}
          {selectedHistory && (
            <>
              <ManagementTable
                label="Trabajos"
                fields={[
                  ["work", "Trabajo"],
                  ["value", "Registro original"],
                  ["comment", "Comentario original"],
                ]}
                rows={selectedHistory.works.map((w, i) => ({
                  id: String(i),
                  work: w.work,
                  value: show(w.value),
                  comment: w.comment,
                }))}
              />
              <details>
                <summary>Datos originales</summary>
                <ManagementTable
                  label="Datos originales"
                  fields={[
                    ["field", "Campo"],
                    ["value", "Valor original"],
                  ]}
                  rows={Object.entries(selectedHistory.raw_data).map(
                    ([field, value]) => ({
                      id: field,
                      field,
                      value: show(value),
                    }),
                  )}
                />
              </details>
            </>
          )}
          {selectedFuel && (
            <ManagementTable
              label="Detalle de carga"
              fields={[
                ["field", "Campo"],
                ["value", "Valor"],
              ]}
              rows={Object.entries(selectedFuel.raw_data).map(
                ([key, value]) => ({ id: key, field: key, value: show(value) }),
              )}
            />
          )}
        </ResponsiveDrawerBody>
      </ResponsiveDrawer>
      <ResponsiveDrawer
        title="Importe de factura"
        open={!!amountInvoice}
        onOpenChange={(open) => {
          if (!open && !saving) setAmountInvoice(null);
        }}
      >
        <ResponsiveDrawerHeader>
          <h2 className="font-semibold">Importe de factura</h2>
        </ResponsiveDrawerHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            try {
              await fleetRpc("fleet_set_invoice_amount", {
                p_id: amountInvoice!.id,
                p_amount: Number(amount),
                p_currency: currency,
              });
              await refresh();
              setAmountInvoice(null);
            } catch (e) {
              toast.error(show((e as { message?: string }).message));
            } finally {
              setSaving(false);
            }
          }}
        >
          <ResponsiveDrawerBody className="space-y-3">
            <Label htmlFor="amount">Importe</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <Label htmlFor="currency">Moneda</Label>
            <Input
              id="currency"
              pattern="[A-Z]{3}"
              required
              maxLength={3}
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            />
          </ResponsiveDrawerBody>
          <ResponsiveDrawerFooter>
            <Button disabled={saving}>Guardar</Button>
          </ResponsiveDrawerFooter>
        </form>
      </ResponsiveDrawer>
    </PageShell>
  );
}
