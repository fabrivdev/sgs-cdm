import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportUnitFields } from "./ImportUnitFields";
import { importUnitForm } from "@/lib/machineImportValues";

afterEach(cleanup);
describe("Editores de una unidad de importación", () => {
  const props = () => ({ form: importUnitForm({}), onChange: vi.fn(), onSave: vi.fn(), onCancel: vi.fn(), saving: false });
  it("permite editar valor OC y embarque sin mostrar el costo definitivo", () => {
    const p = props();
    render(<ImportUnitFields {...p} section="purchase" />);
    expect(screen.getByLabelText("Embarque estimado")).toHaveAttribute("type", "date");
    fireEvent.change(screen.getByLabelText("Valor OC de esta unidad"), { target: { value: "100" } });
    expect(p.onChange).toHaveBeenCalledWith({ ...p.form, valor_oc: "100" });
    expect(screen.queryByLabelText("Costo definitivo con IVA")).not.toBeInTheDocument();
  });
  it("la factura tiene su propio importe y moneda, no costo OC ni stock", () => {
    render(<ImportUnitFields {...props()} section="invoice" />);
    expect(screen.getByLabelText("Valor facturado de esta unidad")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Moneda factura" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Valor OC de esta unidad")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Costo definitivo con IVA")).not.toBeInTheDocument();
  });
  it("identificación permite corregir llave y chasis", () => {
    render(<ImportUnitFields {...props()} section="unit" />);
    expect(screen.getByLabelText("Llave interna de esta unidad")).toBeInTheDocument();
    expect(screen.getByLabelText("Chasis")).toBeInTheDocument();
  });
  it("cancelar no guarda y se bloquean envíos mientras se guarda", () => {
    const p = props();
    render(<ImportUnitFields {...p} section="stock" saving />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(p.onCancel).toHaveBeenCalledOnce();
    expect(p.onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Guardar unidad" })).toBeDisabled();
  });
});
