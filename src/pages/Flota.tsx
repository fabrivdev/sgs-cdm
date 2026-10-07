import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, CalendarClock, CarFront, Gauge, PencilLine, Plus, RotateCcw, UserRoundPen } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, PageShell, Panel } from "@/components/layout/AppPrimitives";
import { FiltersBar, FilterDate, FilterSelect } from "@/components/filters/FiltersBar";
import { QuickPeriodFilter } from "@/components/filters/QuickPeriodFilter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveDrawer, ResponsiveDrawerBody, ResponsiveDrawerFooter, ResponsiveDrawerHeader } from "@/components/ui/responsive-drawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fleetErrorMessage } from "@/features/fleet/api";
import {
  fleetBrandOptions,
  fleetModelOptions,
  matchesFleetDimensions,
  vehicleHasReadingInRange,
  type FleetReadingPresence,
} from "@/features/fleet/filters";
import {
  currentFleetResponsibility,
  dateDistanceInDays,
  fleetResponsibilityHistory,
  mileageRows,
  normalizePlate,
  validateReading,
  vehicleLatestReading,
  type FleetOdometerReading,
  type FleetResponsibleCandidate,
  type FleetResponsibilityEvent,
  type FleetVehicle,
} from "@/features/fleet/model";
import { defaultCustomFrom, periodMileage, resolveFleetPeriod, todayInParaguay, type FleetPeriodMileage, type FleetPeriodReading } from "@/features/fleet/period";
import type { FleetPreviewSnapshot } from "@/features/fleet/previewData";
import { cloneFleetPreviewSnapshot } from "@/features/fleet/previewState";
import { useAddFleetReading, useCorrectFleetReading, useCreateFleetVehicle, useFleet, useSetFleetResponsible } from "@/features/fleet/useFleet";
import { fleetVehicleReferenceImage } from "@/features/fleet/vehicleImages";
import { cn } from "@/lib/utils";

const kmFormatter = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const dateTimeFormatter = new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const EMPTY_VEHICLES: FleetVehicle[] = [];
const EMPTY_READINGS: FleetOdometerReading[] = [];
const EMPTY_RESPONSIBILITY_EVENTS: FleetResponsibilityEvent[] = [];
const EMPTY_RESPONSIBLE_CANDIDATES: FleetResponsibleCandidate[] = [];
const UNASSIGNED_RESPONSIBLE = "__unassigned__";
type VehicleFilter = "all" | "current" | "pending" | "alerts";

interface FleetComparisonRow {
  vehicle: FleetVehicle;
  mileage: FleetPeriodMileage;
}

function displayDate(value: string) {
  return dateFormatter.format(new Date(`${value}T00:00:00Z`));
}

function displayDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

function responsibleName(event: FleetResponsibilityEvent | null | undefined) {
  return event?.responsible_name_snapshot?.trim() || "-";
}

