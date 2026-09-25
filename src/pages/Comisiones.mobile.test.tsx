import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Comisiones from "./Comisiones";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), rows: [] as Record<string, unknown>[] }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ can: () => true }) }));
vi.mock("@/hooks/useCatalogos", () => ({ cargarTodo: async (query: Promise<{ data: unknown[] }>) => (await query).data }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: mocks.rpc,
  from: (name: string) => {
    const result = { data: name === "comisiones_jornadas" ? mocks.rows : [], error: null };
    const query = { select: () => query, eq: () => query, order: () => query, then: (resolve: (value: typeof result) => void) => Promise.resolve(result).then(resolve) };
    return query;
  },
} }));

beforeEach(() => {
  vi.stubGlobal("innerWidth", 320);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  localStorage.clear();
  localStorage.setItem("sig:comisiones:date-range", JSON.stringify({ from: "2026-09-01", to: "2026-09-30" }));
  mocks.rpc.mockReset().mockResolvedValue({ data: [{ id: "tech" }], error: null });
  mocks.rows = [{ id: "journey", os_numero: "000012345", cliente_nombre: "Cliente de prueba con nombre extenso", nro_chasis: "DEMO-0001", sucursal: "Santa Rita", estado_os: "Cerrada", fecha_cierre: "2026-09-23", fecha_inicio: "2026-09-23", fecha_fin: "2026-09-23", hora_inicio: "08:00", hora_fin: "12:30", tecnico_nombre: "Técnico de prueba", tecnico_profile_id: "tech", rol_tecnico: "PRINCIPAL", tipo_tiempo: "Cliente", tipo_tiempo_importado: "Cliente", horas_reportadas: 4.5, horas_calculadas: 4.5, horas_validas: 4.5, estado_validacion: "VALIDA", motivos_validacion: [] }];
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe("Comisiones: presentación del teléfono", () => {
  it("agrupa la identidad, conserva selección y no liquida al seleccionar o inspeccionar", async () => {
    render(<Comisiones />);
    const order = await screen.findByRole("button", { name: /OS 000012345 Cliente de prueba/ });
    expect(order).toHaveTextContent("Pendiente");
    expect(order).toHaveTextContent("Válida");
    expect(order.closest("tr")).toHaveTextContent("4,5 h");
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar OS 000012345" }));
    expect(screen.getByRole("button", { name: "Marcar pagadas (1)" })).toBeEnabled();
    fireEvent.click(order);
    expect(await screen.findByRole("dialog")).toHaveTextContent("DEMO-0001");
    expect(mocks.rpc.mock.calls.every(([name]) => name === "servicios_listar_tecnicos_activos")).toBe(true);
  });
  it("conserva el orden por los campos secundarios", async () => {
    render(<Comisiones />);
    await screen.findByRole("button", { name: /OS 000012345 Cliente de prueba/ });
    fireEvent.click(screen.getByRole("button", { name: "Ordenar órdenes de comisiones" }));
    const menu = await screen.findByRole("dialog");
    expect(within(menu).getByRole("button", { name: /Ordenar Cliente/ })).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: /Ordenar Pago/ })).toBeInTheDocument();
  });
  it("ajusta el estado vacío a las columnas realmente visibles", async () => {
    mocks.rows = [];
    render(<Comisiones />);
    const empty = await screen.findByText("Sin órdenes para mostrar");
    expect(empty.closest("td")).toHaveAttribute("colspan", "3");
  });
});
