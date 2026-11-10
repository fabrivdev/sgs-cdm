import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { InvoiceActions } from "./InvoiceActions";
import type { Invoice } from "./managementModel";
const api = vi.hoisted(() => ({ rpc: vi.fn(), replace: vi.fn() }));
vi.mock("./managementApi", () => ({
  fleetRpc: api.rpc,
  replaceInvoiceFile: api.replace,
  loadInvoiceAudit: vi.fn().mockResolvedValue([]),
  invoiceUrl: vi.fn(),
}));
const invoice: Invoice = {
  id: "invoice",
  vehicle_id: null,
  plate: "TEST123",
  supplier: "Taller",
  supplier_tax_id: "80000001-1",
  invoice_number: "001-001-0000001",
  invoice_date: "2026-10-01",
  description: "Original",
  categories: ["Filtros"],
  amount: null,
  currency: null,
  storage_path: "file",
  filename: "factura.pdf",
  status: "uploaded",
  version: 3,
};
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
describe("Invoice correction and recovery", () => {
  it("sends the reason and expected version, preserving data after a concurrent correction", async () => {
    api.rpc.mockRejectedValue(Error("La factura cambió"));
    const saved = vi.fn();
    render(
      <InvoiceActions
        invoice={invoice}
        initialMode="edit"
        onSaved={saved}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Descripción del trabajo"), {
      target: { value: "Corregido" },
    });
    fireEvent.change(screen.getByLabelText("Motivo"), {
      target: { value: "Error de descripción" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Guardar" }).closest("form")!,
    );
    await screen.findByRole("alert");
    expect(api.rpc).toHaveBeenCalledWith(
      "fleet_correct_invoice",
      expect.objectContaining({
        p_version: 3,
        p_reason: "Error de descripción",
        p_data: expect.objectContaining({ description: "Corregido" }),
      }),
    );
    expect(screen.getByLabelText("Descripción del trabajo")).toHaveValue(
      "Corregido",
    );
    expect(saved).not.toHaveBeenCalled();
  });
  it("retries a replacement with the same request without discarding the chosen file", async () => {
    api.replace
      .mockRejectedValueOnce(Error("Sin conexión"))
      .mockResolvedValueOnce(undefined);
    const saved = vi.fn().mockResolvedValue(undefined);
    render(
      <InvoiceActions
        invoice={{ ...invoice, status: "pending" }}
        initialMode="file"
        onSaved={saved}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Archivo de factura"), {
      target: {
        files: [new File(["pdf"], "legible.pdf", { type: "application/pdf" })],
      },
    });
    fireEvent.change(screen.getByLabelText("Motivo"), {
      target: { value: "Completar archivo" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Guardar" }).closest("form")!,
    );
    await screen.findByRole("alert");
    fireEvent.submit(
      screen.getByRole("button", { name: "Guardar" }).closest("form")!,
    );
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(api.replace.mock.calls[0][0]).toBe(api.replace.mock.calls[1][0]);
  });
});