function displayKm(value: number | null) {
  return value === null ? "-" : kmFormatter.format(value);
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function vehicleModel(vehicle: FleetVehicle) {
  return vehicle.model?.trim() || "-";
}

function readingStatus(latest: FleetOdometerReading | null, today: string) {
  if (!latest) return { label: "Sin lectura", overdue: true };
  const elapsed = dateDistanceInDays(latest.reading_date, today);
  if (elapsed === null || elapsed < 0) return { label: "Revisar fecha", overdue: true };
  if (elapsed <= 8) return { label: "Al día", overdue: false };
  return { label: `${elapsed} días`, overdue: true };
}

function periodKm(comparison: FleetComparisonRow | undefined) {
  return comparison?.mileage.coverageFrom && comparison.mileage.coverageTo
    ? comparison.mileage.exactKm
    : null;
}

function readingRecord(reading: FleetPeriodReading) {
  if (reading.correction_of) return "Corrección";
  return reading.reading_kind === "initial" ? "Inicial" : "Semanal";
}

function readingObservation(reading: FleetPeriodReading) {
  if (reading.hasWeeklyGap) return `Intervalo de ${reading.elapsedDays} días`;
  if (reading.coverage === "partial") return "Parcial · no sumado";
  return "-";
}

export default function Flota({ previewData }: { previewData?: FleetPreviewSnapshot }) {
  const today = useMemo(() => previewData ? "2026-10-06" : todayInParaguay(), [previewData]);
  const query = useFleet(previewData);
  const createVehicle = useCreateFleetVehicle();
  const addReading = useAddFleetReading();
  const correctReading = useCorrectFleetReading();
  const setResponsible = useSetFleetResponsible();
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false);
  const [readingDialogOpen, setReadingDialogOpen] = useState(false);
  const [correcting, setCorrecting] = useState<FleetOdometerReading | null>(null);
  const [responsibilityDialogOpen, setResponsibilityDialogOpen] = useState(false);
  const [previewSnapshot, setPreviewSnapshot] = useState<FleetPreviewSnapshot | null>(() => previewData ? cloneFleetPreviewSnapshot(previewData) : null);
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState<VehicleFilter>("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [readingPresence, setReadingPresence] = useState<FleetReadingPresence>("all");
  const [customFrom, setCustomFrom] = useState(previewData ? "2026-07-29" : defaultCustomFrom(today));
  const [customTo, setCustomTo] = useState(previewData ? "2026-09-16" : today);

  const snapshot = previewSnapshot ?? query.data;
  const vehicles = snapshot?.vehicles ?? EMPTY_VEHICLES;
  const readings = snapshot?.readings ?? EMPTY_READINGS;
  const responsibilityEvents = snapshot?.responsibilityEvents ?? EMPTY_RESPONSIBILITY_EVENTS;
  const responsibleCandidates = snapshot?.responsibleCandidates ?? EMPTY_RESPONSIBLE_CANDIDATES;
  const previewActorId = previewData?.vehicles[0]?.created_by ?? "00000000-0000-4000-8000-000000000001";
  const previewActorName = previewData?.vehicles[0]?.created_by_name ?? "Usuario DEMO";
  const period = useMemo(() => resolveFleetPeriod("custom", today, customFrom, customTo), [customFrom, customTo, today]);
  const activeVehicles = useMemo(() => vehicles.filter((vehicle) => vehicle.active), [vehicles]);
  const brandOptions = useMemo(() => fleetBrandOptions(activeVehicles), [activeVehicles]);
  const modelOptions = useMemo(() => fleetModelOptions(activeVehicles, brandFilter), [activeVehicles, brandFilter]);
  const comparisons = useMemo<FleetComparisonRow[]>(() => activeVehicles.map((vehicle) => ({
    vehicle,
    mileage: periodMileage(readings.filter((reading) => reading.vehicle_id === vehicle.id), period),
  })), [activeVehicles, period, readings]);
  const responsibilityByVehicle = useMemo(() => new Map(activeVehicles.map((vehicle) => [
    vehicle.id,
    currentFleetResponsibility(vehicle.id, responsibilityEvents, today),
  ])), [activeVehicles, responsibilityEvents, today]);
  const filteredVehicles = useMemo(() => {
    const normalizedSearch = vehicleSearch.trim().toLocaleLowerCase("es");
    return activeVehicles.filter((vehicle) => {
      const latest = vehicleLatestReading(vehicle.id, readings);
      const status = readingStatus(latest, today);
      const vehicleReadings = readings.filter((reading) => reading.vehicle_id === vehicle.id);
      const hasAlert = status.overdue || mileageRows(vehicleReadings).some((reading) => reading.hasWeeklyGap)
        || vehicleReadings.some((reading) => reading.voided_at !== null);
      const searchable = `${vehicle.brand} ${vehicleModel(vehicle)} ${vehicle.plate} ${responsibleName(responsibilityByVehicle.get(vehicle.id))}`.toLocaleLowerCase("es");
      const matchesSearch = !normalizedSearch || searchable.includes(normalizedSearch);
      const matchesFilter = vehicleFilter === "all"
        || (vehicleFilter === "current" && !status.overdue)
        || (vehicleFilter === "pending" && status.overdue)
        || (vehicleFilter === "alerts" && hasAlert);
      const matchesDimensions = matchesFleetDimensions(
        vehicle,
        vehicleHasReadingInRange(vehicle.id, readings, period),
        { brand: brandFilter, model: modelFilter, readingPresence },
      );
      return matchesSearch && matchesFilter && matchesDimensions;
    });
  }, [activeVehicles, brandFilter, modelFilter, period, readingPresence, readings, responsibilityByVehicle, today, vehicleFilter, vehicleSearch]);

  useEffect(() => {
    if (selectedVehicleId && !activeVehicles.some((vehicle) => vehicle.id === selectedVehicleId)) setSelectedVehicleId(null);
  }, [activeVehicles, selectedVehicleId]);

  useEffect(() => {
    if (modelFilter !== "all" && !modelOptions.includes(modelFilter)) setModelFilter("all");
  }, [modelFilter, modelOptions]);

  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null;
  const selectedComparison = comparisons.find((row) => row.vehicle.id === selectedVehicleId);
  const selectedReadings = readings.filter((reading) => reading.vehicle_id === selectedVehicleId);
  const selectedRows = (selectedComparison?.mileage.rows ?? []).slice().reverse();
  const selectedLatest = selectedVehicle ? vehicleLatestReading(selectedVehicle.id, readings) : null;
  const selectedStatus = readingStatus(selectedLatest, today);
  const selectedResponsibility = selectedVehicleId ? responsibilityByVehicle.get(selectedVehicleId) ?? null : null;
  const selectedResponsibilityHistory = selectedVehicleId
    ? fleetResponsibilityHistory(selectedVehicleId, responsibilityEvents)
    : [];
  const auditRows = selectedReadings
    .filter((reading) => reading.voided_at !== null && period.valid && reading.reading_date >= period.from && reading.reading_date <= period.to)
    .sort((left, right) => right.created_at.localeCompare(left.created_at));

  const resetPreview = () => {
    if (!previewData) return;
    setPreviewSnapshot(cloneFleetPreviewSnapshot(previewData));
    setVehicleSearch("");
    setVehicleFilter("all");
    setBrandFilter("all");
    setModelFilter("all");
    setReadingPresence("all");
    setSelectedVehicleId(null);
    setCustomFrom("2026-07-29");
    setCustomTo("2026-09-16");
    setVehicleDialogOpen(false);
    setReadingDialogOpen(false);
    setCorrecting(null);
    setResponsibilityDialogOpen(false);
    toast.success("Datos DEMO restablecidos");
  };

  const handleCreateVehicle = async (values: { brand: string; model: string | null; plate: string; readingDate: string | null; odometerKm: number | null }): Promise<boolean> => {
    if (previewData) {
      const plateNormalized = normalizePlate(values.plate);
      if (vehicles.some((vehicle) => vehicle.plate_normalized === plateNormalized)) {
        toast.error("Ya existe un vehículo con esa chapa.");
        return false;
      }
      const vehicleId = crypto.randomUUID();
      const now = new Date().toISOString();
      setPreviewSnapshot((current) => current ? {
        ...current,
        vehicles: [...current.vehicles, {
          id: vehicleId,
          brand: values.brand,
          model: values.model,
          plate: values.plate,
          plate_normalized: plateNormalized,
          active: true,
          created_at: now,
          created_by: previewActorId,
          created_by_name: previewActorName,
        }],
        readings: values.readingDate !== null && values.odometerKm !== null ? [...current.readings, {
          id: crypto.randomUUID(),
          vehicle_id: vehicleId,
          reading_date: values.readingDate,
          odometer_km: values.odometerKm,
          reading_kind: "initial",
          correction_of: null,
          created_at: now,
          created_by: previewActorId,
          created_by_name: previewActorName,
          voided_at: null,
          voided_by: null,
          voided_by_name: null,
          void_reason: null,
        }] : current.readings,
      } : current);
      setVehicleSearch("");
      setVehicleFilter("all");
      setBrandFilter("all");
      setModelFilter("all");
      setReadingPresence("all");
      setSelectedVehicleId(vehicleId);
      setVehicleDialogOpen(false);
      toast.success("Vehículo agregado a la simulación");
      return true;
    }
    try {
      const vehicleId = await createVehicle.mutateAsync({
        brand: values.brand,
        model: values.model,
        plate: values.plate,
        initialReadingDate: values.readingDate,
        initialOdometerKm: values.odometerKm,
      });
      setSelectedVehicleId(vehicleId);
      setVehicleDialogOpen(false);
      toast.success("Vehículo agregado");
      return true;
    } catch (error) {
      toast.error(fleetErrorMessage(error));
      return false;
    }
  };

  const handleAddReading = async (values: { readingDate: string; odometerKm: number }): Promise<boolean> => {
    if (!selectedVehicle) return false;
    if (previewData) {
      setPreviewSnapshot((current) => current ? {
        ...current,
        readings: [...current.readings, {
          id: crypto.randomUUID(),
          vehicle_id: selectedVehicle.id,
          reading_date: values.readingDate,
          odometer_km: values.odometerKm,
          reading_kind: selectedReadings.some((reading) => reading.voided_at === null) ? "weekly" : "initial",
          correction_of: null,
          created_at: new Date().toISOString(),
          created_by: previewActorId,
          created_by_name: previewActorName,
          voided_at: null,
          voided_by: null,
          voided_by_name: null,
          void_reason: null,
        }],
      } : current);
      setReadingDialogOpen(false);
      toast.success("Lectura agregada a la simulación");
      return true;
    }
    try {
      await addReading.mutateAsync({ vehicleId: selectedVehicle.id, ...values });
      setReadingDialogOpen(false);
      toast.success("Lectura registrada");
      return true;
    } catch (error) {
      toast.error(fleetErrorMessage(error));
      return false;
    }
  };

  const handleCorrection = async (values: { readingDate: string; odometerKm: number; reason: string }) => {
    if (!correcting) return;
    if (previewData) {
      const now = new Date().toISOString();
      setPreviewSnapshot((current) => current ? {
        ...current,
        readings: [
          ...current.readings.map((reading) => reading.id === correcting.id ? {
            ...reading,
            voided_at: now,
            voided_by: previewActorId,
            voided_by_name: previewActorName,
            void_reason: values.reason,
          } : reading),
          {
            id: crypto.randomUUID(),
            vehicle_id: correcting.vehicle_id,
            reading_date: values.readingDate,
            odometer_km: values.odometerKm,
            reading_kind: correcting.reading_kind,
            correction_of: correcting.id,
            created_at: now,
            created_by: previewActorId,
            created_by_name: previewActorName,
            voided_at: null,
            voided_by: null,
            voided_by_name: null,
            void_reason: null,
          },
        ],
      } : current);
      setCorrecting(null);
      toast.success("Corrección guardada en la simulación");
      return;
    }
    try {
      await correctReading.mutateAsync({
        readingId: correcting.id,
        vehicleId: correcting.vehicle_id,
        ...values,
      });
      setCorrecting(null);
      toast.success("Lectura corregida");
    } catch (error) {
      toast.error(fleetErrorMessage(error));
    }
  };

  const handleResponsibleChange = async (values: { responsibleProfileId: string | null; effectiveDate: string }) => {
    if (!selectedVehicle) return;
    if (previewData) {
      const candidate = responsibleCandidates.find((row) => row.id === values.responsibleProfileId) ?? null;
      setPreviewSnapshot((current) => current ? {
        ...current,
        responsibilityEvents: [...current.responsibilityEvents, {
          id: crypto.randomUUID(),
          vehicle_id: selectedVehicle.id,
          responsible_profile_id: candidate?.id ?? null,
          responsible_name_snapshot: candidate?.nombre ?? null,
          effective_date: values.effectiveDate,
          recorded_at: new Date().toISOString(),
          recorded_by: previewActorId,
          recorded_by_name: previewActorName,
        }],
      } : current);
      setResponsibilityDialogOpen(false);
      toast.success("Responsable actualizado en la simulación");
      return;
    }
    try {
      await setResponsible.mutateAsync({
        vehicleId: selectedVehicle.id,
        responsibleProfileId: values.responsibleProfileId,
        effectiveDate: values.effectiveDate,
      });
      setResponsibilityDialogOpen(false);
      toast.success("Responsable actualizado");
    } catch (error) {
      toast.error(fleetErrorMessage(error));
    }
  };

  const resetFleetFilters = () => {
    setVehicleSearch("");
    setVehicleFilter("all");
    setBrandFilter("all");
    setModelFilter("all");
    setReadingPresence("all");
    setCustomFrom(previewData ? "2026-07-29" : defaultCustomFrom(today));
    setCustomTo(previewData ? "2026-09-16" : today);
  };
  const activeFilterCount = (vehicleSearch ? 1 : 0)
    + (vehicleFilter !== "all" ? 1 : 0)
    + (brandFilter !== "all" ? 1 : 0)
    + (modelFilter !== "all" ? 1 : 0)
    + (readingPresence !== "all" ? 1 : 0);

  return <PageShell>
    <PageHeader
      title="Flota"
      actions={selectedVehicle
        ? <Button size="sm" onClick={() => setReadingDialogOpen(true)}><Gauge className="h-4 w-4" /> Registrar lectura</Button>
        : <Button size="sm" aria-label="Nuevo vehículo" className="max-sm:w-11 max-sm:px-0" onClick={() => setVehicleDialogOpen(true)}><Plus className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Nuevo vehículo</span></Button>}
    />

    {previewData && <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-2 text-[12px] text-sky-950">
      <Badge variant="outline" className="border-sky-300 bg-white text-[10px] text-sky-800">Datos ficticios</Badge>
      <span className="hidden min-w-0 flex-1 sm:inline">Simulación local · nada se guarda en la base.</span>
      <Button variant="ghost" size="sm" className="h-8 text-sky-900 max-sm:min-h-11" onClick={resetPreview}><RotateCcw className="h-3.5 w-3.5" /> Restablecer demo</Button>
    </div>}

    {query.isError ? <Panel className="border-amber-200 bg-amber-50/60">
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[13px] text-amber-900"><AlertTriangle className="h-4 w-4" /><span>{fleetErrorMessage(query.error)}</span></div>
        <Button variant="outline" size="sm" onClick={() => query.refetch()}>Reintentar</Button>
      </div>
    </Panel> : query.isPending ? <p role="status" className="py-10 text-center text-sm text-muted-foreground">Cargando Flota.</p> : selectedVehicle ? <VehicleDetail
      vehicle={selectedVehicle}
      latest={selectedLatest}
      status={selectedStatus}
      comparison={selectedComparison}
      responsibility={selectedResponsibility}
      responsibilityHistory={selectedResponsibilityHistory}
      rows={selectedRows}
      auditRows={auditRows}
      onBack={() => setSelectedVehicleId(null)}
      onCorrect={setCorrecting}
      onEditResponsible={() => setResponsibilityDialogOpen(true)}
    /> : <>
      <FiltersBar
        search={{ value: vehicleSearch, onChange: setVehicleSearch, placeholder: "Buscar marca, modelo, chapa o responsable" }}
        activeCount={activeFilterCount}
        onClear={resetFleetFilters}
        expanded={<>
          <FilterSelect
            label="Marca"
            value={brandFilter}
            onChange={(value) => { setBrandFilter(value); setModelFilter("all"); }}
            placeholder="Todas"
            width="w-full"
            options={[{ value: "all", label: "Todas" }, ...brandOptions.map((value) => ({ value, label: value }))]}
          />
          <FilterSelect
            label="Modelo"
            value={modelFilter}
            onChange={setModelFilter}
            placeholder="Todos"
            width="w-full"
            options={[{ value: "all", label: "Todos" }, ...modelOptions.map((value) => ({ value, label: value }))]}
          />
          <FilterSelect
            label="Lecturas en el período"
            value={readingPresence}
            onChange={(value) => setReadingPresence(value as FleetReadingPresence)}
            placeholder="Todas"
            width="w-full"
            options={[{ value: "all", label: "Todas" }, { value: "with", label: "Con lecturas" }, { value: "without", label: "Sin lecturas" }]}
          />
        </>}
      >
        <QuickPeriodFilter from={customFrom} to={customTo} endAtToday onChange={(from, to) => { setCustomFrom(from); setCustomTo(to); }} />
        <FilterDate label="Desde" value={customFrom} onChange={setCustomFrom} max={customTo} />
        <FilterDate label="Hasta" value={customTo} onChange={setCustomTo} min={customFrom} />
        <FilterSelect
          label="Estado"
          value={vehicleFilter}
          onChange={(value) => setVehicleFilter(value as VehicleFilter)}
          placeholder="Todos"
          options={[{ value: "all", label: "Todos" }, { value: "current", label: "Al día" }, { value: "pending", label: "Pendientes" }, { value: "alerts", label: "Alertas" }]}
          width="w-[140px]"
        />
      </FiltersBar>

      {!period.valid && <p role="alert" className="flex items-center gap-1.5 text-[12px] text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> La fecha "Desde" debe ser anterior o igual a "Hasta".</p>}
      <FleetVehicleList
        vehicles={filteredVehicles}
        activeVehicleCount={activeVehicles.length}
        readings={readings}
        comparisons={comparisons}
        responsibilityByVehicle={responsibilityByVehicle}
        today={today}
        onOpen={setSelectedVehicleId}
        onClearFilters={resetFleetFilters}
      />
    </>}

    <VehicleDialog open={vehicleDialogOpen} pending={createVehicle.isPending} today={today} onOpenChange={setVehicleDialogOpen} onSubmit={handleCreateVehicle} />
    <ReadingDialog open={readingDialogOpen} pending={addReading.isPending} today={today} vehicle={selectedVehicle} readings={selectedReadings} onOpenChange={setReadingDialogOpen} onSubmit={handleAddReading} />
    <CorrectionDialog reading={correcting} pending={correctReading.isPending} today={today} readings={selectedReadings} onOpenChange={(open) => !open && setCorrecting(null)} onSubmit={handleCorrection} />
    <ResponsibilityDialog
      open={responsibilityDialogOpen}
      pending={setResponsible.isPending}
      today={today}
      current={selectedResponsibility}
      candidates={responsibleCandidates}
      onOpenChange={setResponsibilityDialogOpen}
      onSubmit={handleResponsibleChange}
    />
  </PageShell>;
}

export function FleetVehicleList({ vehicles, activeVehicleCount, readings, comparisons, responsibilityByVehicle, today, onOpen, onClearFilters }: {
  vehicles: FleetVehicle[];
  activeVehicleCount: number;
  readings: FleetOdometerReading[];
  comparisons: FleetComparisonRow[];
  responsibilityByVehicle: Map<string, FleetResponsibilityEvent | null>;
  today: string;
  onOpen: (vehicleId: string) => void;
  onClearFilters: () => void;
}) {
  return <Panel className="overflow-hidden p-0">
    <div className="border-b px-3 py-2 sm:px-4 sm:py-3"><InlineSectionHeading title="Vehículos" count={`${vehicles.length} de ${activeVehicleCount}`} /></div>
    {!activeVehicleCount ? <div className="px-4 py-10 text-center"><CarFront className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" /><p className="text-[13px] font-medium">Todavía no hay vehículos</p></div>
      : !vehicles.length ? <div className="px-4 py-8 text-center"><p className="text-[13px] font-medium">Sin coincidencias</p><Button variant="ghost" size="sm" className="mt-2" onClick={onClearFilters}>Limpiar filtros</Button></div>
        : <>
          <div className="divide-y sm:hidden">{vehicles.map((vehicle) => {
            const latest = vehicleLatestReading(vehicle.id, readings);
            const status = readingStatus(latest, today);
            const comparison = comparisons.find((row) => row.vehicle.id === vehicle.id);
            const responsibility = responsibilityByVehicle.get(vehicle.id);
            return <button key={vehicle.id} type="button" className="grid min-h-14 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-left hover:bg-muted/35" onClick={() => onOpen(vehicle.id)}>
              <span className="min-w-0"><span className="block truncate text-[12px] font-semibold">{vehicle.brand}{vehicleModel(vehicle) === "-" ? "" : ` · ${vehicleModel(vehicle)}`}</span><span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground" title={`${vehicle.plate} · ${responsibleName(responsibility)}${latest ? ` · ${displayDate(latest.reading_date)}` : ""}`}>{vehicle.plate} · {responsibleName(responsibility)}{latest ? ` · ${displayDate(latest.reading_date)}` : ""}</span></span>
              <span className="text-right"><span className="block text-[9px] text-muted-foreground">Km período</span><span className="block text-[11px] font-semibold tabular-nums">{displayKm(periodKm(comparison))}</span><Badge variant="outline" className={cn("mt-1 px-1.5 text-[8px]", status.overdue ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>{status.label}</Badge></span>
            </button>;
          })}</div>
          <div className="hidden overflow-hidden sm:block">
            <Table className="table-fixed">
              <colgroup><col className="w-[12%]" /><col className="w-[16%]" /><col className="w-[10%]" /><col className="w-[17%]" /><col className="w-[12%]" /><col className="w-[14%]" /><col className="w-[10%]" /><col className="w-[9%]" /></colgroup>
              <TableHeader><TableRow className="h-8 hover:bg-transparent">
                <TableHead className="h-8 whitespace-nowrap px-3 text-[9px]">Marca</TableHead>
                <TableHead className="h-8 whitespace-nowrap px-2 text-[9px]">Modelo</TableHead>
                <TableHead className="h-8 whitespace-nowrap px-2 text-[9px]">Chapa</TableHead>
                <TableHead className="h-8 whitespace-nowrap px-2 text-[9px]">Responsable</TableHead>
                <TableHead className="h-8 whitespace-nowrap px-1 text-center text-[9px]"><span className="xl:hidden">Último km</span><span className="hidden xl:inline">Último kilometraje</span></TableHead>
                <TableHead className="h-8 whitespace-nowrap px-1 text-center text-[9px]"><span className="xl:hidden">Fecha lectura</span><span className="hidden xl:inline">Fecha última lectura</span></TableHead>
                <TableHead className="h-8 whitespace-nowrap px-1 text-center text-[9px]"><span className="xl:hidden">Km período</span><span className="hidden xl:inline">Km del período</span></TableHead>
                <TableHead className="h-8 whitespace-nowrap px-2 text-center text-[9px]">Estado</TableHead>
              </TableRow></TableHeader>
              <TableBody>{vehicles.map((vehicle) => {
                const latest = vehicleLatestReading(vehicle.id, readings);
                const status = readingStatus(latest, today);
                const comparison = comparisons.find((row) => row.vehicle.id === vehicle.id);
                const responsibility = responsibilityByVehicle.get(vehicle.id);
                const openVehicle = () => onOpen(vehicle.id);
                return <TableRow key={vehicle.id} tabIndex={0} aria-label={`Abrir ${vehicle.brand}, chapa ${vehicle.plate}`} className="h-11 cursor-pointer focus-visible:bg-muted/35" onClick={openVehicle} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openVehicle(); } }}>
                  <TableCell className="h-11 truncate px-3 py-0 text-[11px] font-semibold" title={vehicle.brand}>{vehicle.brand}</TableCell>
                  <TableCell className="h-11 truncate px-2 py-0 text-[11px]" title={vehicleModel(vehicle)}>{vehicleModel(vehicle)}</TableCell>
                  <TableCell className="h-11 truncate px-2 py-0 font-mono text-[10px] tracking-[0.04em] text-muted-foreground" title={vehicle.plate}>{vehicle.plate}</TableCell>
                  <TableCell className="h-11 truncate px-2 py-0 text-[11px]" title={responsibleName(responsibility)}>{responsibleName(responsibility)}</TableCell>
                  <TableCell className="h-11 whitespace-nowrap px-1 py-0 text-center text-[11px] tabular-nums">{displayKm(latest?.odometer_km ?? null)}</TableCell>
                  <TableCell className="h-11 whitespace-nowrap px-1 py-0 text-center text-[11px] tabular-nums">{latest ? displayDate(latest.reading_date) : "-"}</TableCell>
                  <TableCell className="h-11 whitespace-nowrap px-1 py-0 text-center text-[11px] font-semibold tabular-nums">{displayKm(periodKm(comparison))}</TableCell>
                  <TableCell className="h-11 whitespace-nowrap px-2 py-0 text-center"><Badge variant="outline" className={cn("px-1.5 text-[9px]", status.overdue ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>{status.label}</Badge></TableCell>
                </TableRow>;
              })}</TableBody>
            </Table>
          </div>
        </>}
  </Panel>;
}

export function VehicleDetail({ vehicle, latest, status, comparison, responsibility, responsibilityHistory, rows, auditRows, onBack, onCorrect, onEditResponsible }: {
  vehicle: FleetVehicle;
  latest: FleetOdometerReading | null;
  status: { label: string; overdue: boolean };
  comparison: FleetComparisonRow | undefined;
  responsibility: FleetResponsibilityEvent | null;
  responsibilityHistory: FleetResponsibilityEvent[];
  rows: FleetPeriodReading[];
  auditRows: FleetOdometerReading[];
  onBack: () => void;
  onCorrect: (reading: FleetOdometerReading) => void;
  onEditResponsible: () => void;
}) {
  const referenceImage = fleetVehicleReferenceImage(vehicle);
  return <Panel className="overflow-hidden p-0">
    <div className="border-b px-4 py-3">
      <Button variant="ghost" size="sm" className="-ml-2 mb-2 max-sm:min-h-11" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Volver a la flota</Button>
      <div className="flex min-w-0 items-start gap-3">
        {referenceImage && <div className="w-28 shrink-0 sm:w-36">
          <img src={referenceImage.imageUrl} alt={referenceImage.alt} className="h-16 w-full rounded-lg border bg-white object-contain sm:h-20" loading="lazy" />
        </div>}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="truncate text-[15px] font-semibold">{vehicle.brand}</h2>
          {vehicleModel(vehicle) !== "-" && <span className="truncate text-[13px] text-muted-foreground">{vehicleModel(vehicle)}</span>}
          {vehicle.model_year && <span className="text-[11px] text-muted-foreground">{vehicle.model_year}</span>}
          <span className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground">{vehicle.plate}</span>
          <Badge variant="outline" className={cn("text-[9px]", status.overdue ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>{status.label}</Badge>
          <span className="basis-full truncate text-[11px] text-muted-foreground" title={responsibleName(responsibility)}>Responsable: <span className="font-medium text-foreground">{responsibleName(responsibility)}</span></span>
          <Button variant="outline" size="sm" className="h-8 max-sm:h-11 max-sm:w-11 max-sm:p-0" aria-label="Cambiar responsable" onClick={onEditResponsible}><UserRoundPen className="h-3.5 w-3.5" /><span className="max-sm:sr-only">Cambiar responsable</span></Button>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-muted/45 px-3 py-2 sm:grid-cols-4">
        <DetailDatum label="Último kilometraje" value={displayKm(latest?.odometer_km ?? null)} />
        <DetailDatum label="Fecha última lectura" value={latest ? displayDate(latest.reading_date) : "-"} />
        <DetailDatum label="Km del período" value={displayKm(periodKm(comparison))} />
        <DetailDatum label="Cobertura" value={comparison?.mileage.coverageFrom && comparison.mileage.coverageTo ? `${shortDate(comparison.mileage.coverageFrom)} - ${shortDate(comparison.mileage.coverageTo)}` : "Sin intervalo"} allowWrap />
      </dl>
    </div>
    <div className="space-y-3 p-4">
      <InlineSectionHeading title="Lecturas" count={rows.length ? `${rows.length} en el período` : "Sin lecturas en el período"} />
      {rows.length ? <>
        <div className="divide-y rounded-lg border sm:hidden">{rows.map((reading) => <ReadingMobileRow key={reading.id} reading={reading} onCorrect={() => onCorrect(reading)} />)}</div>
        <div className="hidden overflow-hidden rounded-lg border sm:block">
          <Table className="table-fixed">
            <colgroup><col className="w-[14%]" /><col className="w-[16%]" /><col className="w-[16%]" /><col className="w-[13%]" /><col className="w-[17%]" /><col className="w-[19%]" /><col className="w-[5%]" /></colgroup>
            <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead className="text-center">Odómetro</TableHead><TableHead className="text-center">Recorrido</TableHead><TableHead>Registro</TableHead><TableHead>Autor</TableHead><TableHead>Observación</TableHead><TableHead><span className="sr-only">Acciones</span></TableHead></TableRow></TableHeader>
            <TableBody>{rows.map((reading) => <ReadingRow key={reading.id} reading={reading} onCorrect={() => onCorrect(reading)} />)}</TableBody>
          </Table>
        </div>
      </> : <EmptyReadings />}
      {auditRows.length > 0 && <CorrectionHistory rows={auditRows} />}
      {responsibilityHistory.length > 0 && <ResponsibilityHistory rows={responsibilityHistory} />}
    </div>
  </Panel>;
}

function ResponsibilityHistory({ rows }: { rows: FleetResponsibilityEvent[] }) {
  return <div className="space-y-2 border-t pt-3">
    <InlineSectionHeading title="Responsables" count={`${rows.length}`} />
    <div className="divide-y rounded-lg border sm:hidden">{rows.map((event) => <article key={event.id} className="px-3 py-2.5 text-[11px]">
      <div className="flex items-center justify-between gap-3"><span className="truncate font-medium">{event.responsible_name_snapshot ?? "Sin responsable"}</span><span className="shrink-0 text-muted-foreground">{event.effective_date ? displayDate(event.effective_date) : "Fecha no informada"}</span></div>
      <div className="mt-0.5 truncate text-[10px] text-muted-foreground" title={`${event.recorded_by_name} · ${displayDateTime(event.recorded_at)}`}>{event.recorded_by_name} · {displayDateTime(event.recorded_at)}</div>
    </article>)}</div>
    <div className="hidden overflow-hidden rounded-lg border sm:block">
      <Table className="table-fixed">
        <colgroup><col className="w-[22%]" /><col className="w-[30%]" /><col className="w-[24%]" /><col className="w-[24%]" /></colgroup>
        <TableHeader><TableRow><TableHead>Vigente desde</TableHead><TableHead>Responsable</TableHead><TableHead>Registrado por</TableHead><TableHead>Registro</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((event) => <TableRow key={event.id} className="h-10">
          <TableCell className="h-10 whitespace-nowrap py-0 text-[11px]">{event.effective_date ? displayDate(event.effective_date) : "Fecha no informada"}</TableCell>
          <TableCell className="h-10 truncate py-0 text-[11px] font-medium" title={event.responsible_name_snapshot ?? "Sin responsable"}>{event.responsible_name_snapshot ?? "Sin responsable"}</TableCell>
          <TableCell className="h-10 truncate py-0 text-[11px] text-muted-foreground" title={event.recorded_by_name}>{event.recorded_by_name}</TableCell>
          <TableCell className="h-10 whitespace-nowrap py-0 text-[11px] text-muted-foreground">{displayDateTime(event.recorded_at)}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </div>
  </div>;
}

function CorrectionHistory({ rows }: { rows: FleetOdometerReading[] }) {
  return <div className="space-y-2 border-t pt-3">
    <InlineSectionHeading title="Correcciones" count={`${rows.length}`} />
    <div className="divide-y rounded-lg border sm:hidden">{rows.map((reading) => <article key={reading.id} className="px-3 py-2.5 text-[11px]">
      <div className="flex items-center justify-between gap-3"><span className="whitespace-nowrap line-through">{displayDate(reading.reading_date)}</span><span className="whitespace-nowrap font-medium tabular-nums line-through">{displayKm(reading.odometer_km)}</span></div>
      <div className="mt-1 truncate" title={reading.void_reason ?? "-"}>{reading.void_reason ?? "-"}</div>
      <div className="mt-0.5 truncate text-[10px] text-muted-foreground" title={reading.voided_by_name ?? "Usuario"}>{reading.voided_by_name ?? "Usuario"}</div>
    </article>)}</div>
    <div className="hidden overflow-hidden rounded-lg border sm:block">
      <Table className="table-fixed">
        <colgroup><col className="w-[18%]" /><col className="w-[18%]" /><col className="w-[42%]" /><col className="w-[22%]" /></colgroup>
        <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead className="text-center">Odómetro anterior</TableHead><TableHead>Motivo</TableHead><TableHead>Autor</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((reading) => <TableRow key={reading.id} className="h-10">
          <TableCell className="truncate py-0 text-[11px] line-through">{displayDate(reading.reading_date)}</TableCell>
          <TableCell className="whitespace-nowrap py-0 text-center text-[11px] tabular-nums line-through">{displayKm(reading.odometer_km)}</TableCell>
          <TableCell className="truncate py-0 text-[11px]" title={reading.void_reason ?? "-"}>{reading.void_reason ?? "-"}</TableCell>
          <TableCell className="truncate py-0 text-[11px] text-muted-foreground" title={reading.voided_by_name ?? "Usuario"}>{reading.voided_by_name ?? "Usuario"}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </div>
  </div>;
}

function InlineSectionHeading({ title, count }: { title: string; count: string }) {
  return <div className="flex min-h-8 min-w-0 items-center justify-between gap-3">
    <h2 className="truncate text-[13px] font-semibold leading-5">{title}</h2>
    <span className="shrink-0 text-[10px] text-muted-foreground">{count}</span>
  </div>;
}

function DetailDatum({ label, value, allowWrap = false }: { label: string; value: string; allowWrap?: boolean }) {
  return <div className="min-w-0"><dt className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</dt><dd className={cn("mt-0.5 text-[11px] font-semibold tabular-nums", allowWrap ? "leading-4" : "truncate")} title={value}>{value}</dd></div>;
}

function EmptyReadings() {
  return <div className="rounded-xl border border-dashed px-4 py-8 text-center"><CalendarClock className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" /><p className="text-[12px] font-medium">Sin lecturas en este período</p></div>;
}

function ReadingMobileRow({ reading, onCorrect }: { reading: FleetPeriodReading; onCorrect: () => void }) {
  return <article className="min-w-0 px-3 py-2.5">
    <div className="flex min-w-0 items-start justify-between gap-2"><div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><span className="text-[12px] font-medium">{displayDate(reading.reading_date)}</span><Badge variant="outline" className="px-1 text-[8px]">{readingRecord(reading)}</Badge></div><div className="mt-0.5 truncate text-[9px] text-muted-foreground">{reading.created_by_name}</div></div><Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={onCorrect} aria-label={`Corregir lectura del ${displayDate(reading.reading_date)}`}><PencilLine className="h-4 w-4" /></Button></div>
    {readingObservation(reading) !== "-" && <div className="mt-1 text-[9px] text-amber-700">{readingObservation(reading)}</div>}
    <dl className="mt-2 grid grid-cols-2 gap-3 rounded-md bg-muted/40 px-2.5 py-2"><DetailDatum label="Odómetro" value={displayKm(reading.odometer_km)} /><DetailDatum label="Recorrido" value={displayKm(reading.countedKm)} /></dl>
  </article>;
}

function ReadingRow({ reading, onCorrect }: { reading: FleetPeriodReading; onCorrect: () => void }) {
  const observation = readingObservation(reading);
  return <TableRow className="h-10">
    <TableCell className="h-10 whitespace-nowrap py-0 text-[11px] font-medium">{displayDate(reading.reading_date)}</TableCell>
    <TableCell className="h-10 whitespace-nowrap py-0 text-center text-[11px] tabular-nums">{displayKm(reading.odometer_km)}</TableCell>
    <TableCell className="h-10 whitespace-nowrap py-0 text-center text-[11px] font-medium tabular-nums">{displayKm(reading.countedKm)}</TableCell>
    <TableCell className="h-10 truncate py-0 text-[11px]">{readingRecord(reading)}</TableCell>
    <TableCell className="h-10 truncate py-0 text-[11px] text-muted-foreground" title={reading.created_by_name}>{reading.created_by_name}</TableCell>
    <TableCell className={cn("h-10 truncate py-0 text-[11px]", observation === "-" ? "text-muted-foreground" : "text-amber-700")} title={observation}>{observation}</TableCell>
    <TableCell className="h-10 p-0 text-center"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={onCorrect} aria-label={`Corregir lectura del ${displayDate(reading.reading_date)}`}><PencilLine className="h-3.5 w-3.5" /></Button></TableCell>
  </TableRow>;
}

export function VehicleDialog({ open, pending, today, onOpenChange, onSubmit }: {
  open: boolean;
  pending: boolean;
  today: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { brand: string; model: string | null; plate: string; readingDate: string | null; odometerKm: number | null }) => Promise<boolean>;
}) {
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [plate, setPlate] = useState("");
  const [readingDate, setReadingDate] = useState("");
  const [odometer, setOdometer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const reset = () => {
    setBrand(""); setModel(""); setPlate(""); setReadingDate(""); setOdometer("");
  };
  const busy = pending || submitting;
  const hasAnyReadingValue = Boolean(readingDate || odometer !== "");
  const hasCompleteReading = Boolean(readingDate && odometer !== "" && Number(odometer) >= 0);
  const valid = Boolean(brand.trim() && normalizePlate(plate).length >= 3 && (!hasAnyReadingValue || hasCompleteReading));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || busy || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const saved = await onSubmit({
        brand: brand.trim(),
        model: model.trim() || null,
        plate: plate.trim().toUpperCase(),
        readingDate: hasCompleteReading ? readingDate : null,
        odometerKm: hasCompleteReading ? Number(odometer) : null,
      });
      if (saved) reset();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };
  const dismiss = (next: boolean) => {
    if (busy) return;
    onOpenChange(next);
  };
  const cancel = () => {
    if (busy) return;
    reset();
    onOpenChange(false);
  };
  return <ResponsiveDrawer open={open} onOpenChange={dismiss} size="sm">
    <ResponsiveDrawerHeader>
      <h2 className="pr-8 text-[14px] font-semibold">Nuevo vehículo</h2>
      <p className="mt-1 text-[12px] text-muted-foreground">Marca y chapa son obligatorias. Modelo y lectura inicial son opcionales.</p>
    </ResponsiveDrawerHeader>
    <ResponsiveDrawerBody>
      <form id="fleet-vehicle-form" onSubmit={submit} className="space-y-4">
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
        <Field label="Marca" htmlFor="fleet-brand"><Input id="fleet-brand" value={brand} onChange={(event) => setBrand(event.target.value)} autoComplete="off" autoFocus /></Field>
        <Field label="Modelo" htmlFor="fleet-model"><Input id="fleet-model" value={model} onChange={(event) => setModel(event.target.value)} autoComplete="off" /></Field>
        <Field label="Chapa" htmlFor="fleet-plate"><Input id="fleet-plate" value={plate} onChange={(event) => setPlate(event.target.value.toUpperCase())} autoComplete="off" /></Field>
        <div className="sm:col-span-2 mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Lectura inicial · opcional</div>
        <Field label="Fecha" htmlFor="fleet-initial-date"><Input id="fleet-initial-date" type="date" max={today} value={readingDate} onChange={(event) => setReadingDate(event.target.value)} /></Field>
        <Field label="Kilometraje" htmlFor="fleet-initial-km"><Input id="fleet-initial-km" type="number" min={0} step={1} value={odometer} onChange={(event) => setOdometer(event.target.value)} /></Field>
      </fieldset>
      {hasAnyReadingValue && !hasCompleteReading && <p role="alert" className="text-[11px] text-amber-700">Completá fecha y kilometraje, o dejá ambos vacíos.</p>}
      </form>
    </ResponsiveDrawerBody>
    <ResponsiveDrawerFooter>
      <Button type="button" variant="outline" onClick={cancel} disabled={busy}>Cancelar</Button>
      <Button type="submit" form="fleet-vehicle-form" disabled={!valid || busy}>{busy ? "Guardando…" : "Agregar"}</Button>
    </ResponsiveDrawerFooter>
  </ResponsiveDrawer>;
}

function ResponsibilityDialog({ open, pending, today, current, candidates, onOpenChange, onSubmit }: {
  open: boolean;
  pending: boolean;
  today: string;
  current: FleetResponsibilityEvent | null;
  candidates: FleetResponsibleCandidate[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { responsibleProfileId: string | null; effectiveDate: string }) => Promise<void>;
}) {
  const [responsibleId, setResponsibleId] = useState(UNASSIGNED_RESPONSIBLE);
  const [effectiveDate, setEffectiveDate] = useState(today);
  const options = useMemo(() => candidates.filter((candidate, index, rows) => rows.findIndex((row) => row.id === candidate.id) === index), [candidates]);
  useEffect(() => {
    if (!open) return;
    setResponsibleId(current?.responsible_profile_id ?? UNASSIGNED_RESPONSIBLE);
    setEffectiveDate(today);
  }, [current, open, today]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!effectiveDate) return;
    void onSubmit({
      responsibleProfileId: responsibleId === UNASSIGNED_RESPONSIBLE ? null : responsibleId,
      effectiveDate,
    });
  };
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-sm"><form onSubmit={submit} className="space-y-4">
      <DialogHeader><DialogTitle>Cambiar responsable</DialogTitle></DialogHeader>
      <Field label="Responsable" htmlFor="fleet-responsible">
        <Select value={responsibleId} onValueChange={setResponsibleId}>
          <SelectTrigger id="fleet-responsible"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED_RESPONSIBLE}>Sin responsable</SelectItem>
            {options.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.nombre}{candidate.sucursal ? ` · ${candidate.sucursal}` : ""}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Fecha efectiva" htmlFor="fleet-responsible-date"><Input id="fleet-responsible-date" type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} /></Field>
      <DialogFooter><Button type="submit" disabled={!effectiveDate || pending}>{pending ? "Guardando…" : "Guardar cambio"}</Button></DialogFooter>
    </form></DialogContent>
  </Dialog>;
}

export function ReadingDialog({ open, pending, today, vehicle, readings, onOpenChange, onSubmit }: {
  open: boolean;
  pending: boolean;
  today: string;
  vehicle: FleetVehicle | null;
  readings: FleetOdometerReading[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { readingDate: string; odometerKm: number }) => Promise<boolean>;
}) {
  const [readingDate, setReadingDate] = useState(today);
  const [odometer, setOdometer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const vehicleIdRef = useRef(vehicle?.id ?? null);
  const reset = () => { setReadingDate(today); setOdometer(""); };
  useEffect(() => {
    const nextVehicleId = vehicle?.id ?? null;
    if (vehicleIdRef.current === nextVehicleId) return;
    vehicleIdRef.current = nextVehicleId;
    setReadingDate(today);
    setOdometer("");
  }, [today, vehicle?.id]);
  const busy = pending || submitting;
  const hasActiveReading = readings.some((reading) => reading.voided_at === null);
  const numericKm = Number(odometer);
  const issue = readingDate && odometer !== "" && Number.isFinite(numericKm)
    ? validateReading(readings, readingDate, numericKm)
    : null;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!vehicle || issue || odometer === "" || numericKm < 0 || busy || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const saved = await onSubmit({ readingDate, odometerKm: numericKm });
      if (saved) reset();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };
  const dismiss = (next: boolean) => {
    if (busy) return;
    onOpenChange(next);
  };
  const cancel = () => {
    if (busy) return;
    reset();
    onOpenChange(false);
  };
  return <ResponsiveDrawer open={open} onOpenChange={dismiss} size="sm">
    <ResponsiveDrawerHeader>
      <h2 className="pr-8 text-[14px] font-semibold">{hasActiveReading ? "Registrar lectura" : "Registrar lectura inicial"}</h2>
      <p className="mt-1 text-[12px] text-muted-foreground">{vehicle ? `${vehicle.brand} · ${vehicle.plate}` : "Seleccioná un vehículo."}</p>
    </ResponsiveDrawerHeader>
    <ResponsiveDrawerBody>
      <form id="fleet-reading-form" onSubmit={submit} className="space-y-4">
        <fieldset disabled={busy} className="space-y-4">
          <Field label="Fecha" htmlFor="fleet-reading-date"><Input id="fleet-reading-date" type="date" max={today} value={readingDate} onChange={(event) => setReadingDate(event.target.value)} autoFocus /></Field>
          <Field label="Odómetro" htmlFor="fleet-reading-km"><Input id="fleet-reading-km" type="number" min={0} step={1} value={odometer} onChange={(event) => setOdometer(event.target.value)} /></Field>
        </fieldset>
        {issue && <p role="alert" className="text-[12px] text-amber-700">{issue.message}</p>}
      </form>
    </ResponsiveDrawerBody>
    <ResponsiveDrawerFooter>
      <Button type="button" variant="outline" onClick={cancel} disabled={busy}>Cancelar</Button>
      <Button type="submit" form="fleet-reading-form" disabled={!vehicle || Boolean(issue) || odometer === "" || busy}>{busy ? "Guardando…" : "Registrar"}</Button>
    </ResponsiveDrawerFooter>
  </ResponsiveDrawer>;
}

function CorrectionDialog({ reading, pending, today, readings, onOpenChange, onSubmit }: {
  reading: FleetOdometerReading | null;
  pending: boolean;
  today: string;
  readings: FleetOdometerReading[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { readingDate: string; odometerKm: number; reason: string }) => Promise<void>;
}) {
  const [readingDate, setReadingDate] = useState("");
  const [odometer, setOdometer] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (!reading) return;
    setReadingDate(reading.reading_date); setOdometer(String(reading.odometer_km)); setReason("");
  }, [reading]);
  const numericKm = Number(odometer);
  const issue = reading && readingDate && odometer !== ""
    ? validateReading(readings, readingDate, numericKm, reading.id, reading.reading_kind)
    : null;
  const valid = reading && !issue && odometer !== "" && numericKm >= 0 && reason.trim().length >= 3;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    void onSubmit({ readingDate, odometerKm: numericKm, reason: reason.trim() });
  };
  return <Dialog open={Boolean(reading)} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-sm"><form onSubmit={submit} className="space-y-4">
      <DialogHeader><DialogTitle>Corregir lectura</DialogTitle><DialogDescription>La lectura anterior quedará en el historial.</DialogDescription></DialogHeader>
      <Field label="Fecha" htmlFor="fleet-correction-date"><Input id="fleet-correction-date" type="date" max={today} value={readingDate} onChange={(event) => setReadingDate(event.target.value)} /></Field>
      <Field label="Odómetro" htmlFor="fleet-correction-km"><Input id="fleet-correction-km" type="number" min={0} step={1} value={odometer} onChange={(event) => setOdometer(event.target.value)} /></Field>
      <Field label="Motivo" htmlFor="fleet-correction-reason"><Input id="fleet-correction-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ej. lectura cargada incorrectamente" /></Field>
      {issue && <p role="alert" className="text-[12px] text-amber-700">{issue.message}</p>}
      <DialogFooter><Button type="submit" disabled={!valid || pending}>{pending ? "Guardando…" : "Guardar corrección"}</Button></DialogFooter>
    </form></DialogContent>
  </Dialog>;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label htmlFor={htmlFor}>{label}</Label>{children}</div>;
}
