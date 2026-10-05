import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NuevoTrabajoDialog } from "./NuevoTrabajoDialog";

const api = vi.hoisted(() => ({
  readClients: vi.fn(), createClient: vi.fn(), insertClient: vi.fn(),
  createWork: vi.fn(), insertWork: vi.fn(), updateWork: vi.fn(), updateLegacy: vi.fn(),
  error: vi.fn(), success: vi.fn(), warning: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  if (table === "clientes") return {
    select: () => ({ order: () => ({ range: api.readClients }) }),
    insert: (payload: unknown) => { api.insertClient(payload); return { select: () => ({ single: api.createClient }) }; },
  };
  if (table === "trabajos") return {
    insert: (payload: unknown) => { api.insertWork(payload); return { select: () => ({ single: api.createWork }) }; },
    update: (payload: unknown) => ({ eq: (column: string, id: string) => api.updateWork(payload, column, id) }),
  };
  if (table === "servicios") return { update: (payload: unknown) => ({ eq: (column: string, id: string) => api.updateLegacy(payload, column, id) }) };
  throw new Error(`Unexpected table ${table}`);
} } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "user-demo" }, profile: { sucursal: "Santa Rita" } }) }));
vi.mock("sonner", () => ({ toast: { error: api.error, success: api.success, warning: api.warning } }));

// Datos sintéticos: los nombres de Campos ya forman parte del helper histórico.
const clients = [
  { id: "admin-demo", nombre: "GERENCIA DEMO", ruc: "80000001-0", cod_entidad: "4082", sucursal: null },
  { id: "campos-master-demo", nombre: "CAMPOS DEL MAÑANA S.A.", ruc: "80000001-0", cod_entidad: "1", sucursal: null },
  { id: "campos-legacy-demo", nombre: "Campos del Mañana S.A.", ruc: null, cod_entidad: null, sucursal: null },
  { id: "other-demo", nombre: "OTRO CLIENTE DEMO", ruc: "80000002-0", cod_entidad: "2", sucursal: null },
];
const work = {
  id: "work-demo", cliente_id: "campos-legacy-demo", marca: "CLAAS" as const,
  sucursal: "Santa Rita" as const, tipo_trabajo: "Visita de campo" as const,
  descripcion_problema: "Revisión original", prioridad: "media" as const, legacy_servicio_id: "service-demo",
};
const clientInput = () => screen.getByRole("combobox", { name: "Cliente" });
const description = () => screen.getByRole("textbox", { name: "Trabajo o problema a resolver" });
const typeClient = (value: string) => fireEvent.change(clientInput(), { target: { value } });
function mount(props: Partial<React.ComponentProps<typeof NuevoTrabajoDialog>> = {}) {
  const defaults = { open: true, clientes: clients, onOpenChange: vi.fn(), onSaved: vi.fn() };
  return { ...render(<NuevoTrabajoDialog {...defaults} {...props} />), defaults };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.readClients.mockResolvedValue({ data: clients, error: null });
  api.createClient.mockResolvedValue({ data: { id: "new-client-demo" }, error: null });
  api.createWork.mockResolvedValue({ data: { id: "new-work-demo" }, error: null });
  api.updateWork.mockResolvedValue({ error: null });
  api.updateLegacy.mockResolvedValue({ error: null });
});
afterEach(cleanup);

