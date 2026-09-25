import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Admin from "./Admin";

const { createPerson, canManage, success, errorToast, invalidateQueries, goalRead, goalSave, parametersAccess } = vi.hoisted(() => ({ createPerson: vi.fn(), canManage: { value: true }, success: vi.fn(), errorToast: vi.fn(), invalidateQueries: vi.fn(), goalRead: vi.fn(), goalSave: vi.fn(), parametersAccess: { value: false } }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries }) }));
vi.mock("@/lib/admin-create-person", () => ({ createAdminPerson: createPerson }));
vi.mock("sonner", () => ({ toast: { success, error: errorToast } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ can: () => canManage.value, isSuperAdmin: false, hasSectionAccess: (section: string) => section === "admin.usuarios" || (parametersAccess.value && section === "admin.parametros") }) }));
vi.mock("@/lib/appSettings", () => ({ loadProductivityGoalSetting: goalRead, saveMonthlyProductivityGoal: goalSave }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => {
    const query = { select: () => query, order: () => query, eq: () => query, range: () => query, then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve) };
    return query;
  },
  functions: { invoke: async () => ({ data: { users: [] }, error: null }) },
} }));
vi.mock("@/components/parque/ImportarTab", () => ({ ImportarTab: () => null }));
vi.mock("@/components/parque/ImportarTotvsTab", () => ({ ImportarTotvsTab: () => null }));
vi.mock("@/components/exports/TableExportButton", () => ({ TableExportButton: () => null }));
vi.mock("@/components/filters/FiltersBar", () => ({ FiltersBar: () => null }));

beforeEach(() => { vi.clearAllMocks(); canManage.value = true; parametersAccess.value = false; createPerson.mockResolvedValue(undefined); goalRead.mockResolvedValue({ value: 160, warning: null }); goalSave.mockResolvedValue(undefined); });
afterEach(cleanup);
async function openCreation() {
  render(<Admin />);
  fireEvent.click(await screen.findByRole("button", { name: "Nuevo usuario" }));
}

