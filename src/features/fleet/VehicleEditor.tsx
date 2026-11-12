import { ResponsiblePicker } from "./ResponsiblePicker";
import {
  currentFleetResponsibility,
  normalizePlate,
  type FleetResponsibleCandidate,
  type FleetResponsibilityEvent,
} from "./model";
import { todayInParaguay } from "./period";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ResponsiveDrawer,
  ResponsiveDrawerHeader,
  ResponsiveDrawerBody,
  ResponsiveDrawerFooter,
} from "@/components/ui/responsive-drawer";
import { fleetRpc } from "./managementApi";
import {
  operationalStates,
  lifecycleStates,
  type ManagedVehicle,
} from "./managementModel";
export function VehicleEditor({
  vehicle,
  responsibleCandidates = [],
  responsibilityEvents = [],
  onClose,
  onSaved,
}: {
  vehicle?: ManagedVehicle;
  responsibleCandidates?: FleetResponsibleCandidate[];
  responsibilityEvents?: FleetResponsibilityEvent[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [originalAssignment] = useState(() =>
    vehicle
      ? currentFleetResponsibility(
          vehicle.id,
          responsibilityEvents,
          todayInParaguay(),
        )
      : null,
  );
  const originalResponsible =
    originalAssignment?.responsible_contact_id ??
    originalAssignment?.responsible_profile_id ??
    (originalAssignment?.responsible_name_snapshot ? "__current__" : "");
  const [responsibleId, setResponsibleId] = useState(originalResponsible);
  const [newNames, setNewNames] = useState("");
  const [newSurnames, setNewSurnames] = useState("");
  const [unselectedQuery, setUnselectedQuery] = useState(false);
  const [assignmentDate, setAssignmentDate] = useState(
    originalAssignment?.effective_date ?? "",
  );
  const assignmentChanged = !!vehicle && responsibleId !== originalResponsible;
  const [data, setData] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      [
        "plate",
        "brand",
        "model",
        "model_year",
        "chassis",
        "department",
        "branch",
        "color",
        "vehicle_type",
        "fuel_provider",
        "maintenance_interval_km",
        "notes",
        "operational_status",
        "lifecycle_status",
      ].map((k) => [
        k,
        String(
          vehicle?.[k as keyof ManagedVehicle] ??
            (k === "operational_status"
              ? "Sin informar"
              : k === "lifecycle_status"
                ? "Activa"
                : ""),
        ),
      ]),
    ),
  );
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const fields = [
    ["plate", "Chapa"],
    ["brand", "Marca"],
    ["model", "Modelo"],
    ["model_year", "Año"],
    ["chassis", "Chasis"],
    ["department", "Departamento"],
    ["branch", "Sucursal"],
    ["color", "Color"],
    ["vehicle_type", "Tipo"],
    ["fuel_provider", "Proveedor de combustible"],
    ["maintenance_interval_km", "Intervalo de mantenimiento (km)"],
    ["notes", "Observaciones"],
  ];
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (unselectedQuery) {
      setError("Seleccioná un responsable o Agregar nuevo responsable.");
      return;
    }
    if (
      responsibleId === "__new__" &&
      (!newNames.trim() || !newSurnames.trim())
    ) {
      setError("Completá nombres y apellidos del responsable.");
      return;
    }
    if (
      assignmentChanged &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(assignmentDate) ||
        Number.isNaN(Date.parse(assignmentDate)) ||
        new Date(assignmentDate).toISOString().slice(0, 10) !==
          assignmentDate ||
        assignmentDate > todayInParaguay() ||
        (originalAssignment?.effective_date &&
          assignmentDate < originalAssignment.effective_date))
    ) {
      setError(
        "Ingresá una fecha de asignación válida, no anterior a la actual ni posterior a hoy.",
      );
      return;
    }
    if (
      data.maintenance_interval_km &&
      (!Number.isInteger(Number(data.maintenance_interval_km)) ||
        Number(data.maintenance_interval_km) <= 0 ||
        Number(data.maintenance_interval_km) > 2147483647)
    ) {
      setError("El intervalo debe ser un número entero mayor que cero");
      return;
    }
    setPending(true);
    setError("");
    try {
      if (assignmentChanged) {
        await fleetRpc("fleet_save_vehicle_responsible", {
          p_id: vehicle!.id,
          p_data: { ...data, plate: normalizePlate(data.plate) },
          p_responsible_id:
            responsibleId === "__new__" ? null : responsibleId || null,
          p_source:
            responsibleId === "__new__"
              ? "new"
              : responsibleId
                ? (responsibleCandidates.find((p) => p.id === responsibleId)
                    ?.source ?? "profile")
                : "none",
          p_names: responsibleId === "__new__" ? newNames.trim() : null,
          p_surnames: responsibleId === "__new__" ? newSurnames.trim() : null,
          p_effective_date: assignmentDate,
          p_expected_assignment_id: originalAssignment?.id ?? null,
        });
      } else {
        await fleetRpc("fleet_save_vehicle", {
          p_id: vehicle?.id ?? null,
          p_data: { ...data, plate: normalizePlate(data.plate) },
        });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(String((e as { message?: string }).message ?? e));
    } finally {
      setPending(false);
    }
  }
  return (
    <ResponsiveDrawer
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
      title={vehicle ? "Editar vehículo" : "Nuevo vehículo"}
    >
      <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
        <ResponsiveDrawerHeader>
          <h2 className="font-semibold">
            {vehicle ? "Editar vehículo" : "Nuevo vehículo"}
          </h2>
        </ResponsiveDrawerHeader>
        <ResponsiveDrawerBody>
          <fieldset disabled={pending} className="grid gap-3 sm:grid-cols-2">
            {vehicle && (
              <>
                <ResponsiblePicker
                  value={responsibleId}
                  candidates={
                    originalResponsible &&
                    !responsibleCandidates.some(
                      (p) => p.id === originalResponsible,
                    )
                      ? [
                          ...responsibleCandidates,
                          {
                            id: originalResponsible,
                            nombre:
                              originalAssignment?.responsible_name_snapshot ??
                              "Responsable actual",
                            short_name:
                              originalAssignment?.responsible_short_name_snapshot,
                            sucursal: null,
                            es_tecnico: false,
                          },
                        ]
                      : responsibleCandidates
                  }
                  newNames={newNames}
                  newSurnames={newSurnames}
                  onQueryState={setUnselectedQuery}
                  onChange={(next) => {
                    setResponsibleId(next);
                    setAssignmentDate(
                      next === originalResponsible
                        ? (originalAssignment?.effective_date ?? "")
                        : todayInParaguay(),
                    );
                    setError("");
                  }}
                />
                <div>
                  <Label htmlFor="vehicle-assignment-date">
                    Fecha de asignación
                  </Label>
                  <Input
                    id="vehicle-assignment-date"
                    type="date"
                    value={assignmentDate}
                    required={assignmentChanged}
                    disabled={!assignmentChanged}
                    min={originalAssignment?.effective_date ?? undefined}
                    max={todayInParaguay()}
                    onChange={(e) => setAssignmentDate(e.target.value)}
                  />
                </div>
                {responsibleId === "__new__" && (
                  <div className="grid grid-cols-2 gap-3 sm:col-span-2">
                    <div>
                      <Label htmlFor="responsible-names">Nombres</Label>
                      <Input
                        id="responsible-names"
                        required
                        maxLength={100}
                        value={newNames}
                        onChange={(e) => setNewNames(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="responsible-surnames">Apellidos</Label>
                      <Input
                        id="responsible-surnames"
                        required
                        maxLength={100}
                        value={newSurnames}
                        onChange={(e) => setNewSurnames(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
            {fields.map(([k, label]) => (
              <div key={k}>
                <Label htmlFor={"vehicle-" + k}>{label}</Label>
                <Input
                  id={"vehicle-" + k}
                  required={["plate", "brand"].includes(k)}
                  type={
                    ["model_year", "maintenance_interval_km"].includes(k)
                      ? "number"
                      : "text"
                  }
                  min={
                    k === "model_year"
                      ? 1900
                      : k === "maintenance_interval_km"
                        ? 1
                        : undefined
                  }
                  max={
                    k === "model_year"
                      ? 2100
                      : k === "maintenance_interval_km"
                        ? 2147483647
                        : undefined
                  }
                  value={data[k]}
                  onChange={(e) => setData({ ...data, [k]: e.target.value })}
                />
              </div>
            ))}
            {(
              [
                ["operational_status", "Estado operativo", operationalStates],
                ["lifecycle_status", "Situación patrimonial", lifecycleStates],
              ] as const
            ).map(([k, label, options]) => (
              <div key={k}>
                <Label htmlFor={k}>{label}</Label>
                <select
                  id={k}
                  className="h-10 w-full rounded-md border bg-background px-2"
                  value={data[k]}
                  onChange={(e) => setData({ ...data, [k]: e.target.value })}
                >
                  {options.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
            ))}
            {vehicle &&
              data.plate.replace(/[^a-z0-9]/gi, "").toUpperCase() !==
                vehicle.plate.replace(/[^a-z0-9]/gi, "").toUpperCase() && (
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="plate-change-type">
                    Tipo de cambio de chapa
                  </Label>
                  <select
                    id="plate-change-type"
                    required
                    className="h-10 w-full rounded-md border bg-background px-2"
                    value={data.plate_change_type ?? ""}
                    onChange={(e) =>
                      setData({ ...data, plate_change_type: e.target.value })
                    }
                  >
                    <option value="">Seleccionar</option>
                    <option value="change">Cambio real de chapa</option>
                    <option value="correction">Corrección de escritura</option>
                  </select>
                  <Label htmlFor="plate-change-reason">Motivo del cambio</Label>
                  <Input
                    id="plate-change-reason"
                    required
                    value={data.plate_change_reason ?? ""}
                    onChange={(e) =>
                      setData({ ...data, plate_change_reason: e.target.value })
                    }
                  />
                </div>
              )}
          </fieldset>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
        </ResponsiveDrawerBody>
        <ResponsiveDrawerFooter>
          <Button
            variant="outline"
            type="button"
            disabled={pending}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button disabled={pending}>Guardar</Button>
        </ResponsiveDrawerFooter>
      </form>
    </ResponsiveDrawer>
  );
}
