import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { SupplierFields } from "./SupplierFields";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("./managementApi", () => ({ fleetRpc: rpc }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function Form() {
  const [value, setValue] = useState({ ruc: "", name: "" });
  return (
    <SupplierFields
      {...value}
      onChange={(ruc, name) => setValue({ ruc, name })}
    />
  );
}
it("suggests by typed RUC, selects by keyboard, and clears the old name when RUC changes", async () => {
  rpc.mockResolvedValue([{ ruc: "800001-1", razon_social: "Proveedor DEMO" }]);
  render(<Form />);
  const input = screen.getByRole("combobox");
  fireEvent.change(input, { target: { value: "800" } });
  await screen.findByRole("option", { name: /Proveedor DEMO/ });
  expect(rpc).toHaveBeenCalledWith("fleet_search_suppliers", { p_ruc: "800" });
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(screen.getByLabelText("Proveedor")).toHaveValue("Proveedor DEMO");
  expect(screen.getByLabelText("Proveedor")).toHaveAttribute("readonly");
  fireEvent.change(input, { target: { value: "900" } });
  expect(screen.getByLabelText("Proveedor")).toHaveValue("");
});
it("shows no match without fabricating a supplier", async () => {
  rpc.mockResolvedValue([]);
  render(<Form />);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "999" } });
  await screen.findByText("Sin coincidencias en el maestro");
  expect(screen.getByLabelText("Proveedor")).toHaveValue("");
});

it("allows a manual name after an exact miss even when prefix suggestions exist and focus leaves RUC", async () => {
  rpc.mockImplementation((method: string) =>
    Promise.resolve(
      method === "fleet_supplier_identity"
        ? []
        : [{ ruc: "999123-4", razon_social: "Otro proveedor" }],
    ),
  );
  render(<Form />);
  const input = screen.getByRole("combobox");
  fireEvent.change(input, { target: { value: "999" } });
  fireEvent.blur(input);
  const name = screen.getByLabelText("Proveedor");
  await waitFor(() => expect(name).not.toHaveAttribute("readonly"));
  fireEvent.change(name, { target: { value: "Taller fuera del maestro" } });
  expect(name).toHaveValue("Taller fuera del maestro");
  fireEvent.change(input, { target: { value: "888" } });
  expect(name).toHaveValue("");
  expect(name).toHaveAttribute("readonly");
});
it("does not treat lookup failure as an absent supplier", async () => {
  rpc.mockRejectedValue(Error("offline"));
  render(<Form />);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "999" } });
  await screen.findByText(/No se pudo consultar/);
  expect(screen.getByLabelText("Proveedor")).toHaveAttribute("readonly");
});
