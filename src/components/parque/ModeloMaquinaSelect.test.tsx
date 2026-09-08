import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { ModeloMaquinaSelect } from "./ModeloMaquinaSelect";
import type { MachineCatalogModel } from "@/lib/machineOrderValidation";

// Native select adapter tests the selection contract without Radix's pointer APIs.
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, disabled, children }: { value: string; onValueChange: (v: string) => void; disabled: boolean; children: React.ReactNode }) =>
    <select aria-label="Modelo" value={value} disabled={disabled} onChange={e => onValueChange(e.target.value)}><option value="">Seleccionar modelo</option>{children}</select>,
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value, disabled }: { children: React.ReactNode; value: string; disabled?: boolean }) => <option value={value} disabled={disabled}>{children}</option>,
}));
vi.mock("./MachineCatalogManager", () => ({ MachineCatalogManager: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const rows = table === "maquinaria_marcas_catalogo" ? [{ nombre: "HORSCH", activa: true }, { nombre: "JACTO", activa: true }] :
    table === "parque_modelos_alias" ? [] : [
      { id: "1", nombre: "LEEB", marca_nombre: "HORSCH", subgrupo: "PULVERIZADORAS", activo: true },
      { id: "2", nombre: "MAESTRO", marca_nombre: "HORSCH", subgrupo: "SEMBRADORAS", activo: true },
      { id: "3", nombre: "STAR 2500", marca_nombre: "JACTO", subgrupo: "PULVERIZADORAS", activo: true },
    ];
  const query = { select: () => query, order: () => query, range: async () => ({ data: rows, error: null }) };
  return query;
} } }));
afterEach(cleanup);
function wrapper(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}
it("keeps the editable input focused when typing through an existing model name", async () => {
  function Form() {
    const [value, setValue] = useState("MODELO LEIDO");
    return <ModeloMaquinaSelect marca="HORSCH" subgrupo="PULVERIZADORAS" value={value} onValueChange={setValue} />;
  }
  wrapper(<Form />);
  const input = await screen.findByPlaceholderText("Escribí el nombre del nuevo modelo");
  fireEvent.change(input, { target: { value: "leeb" } });
  expect(screen.getByRole("textbox")).toBe(input);
  expect(input).toHaveValue("LEEB");
  fireEvent.change(input, { target: { value: "leeb 5.280" } });
  expect(input).toHaveValue("LEEB 5.280");
  expect(input).toHaveFocus();
});
it("offers LEEB from OTRO and updates type with the catalog selection", async () => {
  function Form() {
    const [line, setLine] = useState({ modelo: "", subgrupo: "OTRO" });
    return <><output>{line.subgrupo}</output><ModeloMaquinaSelect marca="HORSCH" subgrupo={line.subgrupo} value={line.modelo}
      onValueChange={(modelo, model) => setLine({ modelo, subgrupo: model?.subgrupo ?? line.subgrupo })} /></>;
  }
  wrapper(<Form />);
  await screen.findByRole("option", { name: "LEEB · PULVERIZADORAS" });
  expect(screen.queryByRole("option", { name: /STAR/ })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "1" } });
  expect(screen.getByRole("status")).toHaveTextContent("PULVERIZADORAS");
});
it("still offers other brands' models in orders", async () => {
  const onChange = vi.fn<(name: string, model?: MachineCatalogModel) => void>();
  wrapper(<ModeloMaquinaSelect marca="JACTO" subgrupo="OTRO" onValueChange={onChange} />);
  await screen.findByRole("option", { name: "STAR 2500 · PULVERIZADORAS" });
  expect(screen.queryByRole("option", { name: /LEEB/ })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "3" } });
  expect(onChange).toHaveBeenCalledWith("STAR 2500", expect.objectContaining({ id: "3", marca_nombre: "JACTO", subgrupo: "PULVERIZADORAS" }));
});
