import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FleetVehicle } from "@/features/fleet/model";
import type { FleetPeriodReading } from "@/features/fleet/period";
import { FleetVehicleList, ReadingDialog, VehicleDetail, VehicleDialog } from "./Flota";

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
const reading: FleetPeriodReading = {
  id: "reading-one",
  vehicle_id: vehicle.id,
  reading_date: "2026-09-15",
  odometer_km: 51256,
  reading_kind: "weekly",
  correction_of: null,
  created_at: "2026-09-15T10:00:00.000Z",
  created_by: "fabrizio",
  created_by_name: "Fabrizio",
  voided_at: null,
  voided_by: null,
  voided_by_name: null,
  void_reason: null,
  previousReadingDate: "2026-09-08",
  elapsedDays: 7,
  travelledKm: 505,
  countedKm: 505,
  coverage: "exact",
  hasWeeklyGap: false,
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
  it("mantiene las acciones del detalle dentro de objetivos móviles de 44 px", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 320 });
    const onBack = vi.fn();
    const onCorrect = vi.fn();
    const onEditResponsible = vi.fn();
    render(<VehicleDetail vehicle={vehicle} latest={reading} status={{ label: "Al día", overdue: false }} comparison={undefined} responsibility={null} responsibilityHistory={[]} rows={[reading]} auditRows={[]} onBack={onBack} onCorrect={onCorrect} onEditResponsible={onEditResponsible} />);

    const back = screen.getByRole("button", { name: "Volver a la flota" });
    const responsible = screen.getByRole("button", { name: "Cambiar responsable" });
    const corrections = screen.getAllByRole("button", { name: "Corregir lectura del 15 sept. 2026" });
    const correct = corrections.find((button) => button.classList.contains("h-11"));
    const desktopCorrect = corrections.find((button) => button.classList.contains("h-8"));
    expect(back).toHaveClass("max-sm:min-h-11");
    expect(responsible).toHaveClass("max-sm:h-11", "max-sm:w-11", "max-sm:p-0");
    expect(within(responsible).getByText("Cambiar responsable")).toHaveClass("max-sm:sr-only");
    expect(correct).toHaveClass("h-11", "w-11");
    expect(desktopCorrect).toHaveClass("h-8", "w-8");

    fireEvent.click(back);
    fireEvent.click(responsible);
    fireEvent.click(correct!);
    expect(onBack).toHaveBeenCalledOnce();
    expect(onEditResponsible).toHaveBeenCalledOnce();
    expect(onCorrect).toHaveBeenCalledOnce();
  });
  it("mantiene la flota como lista compacta y muestra Sin lectura una sola vez", () => {
    const open = vi.fn();
    render(<FleetVehicleList vehicles={[vehicle]} activeVehicleCount={1} readings={[]} comparisons={[]} responsibilityByVehicle={new Map()} today={TODAY} onOpen={open} onClearFilters={vi.fn()} />);
    const row = screen.getByRole("button", { name: /ISUZU/ });
    expect(row).toHaveClass("min-h-14", "py-2");
    expect(within(row).getAllByText("Sin lectura")).toHaveLength(1);
    expect(row).toHaveTextContent("AAON 294");
    expect(row).toHaveTextContent("Km período");
    fireEvent.click(row);
    expect(open).toHaveBeenCalledExactlyOnceWith(vehicle.id);
  });
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
