import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MaquinasDashboardResponse } from "@/components/ventas/MaquinasVentas";
import Ventas from "./Ventas";

const { rpc, viewport } = vi.hoisted(() => ({ rpc: vi.fn(), viewport: { mobile: true } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ can: () => false }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => viewport.mobile }));
// The area-change test only needs the services boundary; machine reports and filters stay real.
vi.mock("@/components/ventas/ServiciosPanorama", () => ({ ServiciosPanorama: () => <div>Panorama de servicios</div> }));

type RpcResult = { data: MaquinasDashboardResponse | null; error: { message: string } | null };
function deferred() {
  let resolve!: (value: RpcResult) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<RpcResult>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
let requests: ReturnType<typeof deferred>[];

function response(total: number): RpcResult {
  const resumen = { total, facturas: 1, clientes: 1, vendidas: 1, notas_credito: 0, netas: 1, promedio_unidad: total };
  return { data: { resumen, periodos: [{ ...resumen, periodo: "2026-09-01" }], por_maquina: [], por_modelo: [], lineas: [], dimensiones: { marcas: [], tipos: [] } }, error: null };
}
function changeStart(value: string) {
  fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value } });
}
function billing() {
  return viewport.mobile ? screen.getAllByRole("definition")[0] : document.querySelector(".kpi-item")!;
}
async function succeed(index: number, total: number) {
  await act(async () => { requests[index].resolve(response(total)); });
}
async function fail(index: number, kind: "RPC error" | "rejection", message: string) {
  await act(async () => {
    if (kind === "rejection") requests[index].reject(new Error(message));
    else requests[index].resolve({ data: null, error: { message } });
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  requests = [];
  viewport.mobile = true;
  rpc.mockImplementation((name: string) => {
    if (name !== "ventas_maquinas_dashboard_v1") return Promise.resolve({ data: [], error: null });
    const request = deferred();
    requests.push(request);
    return request.promise;
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); rpc.mockReset(); });

describe("Ventas machine request ownership", () => {
  it.each([true, false])("keeps latest KPIs and periods when older success arrives last (mobile: %s)", async mobile => {
    viewport.mobile = mobile;
    render(<Ventas area="maquinas" />);
    changeStart("2026-09-01");
    expect(requests).toHaveLength(2);
    expect(rpc).toHaveBeenLastCalledWith("ventas_maquinas_dashboard_v1", {
      p_desde: "2026-09-01", p_hasta: "2026-10-03", p_sucursal: null, p_buscar: null,
      p_marca: null, p_tipo_maquina: null, p_agrupacion: "mes",
    });
    await succeed(1, 222);
    expect(billing()).toHaveTextContent("$ 222");
    await succeed(0, 111);
    expect(billing()).toHaveTextContent("$ 222");
    expect(document.querySelector(".sales-periods")).toHaveTextContent("$ 222");
    expect(screen.queryByText("$ 111")).not.toBeInTheDocument();
  });

  it.each(["success", "RPC error", "rejection"] as const)("an obsolete %s cannot finish loading the current request", async outcome => {
    render(<Ventas area="maquinas" />);
    changeStart("2026-09-01");
    if (outcome === "success") await succeed(0, 111);
    else await fail(0, outcome, "Error obsoleto");
    expect(screen.getByText("Cargando facturación…")).toBeInTheDocument();
    expect(billing()).toHaveTextContent("—");
    expect(screen.queryByText("Error obsoleto")).not.toBeInTheDocument();
    await succeed(1, 222);
    expect(billing()).toHaveTextContent("$ 222");
  });

  it.each(["RPC error", "rejection"] as const)("ignores a stale %s after current data arrives", async outcome => {
    render(<Ventas area="maquinas" />);
    changeStart("2026-09-01");
    await succeed(1, 222);
    await fail(0, outcome, "Error obsoleto");
    expect(billing()).toHaveTextContent("$ 222");
    expect(screen.queryByText("Error obsoleto")).not.toBeInTheDocument();
    expect(screen.queryByText("Cargando facturación…")).not.toBeInTheDocument();
  });

  it.each(["RPC error", "rejection"] as const)("reports a current %s and lets the latest retry own loading and data", async outcome => {
    render(<Ventas area="maquinas" />);
    changeStart("2026-09-01");
    await fail(1, outcome, "No se pudo conectar");
    expect(screen.getByText("No se pudo conectar")).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Reintentar" });
    fireEvent.click(retry);
    expect(requests).toHaveLength(3);
    expect(rpc.mock.calls[2]).toEqual(rpc.mock.calls[1]);
    expect(screen.queryByText("No se pudo conectar")).not.toBeInTheDocument();
    await succeed(0, 111);
    expect(screen.getByText("Cargando facturación…")).toBeInTheDocument();
    await succeed(2, 333);
    expect(billing()).toHaveTextContent("$ 333");
  });

  it("preserves the current error when an obsolete success arrives", async () => {
    render(<Ventas area="maquinas" />);
    changeStart("2026-09-01");
    await fail(1, "RPC error", "Error vigente");
    await succeed(0, 111);
    expect(screen.getByText("Error vigente")).toBeInTheDocument();
    expect(screen.queryByText("$ 111")).not.toBeInTheDocument();
  });

  it("invalidates the pending request for an invalid date range, then recovers", async () => {
    render(<Ventas area="maquinas" />);
    changeStart("2026-12-01");
    expect(requests).toHaveLength(1);
    await fail(0, "RPC error", "Error obsoleto");
    expect(screen.getByText("Seleccioná un rango de fechas válido.")).toBeInTheDocument();
    expect(screen.queryByText("Error obsoleto")).not.toBeInTheDocument();
    changeStart("2026-09-01");
    await succeed(1, 222);
    expect(billing()).toHaveTextContent("$ 222");
  });

  it("clearing a committed search invalidates its pending result", async () => {
    render(<Ventas area="maquinas" />);
    await succeed(0, 100);
    fireEvent.change(screen.getAllByRole("searchbox", { name: "Buscar" })[0], { target: { value: "chasis" } });
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(rpc).toHaveBeenLastCalledWith("ventas_maquinas_dashboard_v1", expect.objectContaining({ p_buscar: "chasis" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Limpiar búsqueda" })[0]);
    await waitFor(() => expect(requests).toHaveLength(3));
    expect(rpc).toHaveBeenLastCalledWith("ventas_maquinas_dashboard_v1", expect.objectContaining({ p_buscar: null }));
    await succeed(2, 222);
    await succeed(1, 111);
    expect(billing()).toHaveTextContent("$ 222");
    expect(screen.getAllByRole("searchbox", { name: "Buscar" }).every(input => (input as HTMLInputElement).value === "")).toBe(true);
  });

  it("resetting all filters invalidates the filtered request", async () => {
    render(<Ventas area="maquinas" />);
    await succeed(0, 100);
    fireEvent.change(screen.getAllByRole("searchbox", { name: "Buscar" })[0], { target: { value: "chasis" } });
    await waitFor(() => expect(requests).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", { name: "Más filtros" }));
    fireEvent.click(screen.getByRole("button", { name: /Limpiar \(1\)/ }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(requests).toHaveLength(3));
    expect(rpc).toHaveBeenLastCalledWith("ventas_maquinas_dashboard_v1", expect.objectContaining({ p_buscar: null }));
    await succeed(2, 222);
    await fail(1, "RPC error", "Error anterior al reinicio");
    expect(billing()).toHaveTextContent("$ 222");
    expect(screen.queryByText("Error anterior al reinicio")).not.toBeInTheDocument();
  });

  it("invalidates the first mount request during StrictMode effect cleanup", async () => {
    render(<StrictMode><Ventas area="maquinas" /></StrictMode>);
    expect(requests).toHaveLength(2);
    await succeed(1, 222);
    await succeed(0, 111);
    expect(billing()).toHaveTextContent("$ 222");
  });

  it.each(["unmount", "area change"] as const)("does not process a pending error after %s", async action => {
    const page = render(<Ventas area="maquinas" />);
    if (action === "unmount") page.unmount();
    else page.rerender(<Ventas area="servicios" />);
    const readMessage = vi.fn(() => "Error de una vista cerrada");
    const staleError = { get message() { return readMessage(); } };
    await act(async () => { requests[0].resolve({ data: null, error: staleError }); });
    expect(readMessage).not.toHaveBeenCalled();
    expect(screen.queryByText("Error de una vista cerrada")).not.toBeInTheDocument();
    if (action === "area change") expect(screen.getByText("Panorama de servicios")).toBeInTheDocument();
  });
});
