import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { VehicleEditor } from "./VehicleEditor";
import type { ManagedVehicle } from "./managementModel";
import type { FleetResponsibilityEvent } from "./model";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("./managementApi", () => ({ fleetRpc: rpc }));
const vehicle = {
  id: "v",
  plate: "TEST123",
  brand: "Toyota",
  operational_status: "Operativa",
  lifecycle_status: "Activa",
} as ManagedVehicle;
const event = {
  id: "old",
  vehicle_id: "v",
  responsible_profile_id: "p1",
  responsible_name_snapshot: "Actual",
  effective_date: "2026-10-01",
  recorded_at: "2026-10-01T10:00:00Z",
} as FleetResponsibilityEvent;
const people = [
  { id: "p1", nombre: "Actual", sucursal: null, es_tecnico: false },
  { id: "p2", nombre: "Nuevo", sucursal: null, es_tecnico: false },
];
const close = vi.fn(),
  saved = vi.fn();
function mount(assignment = event) {
  render(
    <VehicleEditor
      vehicle={vehicle}
      responsibleCandidates={people}
      responsibilityEvents={[assignment]}
      onClose={close}
      onSaved={saved}
    />,
  );
}
function submit() {
  fireEvent.submit(
    screen.getByRole("button", { name: "Guardar" }).closest("form")!,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue("v");
});
afterEach(cleanup);
it("shows the current assignment and saves ordinary edits without appending history", async () => {
  mount();
  expect(screen.getByLabelText("Responsable")).toHaveValue("p1");
  expect(screen.getByLabelText("Fecha de asignación")).toHaveValue(
    "2026-10-01",
  );
  expect(screen.getByLabelText("Fecha de asignación")).toBeDisabled();
  submit();
  await waitFor(() => expect(saved).toHaveBeenCalled());
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith("fleet_save_vehicle", expect.anything());
});
it("sends the new assignment and vehicle together with the original event as conflict guard", async () => {
  mount();
  fireEvent.change(screen.getByLabelText("Responsable"), {
    target: { value: "p2" },
  });
  fireEvent.change(screen.getByLabelText("Fecha de asignación"), {
    target: { value: "2026-10-15" },
  });
  submit();
  await waitFor(() => expect(saved).toHaveBeenCalled());
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith(
    "fleet_save_vehicle_assignment",
    expect.objectContaining({
      p_id: "v",
      p_responsible_profile_id: "p2",
      p_effective_date: "2026-10-15",
      p_expected_assignment_id: "old",
    }),
  );
});
it("retains edits on failure and supports explicitly unassigning a vehicle", async () => {
  rpc.mockRejectedValue(Error("El responsable cambió"));
  mount();
  fireEvent.change(screen.getByLabelText("Responsable"), {
    target: { value: "" },
  });
  submit();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "El responsable cambió",
  );
  expect(close).not.toHaveBeenCalled();
  expect(saved).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledWith(
    "fleet_save_vehicle_assignment",
    expect.objectContaining({ p_responsible_profile_id: null }),
  );
});
it("preserves imported names without a linked profile or date when untouched", async () => {
  mount({
    ...event,
    responsible_profile_id: null,
    effective_date: null,
    responsible_name_snapshot: "Histórico",
  });
  expect(screen.getByRole("option", { name: "Histórico" })).toBeInTheDocument();
  submit();
  await waitFor(() => expect(saved).toHaveBeenCalled());
  expect(rpc).toHaveBeenCalledWith("fleet_save_vehicle", expect.anything());
});
it("rejects a date before the current assignment without sending a write", () => {
  mount();
  fireEvent.change(screen.getByLabelText("Responsable"), {
    target: { value: "p2" },
  });
  fireEvent.change(screen.getByLabelText("Fecha de asignación"), {
    target: { value: "2026-09-01" },
  });
  submit();
  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(rpc).not.toHaveBeenCalled();
});
