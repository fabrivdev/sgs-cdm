import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { ModeloMaquinaSelect } from "./ModeloMaquinaSelect";

vi.mock("./MachineCatalogManager", () => ({ MachineCatalogManager: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const query = { select: () => query, eq: () => query, order: async () => ({ data: [{ id: "1", nombre: "LEEB" }], error: null }) };
  return query;
} } }));
afterEach(cleanup);

it("keeps the editable input focused when typing through an existing model name", async () => {
  function Form() {
    const [value, setValue] = useState("MODELO LEIDO");
    return <ModeloMaquinaSelect marca="HORSCH" subgrupo="PULVERIZADORAS" value={value} onValueChange={setValue} />;
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><Form /></QueryClientProvider>);
  const input = await screen.findByPlaceholderText("Escribí el nombre del nuevo modelo");
  await waitFor(() => expect(client.getQueryData(["parque-modelos-catalogo", "HORSCH", "PULVERIZADORAS"])).toBeTruthy());
  fireEvent.change(input, { target: { value: "leeb" } });
  expect(screen.getByRole("textbox")).toBe(input);
  expect(input).toHaveValue("LEEB");
  fireEvent.change(input, { target: { value: "leeb 5.280" } });
  expect(input).toHaveValue("LEEB 5.280");
  expect(input).toHaveFocus();
});
