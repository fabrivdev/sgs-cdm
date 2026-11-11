import { fleetResponsibleName } from "./responsibleNames";
import { fleetRpc } from "./managementApi";
import { currentFleetResponsibility } from "./model";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ResponsiveDrawer,
  ResponsiveDrawerHeader,
  ResponsiveDrawerBody,
  ResponsiveDrawerFooter,
} from "@/components/ui/responsive-drawer";
import {
  ManagementTable,
  type GridField,
  type GridRow,
} from "./ManagementTable";
import { addFleetReading, correctFleetReading } from "./api";
import type { ManagementData } from "./VehiclesList";
import { FleetFilterBar, PeriodFields } from "./workspaceShared";
import {
  matches,
  within,
  type FleetFilters,
  type FilterChange,
} from "./workspaceModel";
import { todayInParaguay } from "./period";
const fields: GridField[] = [
  ["date", "Fecha", "date"],
  ["type", "Registro"],
  ["km", "Km", "number"],
  ["responsible", "Responsable"],
  ["author", "Autor"],
  ["status", "Estado"],
];
export function ReadingsView({
  data,
  vehicleId,
  filters,
  onChange,
  onSaved,
}: {
  data: ManagementData;
  vehicleId: string;
  filters: FleetFilters;
  onChange: FilterChange;
  onSaved: () => Promise<void>;
}) {
  const [actionsTarget, setActionsTarget] = useState<HTMLDivElement | null>(
    null,
  );
  const [mode, setMode] = useState<
      "reading" | "responsible" | "correction" | null
    >(null),
    [selected, setSelected] = useState<GridRow | null>(null),
    [date, setDate] = useState(todayInParaguay()),
    [km, setKm] = useState(""),
    [profile, setProfile] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const rows = useMemo(
    () =>
      [
        ...data.readings
          .filter((r) => r.vehicle_id === vehicleId)
          .map((r) => ({
            id: r.id,
            date: r.reading_date,
            type: "Lectura",
            km: r.odometer_km,
            responsible: null,
            author: r.created_by_name,
            status: r.voided_at ? "Corregida" : "Vigente",
          })),
        ...data.responsibilityEvents
          .filter((r) => r.vehicle_id === vehicleId)
          .map((r) => ({
            id: r.id,
            date: r.effective_date,
            type: "Responsable",
            km: null,
            responsible: r.responsible_name_snapshot,
            author: r.recorded_by_name,
            status: null,
          })),
      ].filter(
        (r) =>
          within(r.date, filters) &&
          matches(filters.search, r.type, r.responsible, r.author),
      ),
    [data, vehicleId, filters],
  );
  function open(mode: "reading" | "responsible") {
    setMode(mode);
    setDate(todayInParaguay());
    setKm("");
    setReason("");
    setError("");
    setSelected(null);
  }
  return (
    <>
      <FleetFilterBar
        secondaryActions={<div ref={setActionsTarget} />}
        filters={filters}
        onChange={onChange}
      >
        <PeriodFields filters={filters} onChange={onChange} />
      </FleetFilterBar>
      <ManagementTable
        label="Lecturas"
        actionsTarget={actionsTarget}
        showRowCount={false}
        fields={fields}
        rows={rows}
        render={{
          responsible: (r) => {
            const e = data.responsibilityEvents.find((e) => e.id === r.id);
            return (
              <span title={String(r.responsible ?? "")}>
                {fleetResponsibleName(
                  e?.responsible_name_snapshot,
                  e?.responsible_short_name_snapshot,
                ) || "—"}
              </span>
            );
          },
        }}
        actions={[
          {
            id: "reading",
            label: "Registrar lectura",
            onSelect: () => open("reading"),
          },
          {
            id: "responsible",
            label: "Cambiar responsable",
            onSelect: () => open("responsible"),
          },
        ]}
        onSelect={(r) => {
          if (r.type !== "Lectura" || r.status !== "Vigente") return;
          setSelected(r);
          setMode("correction");
          setDate(String(r.date));
          setKm(String(r.km));
          setReason("");
          setError("");
        }}
      />
      <ResponsiveDrawer
        open={!!mode}
        onOpenChange={(v) => {
          if (!v && !busy) setMode(null);
        }}
        title={
          mode === "responsible"
            ? "Cambiar responsable"
            : mode === "correction"
              ? "Corregir lectura"
              : "Registrar lectura"
        }
      >
        <ResponsiveDrawerHeader>
          <h2>
            {mode === "responsible"
              ? "Cambiar responsable"
              : mode === "correction"
                ? "Corregir lectura"
                : "Registrar lectura"}
          </h2>
        </ResponsiveDrawerHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              if (mode === "responsible")
                await fleetRpc("fleet_save_vehicle_responsible", {
                  p_id: vehicleId,
                  p_data: null,
                  p_responsible_id: profile || null,
                  p_source: profile
                    ? (data.responsibleCandidates.find((p) => p.id === profile)
                        ?.source ?? "profile")
                    : "none",
                  p_names: null,
                  p_surnames: null,
                  p_effective_date: date,
                  p_expected_assignment_id:
                    currentFleetResponsibility(
                      vehicleId,
                      data.responsibilityEvents,
                      todayInParaguay(),
                    )?.id ?? null,
                });
              else if (mode === "correction")
                await correctFleetReading({
                  vehicleId,
                  readingId: selected!.id,
                  readingDate: date,
                  odometerKm: Number(km),
                  reason,
                });
              else
                await addFleetReading({
                  vehicleId,
                  readingDate: date,
                  odometerKm: Number(km),
                });
              await onSaved();
              setMode(null);
            } catch (e) {
              setError(String((e as { message?: string }).message ?? e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <ResponsiveDrawerBody className="space-y-3">
            <fieldset disabled={busy} className="space-y-3">
              <label className="block text-[11px]">
                Fecha
                <Input
                  type="date"
                  required
                  max={todayInParaguay()}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              {mode === "responsible" ? (
                <label className="block text-[11px]">
                  Responsable
                  <select
                    className="h-9 w-full border rounded-md bg-background"
                    value={profile}
                    onChange={(e) => setProfile(e.target.value)}
                  >
                    <option value="">Sin responsable</option>
                    {data.responsibleCandidates.map((p) => (
                      <option key={p.id} value={p.id}>
                        {fleetResponsibleName(p.nombre, p.short_name)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="block text-[11px]">
                  Kilometraje
                  <Input
                    type="number"
                    required
                    min="0"
                    step="1"
                    value={km}
                    onChange={(e) => setKm(e.target.value)}
                  />
                </label>
              )}
              {mode === "correction" && (
                <label className="block text-[11px]">
                  Motivo
                  <Input
                    required
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
              )}
            </fieldset>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </ResponsiveDrawerBody>
          <ResponsiveDrawerFooter>
            <Button disabled={busy}>Guardar</Button>
          </ResponsiveDrawerFooter>
        </form>
      </ResponsiveDrawer>
    </>
  );
}
