import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FleetVehicle } from "@/features/fleet/model";
import { ReadingDialog, VehicleDialog } from "./Flota";

const TODAY = "2026-10-06";
const vehicle: FleetVehicle = {
  id: "vehicle-one",
  brand: "ISUZU",
  model: "D-Max",
  plate: "AAON 294",
  plate_normalized: "AAON294",
  active: true,
  created_at: "2026-10-06T10:00:00.000Z",
  created_by: "fabrizio",
  created_by_name: "Fabrizio",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function VehicleHarness({ onSubmit = async () => true }: {
  onSubmit?: React.ComponentProps<typeof VehicleDialog>["onSubmit"];
}) {
  const [open, setOpen] = useState(true);
  const submit: React.ComponentProps<typeof VehicleDialog>["onSubmit"] = async (values) => {
    const saved = await onSubmit(values);
    if (saved) setOpen(false);
    return saved;
  };
  return <>
    <button type="button" onClick={() => setOpen(true)}>Abrir vehículo</button>
    <VehicleDialog open={open} pending={false} today={TODAY} onOpenChange={setOpen} onSubmit={submit} />
  </>;
}

function ReadingHarness({ onSubmit = async () => true }: {
  onSubmit?: React.ComponentProps<typeof ReadingDialog>["onSubmit"];
}) {
  const [open, setOpen] = useState(true);
  const submit: React.ComponentProps<typeof ReadingDialog>["onSubmit"] = async (values) => {
    const saved = await onSubmit(values);
    if (saved) setOpen(false);
    return saved;
  };
  return <>
    <button type="button" onClick={() => setOpen(true)}>Abrir odómetro</button>
    <ReadingDialog open={open} pending={false} today={TODAY} vehicle={vehicle} readings={[]} onOpenChange={setOpen} onSubmit={submit} />
  </>;
}

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1024 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("formularios laterales de Flota", () => {
  it("usa el drawer lateral nativo con encabezado, cuerpo desplazable, pie y foco inicial", async () => {
    render(<VehicleHarness />);

    const panel = screen.getByRole("dialog");
    await waitFor(() => expect(panel).toHaveClass("right-0", "h-full", "sm:max-w-md"));
    expect(screen.getByRole("heading", { name: "Nuevo vehículo" })).toBeInTheDocument();
    expect(panel.querySelector(".overflow-y-auto")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar" })).toHaveAttribute("form", "fleet-vehicle-form");
    expect(screen.getByLabelText("Marca")).toBeInTheDocument();
    expect(screen.getByLabelText("Chapa")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Marca")).toHaveFocus());
  });

  it("conserva el borrador al cerrar o usar Escape y lo descarta solo al cancelar", async () => {
    render(<VehicleHarness />);
    fireEvent.change(screen.getByLabelText("Marca"), { target: { value: "Mitsubishi" } });
    fireEvent.change(screen.getByLabelText("Chapa"), { target: { value: "abc 123" } });

    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Abrir vehículo" }));
    expect(screen.getByLabelText("Marca")).toHaveValue("Mitsubishi");
    expect(screen.getByLabelText("Chapa")).toHaveValue("ABC 123");

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Abrir vehículo" }));
    expect(screen.getByLabelText("Marca")).toHaveValue("Mitsubishi");

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir vehículo" }));
    expect(screen.getByLabelText("Marca")).toHaveValue("");
    expect(screen.getByLabelText("Chapa")).toHaveValue("");
  });

  it("mantiene los valores si falla el alta", async () => {
    const onSubmit = vi.fn(async () => false);
    render(<VehicleHarness onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Marca"), { target: { value: "Maxus" } });
    fireEvent.change(screen.getByLabelText("Chapa"), { target: { value: "aaa 111" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Marca")).toHaveValue("Maxus");
    expect(screen.getByLabelText("Chapa")).toHaveValue("AAA 111");
  });

  it("bloquea doble envío, edición y cierre mientras guarda", async () => {
    const pending = deferred<boolean>();
    const onSubmit = vi.fn(() => pending.promise);
    render(<VehicleHarness onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Marca"), { target: { value: "Isuzu" } });
    fireEvent.change(screen.getByLabelText("Chapa"), { target: { value: "bbb 222" } });
    const save = screen.getByRole("button", { name: "Agregar" });

    fireEvent.click(save);
    fireEvent.click(save);
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Marca")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await act(async () => pending.resolve(true));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Abrir vehículo" }));
    expect(screen.getByLabelText("Marca")).toHaveValue("");
    expect(screen.getByLabelText("Chapa")).toHaveValue("");
  });

  it("usa el bottom sheet nativo en móvil y conserva o descarta la lectura según la acción", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 390 });
    render(<ReadingHarness />);

    const panel = screen.getByRole("dialog");
    await waitFor(() => expect(panel).toHaveClass("bottom-0", "h-[92dvh]", "rounded-t-2xl"));
    expect(screen.getByRole("heading", { name: "Registrar lectura inicial" })).toBeInTheDocument();
    expect(screen.getByLabelText("Fecha")).toHaveValue(TODAY);
    await waitFor(() => expect(screen.getByLabelText("Fecha")).toHaveFocus());
    fireEvent.change(screen.getByLabelText("Odómetro"), { target: { value: "12500" } });

    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Abrir odómetro" }));
    expect(screen.getByLabelText("Odómetro")).toHaveValue(12500);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir odómetro" }));
    expect(screen.getByLabelText("Fecha")).toHaveValue(TODAY);
    expect(screen.getByLabelText("Odómetro")).toHaveValue(null);
  });

  it("preserva una lectura fallida y limpia el borrador al cambiar de vehículo", async () => {
    const onSubmit = vi.fn(async () => false);
    const onOpenChange = vi.fn();
    const props = { open: true, pending: false, today: TODAY, readings: [], onOpenChange, onSubmit };
    const { rerender } = render(<ReadingDialog {...props} vehicle={vehicle} />);
    fireEvent.change(screen.getByLabelText("Odómetro"), { target: { value: "18000" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("Odómetro")).toHaveValue(18000);
    rerender(<ReadingDialog {...props} vehicle={{ ...vehicle, id: "vehicle-two", plate: "CCC 333", plate_normalized: "CCC333" }} />);
    expect(screen.getByLabelText("Odómetro")).toHaveValue(null);
    expect(screen.getByText("ISUZU · CCC 333")).toBeInTheDocument();
  });

  it("bloquea doble envío y cierre del odómetro, y limpia después de guardar", async () => {
    const pending = deferred<boolean>();
    const onSubmit = vi.fn(() => pending.promise);
    render(<ReadingHarness onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Odómetro"), { target: { value: "22500" } });
    const save = screen.getByRole("button", { name: "Registrar" });

    fireEvent.click(save);
    fireEvent.click(save);
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Odómetro")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await act(async () => pending.resolve(true));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Abrir odómetro" }));
    expect(screen.getByLabelText("Fecha")).toHaveValue(TODAY);
    expect(screen.getByLabelText("Odómetro")).toHaveValue(null);
  });
});