describe("NuevoTrabajoDialog client identity", () => {
  it("retains the actual stored client ID when editing unrelated fields, including the legacy sync", async () => {
    mount({ trabajo: work });
    expect(clientInput()).toHaveValue("Campos del Mañana S.A.");
    fireEvent.change(description(), { target: { value: "Revisión actualizada" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.updateWork).toHaveBeenCalledWith(expect.objectContaining({ cliente_id: work.cliente_id, descripcion_problema: "Revisión actualizada" }), "id", work.id));
    expect(api.updateLegacy).toHaveBeenCalledWith(expect.objectContaining({ cliente_id: work.cliente_id }), "id", "service-demo");
    expect(api.insertClient).not.toHaveBeenCalled();
  });

  it("retains an unavailable stored ID rather than clearing or replacing it", async () => {
    mount({ trabajo: { ...work, cliente_id: "unavailable-demo" } });
    expect(screen.getByText(/Se conserva su vínculo/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.updateWork).toHaveBeenCalledWith(expect.objectContaining({ cliente_id: "unavailable-demo" }), "id", work.id));
  });

  it("finds a hidden alias as one identity option and deliberately links its real master ID", async () => {
    mount({ trabajo: { ...work, cliente_id: "admin-demo" } });
    typeClient("campos");
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("CAMPOS DEL MAÑANA S.A.");
    expect(options[0]).toHaveTextContent("GERENCIA DEMO");
    fireEvent.click(options[0]);
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.updateWork).toHaveBeenCalledWith(expect.objectContaining({ cliente_id: "campos-master-demo" }), "id", work.id));
    expect(api.insertClient).not.toHaveBeenCalled();
  });

  it("resolves typed aliases with accents, punctuation and whitespace without inserting duplicates", async () => {
    mount();
    typeClient("  campos DEL manana s a  ");
    fireEvent.change(description(), { target: { value: "Revisión" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear trabajo" }));
    await waitFor(() => expect(api.insertWork).toHaveBeenCalledWith(expect.objectContaining({ cliente_id: "campos-master-demo" })));
    expect(api.insertClient).not.toHaveBeenCalled();
    expect(api.readClients).not.toHaveBeenCalled();
  });

  it("keeps a linked duplicate ID when its same name is retyped", async () => {
    mount({ trabajo: work });
    typeClient("campos del manana sa");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.updateWork).toHaveBeenCalledWith(expect.objectContaining({ cliente_id: work.cliente_id }), "id", work.id));
  });

  it("preserves unsaved fields and deliberate selection during catalog and work refresh", () => {
    const { rerender, defaults } = mount({ trabajo: work });
    fireEvent.change(description(), { target: { value: "Sin guardar" } });
    typeClient("OTRO CLIENTE DEMO");
    fireEvent.click(screen.getByRole("option"));
    rerender(<NuevoTrabajoDialog {...defaults} clientes={[...clients]} trabajo={{ ...work }} />);
    expect(description()).toHaveValue("Sin guardar");
    expect(clientInput()).toHaveValue("OTRO CLIENTE DEMO");
  });

  it("hydrates a delayed catalog without reverting edits or mismatching a refreshed work's new client", () => {
    const { rerender, defaults } = mount({ trabajo: work, clientes: [] });
    fireEvent.change(description(), { target: { value: "Edición pendiente" } });
    rerender(<NuevoTrabajoDialog {...defaults} trabajo={{ ...work, cliente_id: "other-demo" }} />);
    expect(clientInput()).toHaveValue("Campos del Mañana S.A.");
    expect(description()).toHaveValue("Edición pendiente");
  });

  it("cancels without writes, resets on reopen, and resets when switching to another work", () => {
    const { rerender, defaults } = mount({ trabajo: work });
    typeClient("Sin guardar");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(defaults.onOpenChange).toHaveBeenCalledWith(false);
    rerender(<NuevoTrabajoDialog {...defaults} trabajo={work} open={false} />);
    rerender(<NuevoTrabajoDialog {...defaults} trabajo={work} />);
    expect(clientInput()).toHaveValue("Campos del Mañana S.A.");
    rerender(<NuevoTrabajoDialog {...defaults} trabajo={{ ...work, id: "next-work", cliente_id: "other-demo" }} />);
    expect(clientInput()).toHaveValue("OTRO CLIENTE DEMO");
    expect(api.insertClient).not.toHaveBeenCalled();
    expect(api.updateWork).not.toHaveBeenCalled();
  });

  it("supports repeated keyboard selection and Escape dismisses suggestions before the drawer", () => {
    const { defaults } = mount();
    fireEvent.focus(clientInput());
    fireEvent.keyDown(clientInput(), { key: "Escape" });
    expect(clientInput()).toHaveAttribute("aria-expanded", "false");
    expect(defaults.onOpenChange).not.toHaveBeenCalled();
    fireEvent.keyDown(clientInput(), { key: "Escape" });
    expect(defaults.onOpenChange).toHaveBeenCalledWith(false);
    defaults.onOpenChange.mockClear();
    for (const query of ["campos", "otro", "campos"]) {
      typeClient(query);
      fireEvent.keyDown(clientInput(), { key: "ArrowDown" });
      fireEvent.keyDown(clientInput(), { key: "Enter" });
      expect(clientInput()).toHaveAttribute("aria-expanded", "false");
    }
    expect(clientInput()).toHaveValue("CAMPOS DEL MAÑANA S.A.");
    fireEvent.blur(clientInput());
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("searches the whole catalog before limiting displayed matches", () => {
    const many = Array.from({ length: 120 }, (_, i) => ({ id: `id-${i}`, nombre: `CLIENTE DEMO ${i}`, sucursal: null }));
    mount({ clientes: many });
    fireEvent.focus(clientInput());
    expect(screen.getAllByRole("option")).toHaveLength(100);
    typeClient("CLIENTE DEMO 119");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option")).toHaveTextContent("CLIENTE DEMO 119");
  });

  it("keeps the highlighted client's identity if catalog refresh changes result order", () => {
    const rows = [{ id: "b", nombre: "Cliente B", sucursal: null }, { id: "c", nombre: "Cliente C", sucursal: null }];
    const { defaults, rerender } = mount({ clientes: rows });
    typeClient("Cliente");
    fireEvent.keyDown(clientInput(), { key: "ArrowDown" });
    rerender(<NuevoTrabajoDialog {...defaults} clientes={[{ id: "a", nombre: "Cliente A", sucursal: null }, ...rows]} />);
    fireEvent.keyDown(clientInput(), { key: "Enter" });
    expect(clientInput()).toHaveValue("Cliente B");
  });

  it("revalidates a new name with paginated fresh data and reuses a match on a later page", async () => {
    mount();
    const firstPage = Array.from({ length: 1000 }, (_, i) => ({ id: `fresh-${i}`, nombre: `Fila ${i}`, sucursal: null }));
    api.readClients.mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({ data: [{ id: "fresh-existing", nombre: "Cliente recién agregado", sucursal: null }], error: null });
    typeClient("Cliente recién agregado");
    fireEvent.change(description(), { target: { value: "Revisión" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear trabajo" }));
    await waitFor(() => expect(api.insertWork).toHaveBeenCalledWith(expect.objectContaining({ cliente_id: "fresh-existing" })));
    expect(api.readClients.mock.calls).toEqual([[0, 999], [1000, 1999]]);
    expect(api.insertClient).not.toHaveBeenCalled();
  });

  it("does not create when revalidation fails", async () => {
    mount();
    api.readClients.mockResolvedValueOnce({ data: null, error: { message: "Catálogo no disponible" } });
    typeClient("Nombre nuevo");
    fireEvent.change(description(), { target: { value: "Revisión" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear trabajo" }));
    await waitFor(() => expect(api.error).toHaveBeenCalledWith("Catálogo no disponible"));
    expect(api.insertClient).not.toHaveBeenCalled();
    expect(api.insertWork).not.toHaveBeenCalled();
  });

  it("creates a truly new client once and reuses that ID after a work-save failure and retyping", async () => {
    mount();
    api.createWork.mockResolvedValueOnce({ data: null, error: { message: "Intentá de nuevo" } });
    typeClient("Nombre nuevo");
    fireEvent.change(description(), { target: { value: "Revisión" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear trabajo" }));
    await waitFor(() => expect(api.error).toHaveBeenCalledWith("Intentá de nuevo"));
    typeClient("otro texto"); typeClient("Nombre nuevo");
    fireEvent.click(screen.getByRole("button", { name: "Crear trabajo" }));
    await waitFor(() => expect(api.success).toHaveBeenCalled());
    expect(api.insertClient).toHaveBeenCalledTimes(1);
    expect(api.insertWork).toHaveBeenLastCalledWith(expect.objectContaining({ cliente_id: "new-client-demo" }));
  });

  it("blocks duplicate save clicks, edits and dismissal while saving", async () => {
    const pending = deferred<{ data: { id: string }; error: null }>();
    api.createWork.mockReturnValueOnce(pending.promise);
    const { defaults } = mount();
    typeClient("OTRO CLIENTE DEMO");
    fireEvent.change(description(), { target: { value: "Revisión" } });
    const save = screen.getByRole("button", { name: "Crear trabajo" });
    fireEvent.click(save); fireEvent.click(save);
    expect(api.insertWork).toHaveBeenCalledTimes(1);
    expect(clientInput()).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(defaults.onOpenChange).not.toHaveBeenCalled();
    await act(async () => pending.resolve({ data: { id: "created" }, error: null }));
    expect(defaults.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("ignores late catalog results after an external switch to a different work", async () => {
    const pending = deferred<{ data: typeof clients; error: null }>();
    api.readClients.mockReturnValueOnce(pending.promise);
    const { defaults, rerender } = mount();
    typeClient("Nombre nuevo");
    fireEvent.change(description(), { target: { value: "Revisión" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear trabajo" }));
    rerender(<NuevoTrabajoDialog {...defaults} trabajo={work} />);
    await act(async () => pending.resolve({ data: clients, error: null }));
    expect(clientInput()).toHaveValue("Campos del Mañana S.A.");
    expect(api.insertClient).not.toHaveBeenCalled();
    expect(api.insertWork).not.toHaveBeenCalled();
    expect(defaults.onOpenChange).not.toHaveBeenCalled();
  });

  it("retains an already-created client for reuse but does not change or save a newer dialog session", async () => {
    const pending = deferred<{ data: { id: string }; error: null }>();
    api.createClient.mockReturnValueOnce(pending.promise);
    const { defaults, rerender } = mount();
    typeClient("Nuevo cliente lento");
    fireEvent.change(description(), { target: { value: "Revisión" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear trabajo" }));
    await waitFor(() => expect(api.insertClient).toHaveBeenCalledTimes(1));
    rerender(<NuevoTrabajoDialog {...defaults} trabajo={work} />);
    await act(async () => pending.resolve({ data: { id: "slow-client-demo" }, error: null }));
    expect(clientInput()).toHaveValue("Campos del Mañana S.A.");
    expect(api.insertWork).not.toHaveBeenCalled();
    expect(api.updateWork).not.toHaveBeenCalled();
    expect(defaults.onOpenChange).not.toHaveBeenCalled();
    typeClient("Nuevo cliente lento");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.updateWork).toHaveBeenCalledWith(expect.objectContaining({ cliente_id: "slow-client-demo" }), "id", work.id));
    expect(api.insertClient).toHaveBeenCalledTimes(1);
  });

  it("does not close or overwrite a new dialog when the previous work save finishes late", async () => {
    const pending = deferred<{ error: null }>();
    api.updateWork.mockReturnValueOnce(pending.promise);
    const { defaults, rerender } = mount({ trabajo: work });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    rerender(<NuevoTrabajoDialog {...defaults} trabajo={{ ...work, id: "next-work", cliente_id: "other-demo" }} />);
    await act(async () => pending.resolve({ error: null }));
    expect(clientInput()).toHaveValue("OTRO CLIENTE DEMO");
    expect(defaults.onOpenChange).not.toHaveBeenCalled();
    expect(defaults.onSaved).toHaveBeenCalledWith(work.id);
  });

  it("requires an explicit choice for equal names with conflicting RUCs", async () => {
    mount({ clientes: [
      { id: "conflict-a", nombre: "Nombre ambiguo", ruc: "80000011-0", sucursal: null },
      { id: "conflict-b", nombre: "Nombre ambiguo", ruc: "80000012-0", sucursal: null },
    ] });
    typeClient("Nombre ambiguo");
    expect(screen.getAllByRole("option")).toHaveLength(2);
    fireEvent.change(description(), { target: { value: "Revisión" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear trabajo" }));
    await waitFor(() => expect(api.error).toHaveBeenCalledWith(expect.stringContaining("distintas identidades")));
    expect(api.insertWork).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("option", { name: /80000012-0/ }));
    fireEvent.click(screen.getByRole("button", { name: "Crear trabajo" }));
    await waitFor(() => expect(api.insertWork).toHaveBeenCalledWith(expect.objectContaining({ cliente_id: "conflict-b" })));
    expect(api.insertClient).not.toHaveBeenCalled();
  });

  it("does not turn a typed existing RUC into a new client name", async () => {
    mount();
    typeClient("80000002-0");
    fireEvent.change(description(), { target: { value: "Revisión" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear trabajo" }));
    await waitFor(() => expect(api.insertWork).toHaveBeenCalledWith(expect.objectContaining({ cliente_id: "other-demo" })));
    expect(api.insertClient).not.toHaveBeenCalled();
  });

  it("explicitly clearing an existing client saves null", async () => {
    mount({ trabajo: work }); typeClient("");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.updateWork).toHaveBeenCalledWith(expect.objectContaining({ cliente_id: null }), "id", work.id));
  });
});
