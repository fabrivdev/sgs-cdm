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
  onClose,
  onSaved,
}: {
  vehicle?: ManagedVehicle;
  onClose: () => void;
  onSaved: () => void;
}) {
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
    ["notes", "Observaciones"],
  ];
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      await fleetRpc("fleet_save_vehicle", {
        p_id: vehicle?.id ?? null,
        p_data: data,
      });
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
            {fields.map(([k, label]) => (
              <div key={k}>
                <Label htmlFor={"vehicle-" + k}>{label}</Label>
                <Input
                  id={"vehicle-" + k}
                  required={["plate", "brand"].includes(k)}
                  type={k === "model_year" ? "number" : "text"}
                  min={k === "model_year" ? 1900 : undefined}
                  max={k === "model_year" ? 2100 : undefined}
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
