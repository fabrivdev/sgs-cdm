import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminPerson } from "./admin-create-person";

const { from, insert, invoke } = vi.hoisted(() => ({ from: vi.fn(), insert: vi.fn(), invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from, functions: { invoke } } }));
const operative = { nombre: "  Persona Prueba  ", sucursal: "Santa Rita" as const, role: "operativo" as const, conAcceso: false, email: "", password: "" };

beforeEach(() => {
  vi.clearAllMocks();
  from.mockReturnValue({ insert });
  insert.mockResolvedValue({ error: null });
  invoke.mockResolvedValue({ data: { ok: true }, error: null });
});

describe("alta administrativa de personas", () => {
  it("crea un operativo activo sin Auth, roles ni permisos", async () => {
    await createAdminPerson(operative);
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("profiles");
    expect(insert).toHaveBeenCalledWith({ id: expect.any(String), nombre: "Persona Prueba", sucursal: "Santa Rita", activo: true, auth_user_id: null });
    expect(invoke).not.toHaveBeenCalled();
  });
  it("no envía credenciales residuales al alta sin acceso", async () => {
    await createAdminPerson({ ...operative, email: "prueba@example.com", password: "prueba123" });
    expect(insert.mock.calls[0][0]).not.toHaveProperty("email");
    expect(insert.mock.calls[0][0]).not.toHaveProperty("password");
    expect(invoke).not.toHaveBeenCalled();
  });
  it("genera identidades independientes", async () => {
    await createAdminPerson(operative);
    await createAdminPerson({ ...operative, nombre: "Otra Persona" });
    expect(insert.mock.calls[0][0].id).not.toBe(insert.mock.calls[1][0].id);
  });
  it("propaga el rechazo RLS sin recurrir a una cuenta Auth", async () => {
    insert.mockResolvedValue({ error: { message: "new row violates row-level security policy" } });
    await expect(createAdminPerson(operative)).rejects.toThrow("row-level security");
    expect(invoke).not.toHaveBeenCalled();
  });
  it("rechaza nombres vacíos y niveles administrativos sin cuenta", async () => {
    await expect(createAdminPerson({ ...operative, nombre: " " })).rejects.toThrow("nombre");
    await expect(createAdminPerson({ ...operative, role: "admin" })).rejects.toThrow("operativos");
    expect(from).not.toHaveBeenCalled();
  });
  it("mantiene correo y contraseña obligatorios para acceso", async () => {
    await expect(createAdminPerson({ ...operative, conAcceso: true })).rejects.toThrow("Email y contraseña");
    await expect(createAdminPerson({ ...operative, conAcceso: true, email: "prueba@example.com", password: "123" })).rejects.toThrow("6 caracteres");
    expect(invoke).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
  it("crea cuentas únicamente mediante la función administrativa protegida", async () => {
    await createAdminPerson({ ...operative, conAcceso: true, email: " prueba@example.com ", password: "prueba123", role: "admin" });
    expect(invoke).toHaveBeenCalledWith("admin-create-user", { body: { nombre: "Persona Prueba", sucursal: "Santa Rita", role: "admin", email: "prueba@example.com", password: "prueba123" } });
    expect(from).not.toHaveBeenCalled();
  });
  it.each([
    { data: null, error: { message: "Error de conexión" } },
    { data: { error: "Solo admin puede crear usuarios" }, error: null },
    { data: null, error: null },
  ])("no confirma acceso con respuesta fallida: %j", async (response) => {
    invoke.mockResolvedValue(response);
    await expect(createAdminPerson({ ...operative, conAcceso: true, email: "prueba@example.com", password: "prueba123" })).rejects.toThrow();
  });
});