describe("Administración: alta de operativos sin acceso", () => {
  async function openParameters() {
    parametersAccess.value = true;
    render(<Admin />);
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Configuración" }), { button: 0, ctrlKey: false });
    return screen.findByLabelText("Meta mensual por técnico");
  }
  it("shows the persisted goal, saves it and invalidates productivity", async () => {
    const input = await openParameters();
    await waitFor(() => expect(input).toHaveValue(160));
    fireEvent.change(input, { target: { value: "144" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar parámetro" }));
    await waitFor(() => expect(goalSave).toHaveBeenCalledWith(144));
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["service-orders"] });
  });
  it("does not fabricate a saved goal when it cannot be read, and supports retry", async () => {
    goalRead.mockResolvedValueOnce({ value: null, warning: "Sin permiso para leer la meta de productividad." });
    const input = await openParameters();
    expect(await screen.findByRole("alert")).toHaveTextContent("Sin permiso");
    expect(input).toHaveValue(null);
    expect(screen.getByRole("button", { name: "Guardar parámetro" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(input).toHaveValue(160));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("lets an administrator enter the missing goal without a seeded default", async () => {
    goalRead.mockResolvedValue({ value: null, warning: "No se encontró una meta de productividad accesible." });
    const input = await openParameters();
    await screen.findByRole("alert");
    expect(input).toHaveValue(null);
    fireEvent.change(input, { target: { value: "144" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar parámetro" }));
    await waitFor(() => expect(goalSave).toHaveBeenCalledWith(144));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["service-orders"] });
  });
  it("does not claim a verified save when readback fails", async () => {
    goalSave.mockRejectedValue(new Error("No se pudo verificar la meta guardada. Reintentá la lectura."));
    const input = await openParameters();
    await waitFor(() => expect(input).toHaveValue(160));
    fireEvent.click(screen.getByRole("button", { name: "Guardar parámetro" }));
    await waitFor(() => expect(errorToast).toHaveBeenCalledWith(expect.stringContaining("No se pudo verificar")));
    expect(success).not.toHaveBeenCalled();
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
  it("limita las pestañas visibles a las secciones autorizadas", async () => {
    render(<Admin />);
    const navigation = await screen.findByRole("tablist", { name: "Sección de Administración" });
    expect(screen.getByRole("tab", { name: "Equipo y accesos" })).toHaveAttribute("aria-selected", "true");
    expect(navigation.querySelectorAll('[role="tab"]')).toHaveLength(1);
    expect(navigation).toHaveTextContent("Equipo y accesos");
    expect(navigation).not.toHaveTextContent("Configuración");
  });
  it("mantiene el alta dentro del viewport con cuerpo desplazable", async () => {
    await openCreation();
    fireEvent.click(screen.getByRole("switch", { name: "Acceso al sistema" }));
    expect(screen.getByRole("dialog")).toHaveClass("max-h-[90dvh]", "flex-col");
    expect(screen.getByLabelText("Nombre y apellido").parentElement?.parentElement).toHaveClass("min-h-0", "overflow-y-auto");
    expect(screen.getByRole("button", { name: "Crear usuario" })).toBeVisible();
  });
  it("abre por defecto sin correo ni contraseña y con nivel Operativo", async () => {
    await openCreation();
    expect(screen.getByRole("heading", { name: "Nuevo operativo de Servicios" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Acceso al sistema" })).not.toBeChecked();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Contraseña inicial")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Sucursal" })).toHaveTextContent("Santa Rita");
    expect(screen.getByRole("combobox", { name: "Nivel" })).toHaveTextContent("Operativo");
    expect(screen.getByRole("combobox", { name: "Nivel" })).toBeDisabled();
  });
  it("envía el alta sin acceso y cierra solo al confirmar", async () => {
    await openCreation();
    fireEvent.change(screen.getByLabelText("Nombre y apellido"), { target: { value: "Persona Prueba" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear operativo" }));
    await waitFor(() => expect(createPerson).toHaveBeenCalledWith({ nombre: "Persona Prueba", sucursal: "Santa Rita", conAcceso: false, email: "", password: "", role: "operativo" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(success).toHaveBeenCalledWith("Operativo de Servicios creado");
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["servicios", "tecnicos-activos"] });
  });
  it("habilita credenciales únicamente al pedir acceso", async () => {
    await openCreation();
    fireEvent.click(screen.getByRole("switch", { name: "Acceso al sistema" }));
    fireEvent.change(screen.getByLabelText("Nombre y apellido"), { target: { value: "Persona Prueba" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "prueba@example.com" } });
    fireEvent.change(screen.getByLabelText("Contraseña inicial"), { target: { value: "prueba123" } });
    expect(screen.getAllByRole("combobox").at(-1)).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Crear usuario" }));
    await waitFor(() => expect(createPerson).toHaveBeenCalledWith(expect.objectContaining({ conAcceso: true, email: "prueba@example.com", password: "prueba123" })));
  });
  it("no cierra ni anuncia éxito si la base rechaza el alta", async () => {
    createPerson.mockRejectedValue(new Error("Sin permiso para crear perfiles"));
    await openCreation();
    fireEvent.change(screen.getByLabelText("Nombre y apellido"), { target: { value: "Persona Prueba" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear operativo" }));
    await waitFor(() => expect(errorToast).toHaveBeenCalledWith("Sin permiso para crear perfiles"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre y apellido")).toHaveValue("Persona Prueba");
    expect(success).not.toHaveBeenCalled();
    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Crear operativo" })).not.toBeDisabled();
  });
  it("bloquea reenvíos y cambios de modo mientras se guarda", async () => {
    createPerson.mockReturnValue(new Promise(() => {}));
    await openCreation();
    fireEvent.click(screen.getByRole("button", { name: "Crear operativo" }));
    expect(screen.getByRole("button", { name: "Creando…" })).toBeDisabled();
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Creando…" }));
    expect(createPerson).toHaveBeenCalledTimes(1);
  });
  it("no permite el alta a quien no administra usuarios", async () => {
    canManage.value = false;
    render(<Admin />);
    await screen.findByText("Solo lectura");
    expect(screen.queryByRole("button", { name: "Nuevo usuario" })).not.toBeInTheDocument();
    expect(createPerson).not.toHaveBeenCalled();
  });
});
