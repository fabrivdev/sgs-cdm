import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Ventas, { type VentasArea } from "./Ventas";

const { rpc, exported, can, viewport } = vi.hoisted(() => ({ rpc: vi.fn(), exported: vi.fn(), can: vi.fn(() => true), viewport: { mobile: true } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ can }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => viewport.mobile }));
vi.mock("@/hooks/useServicioTecnicos", () => ({ useServicioTecnicos: () => ({ data: [] }) }));
vi.mock("@/components/ventas/salesTableExport", () => ({ exportSalesTable: exported }));

const summary = { total: 1499749.75, facturas: 2, clientes: 1, vendidas: 2, notas_credito: 1, netas: 1, promedio_unidad: 1499749.75 };
const periods = [{ ...summary, periodo: "2026-08-01" }];
const line = { id: "demo", fecha: "2026-08-15", factura: "0000123", cliente_facturado: "Cliente de prueba", marca: "CLAAS", tipo_maquina: "COSECHADORAS", modelo: "Modelo de prueba", chasis: "TEST001", condicion: "NUEVA", comercial: "Vendedor de prueba", unidades: -1, facturado: -250.25, es_nota_credito: true };
const partsMetrics = { facturado: summary.total, ventas: 1500000, notas_credito: -250.25, documentos: 2, clientes: 1, documentos_nc: 1, lineas: 2, unidades_netas: 1 };
const components = { mo: 100, km: 10, repuestos: 20, terceros: 0, neto: 130, horas: 4 };
const responses: Record<string, unknown> = {
  ventas_maquinas_dashboard_v1: { resumen: summary, periodos: periods, por_maquina: [], por_modelo: [], lineas: [line], dimensiones: { marcas: [], tipos: [] } },
  ventas_servicios_dimensiones: [],
  ventas_servicios_panorama_v2: { resumen: { ...summary, ordenes: 1, promedio: summary.total }, periodos: [{ ...periods[0], ...components, metodologia: "actual" }] },
  ventas_servicios_indicadores_v1: { totales: { ...components, ordenes: 1, documentos: 2 }, por_tipo: [], por_marca_tipo: [], por_maquina: [] },
  ventas_servicios_lineas_v2: [],
  ventas_repuestos_estado_historico_v1: { cargado: true, notas_credito_verificadas: true },
  ventas_repuestos_panorama_v2: { resumen: partsMetrics, periodos: [{ ...partsMetrics, periodo: "2026-08-01", desde: "2026-08-01", hasta: "2026-08-31", anterior: 0, anterior_lineas: 0, anio_anterior: 0, anio_anterior_lineas: 0 }], por_sucursal: [], por_marca: [], comparacion: { facturado: 0, lineas: 0 }, comparacion_ly: { facturado: 0, lineas: 0 } },
};
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  viewport.mobile = true;
  can.mockReturnValue(true);
  rpc.mockImplementation((name: string) => {
    const response = Promise.resolve({ data: responses[name] ?? { total: 0, pagina: 1, paginas: 1, total_periodo: 0, filas: [] }, error: null });
    return Object.assign(response, { abortSignal: () => response });
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
function setup(area: VentasArea) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Ventas area={area} /></QueryClientProvider>);
}
const nav = () => within(screen.getByRole("navigation", { name: "Vistas de ventas" }));
describe("selected mobile Sales composition", () => {
  it.each(["maquinas", "servicios", "repuestos"] as const)("%s opens directly on periods, with three visible indicators and no disclosure", async area => {
    setup(area);
    await screen.findByRole("button", { name: /ago.*2026/ });
    expect(nav().getByRole("button", { name: "Períodos" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("definition")).toHaveLength(3);
    expect(screen.queryByText("Más indicadores")).not.toBeInTheDocument();
    expect(document.querySelector("details")).toBeNull();
    expect(screen.getByRole("table").querySelectorAll("thead th")).toHaveLength(4);
    expect(screen.getByRole("table").querySelector("tfoot")).toHaveTextContent("Total");
    expect(screen.queryByRole("navigation", { name: "Análisis de ventas" })).not.toBeInTheDocument();
    fireEvent.click(nav().getByRole("button", { name: "Resumen" }));
    expect(await screen.findByRole("navigation", { name: "Análisis de ventas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "General" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clientes" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Vista")).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(nav().getByRole("button", { name: "Detalle" })); });
    expect(screen.queryByRole("navigation", { name: "Análisis de ventas" })).not.toBeInTheDocument();
  });
  it("selects August, opens Detail, retains the NC and exports only the mounted detail plus periods", async () => {
    setup("maquinas");
    fireEvent.click(await screen.findByRole("button", { name: /ago.*2026/ }));
    expect(nav().getByRole("button", { name: "Detalle" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/01 ago.*31 ago/)).toBeInTheDocument();
    const detail = await screen.findByRole("table", { name: "Detalle de Máquinas" });
    expect(detail).toHaveTextContent("$ -250,25");
    expect(detail.querySelector("tfoot")).toBeNull();
    fireEvent.keyDown(screen.getByRole("button", { name: "Acciones de la sección" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Exportar Detalle de Máquinas/ }));
    await waitFor(() => expect(exported).toHaveBeenCalled());
    const download = exported.mock.calls[0][0];
    expect(download.rows[0].factura).toBe("0000123");
    expect(download.rows[0].facturado).toBe(-250.25);
    expect(download.columns.some((c: { key: string }) => c.key === "chasis")).toBe(true);
    fireEvent.click(nav().getByRole("button", { name: "Períodos" }));
    expect(screen.getByRole("table").querySelector("tfoot")).toHaveTextContent("1.499.749,75");
    fireEvent.click(screen.getByRole("button", { name: "Ver período completo" }));
    expect(screen.queryByText(/01 ago.*31 ago/)).not.toBeInTheDocument();
  });
  it("services passes the inclusive selected dates to the existing detail source", async () => {
    setup("servicios");
    fireEvent.click(await screen.findByRole("button", { name: /ago.*2026/ }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("ventas_servicios_lineas_v2", expect.objectContaining({ p_desde: "2026-08-01", p_hasta: "2026-08-31" })));
  });
  it("does not expose downloads without permission", async () => {
    can.mockReturnValue(false);
    setup("maquinas");
    await screen.findByRole("table");
    expect(screen.queryByRole("button", { name: "Acciones de la sección" })).not.toBeInTheDocument();
  });
  it("keeps desktop navigation and all four original KPIs", async () => {
    viewport.mobile = false;
    setup("maquinas");
    await screen.findByText("Indicadores comerciales");
    expect(screen.queryByRole("navigation", { name: "Vistas de ventas" })).not.toBeInTheDocument();
    expect(screen.getByText("Promedio por unidad neta")).toBeInTheDocument();
  });
});
