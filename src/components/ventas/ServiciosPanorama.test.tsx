import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ServiciosPanorama } from "./ServiciosPanorama";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ can: () => true }) }));
afterEach(() => { cleanup(); rpc.mockReset(); });

const summary = { total: 415, facturas: 4, clientes: 4, ordenes: 4, promedio: 103.75 };
const row = (periodo: string, total: number, metodologia: "historico" | "actual") => ({
  periodo, total, mo: total, km: 0, repuestos: 0, terceros: 0,
  facturas: 1, clientes: 1, metodologia,
});

describe("Panorama de Ventas de Servicios", () => {
  it("totaliza componentes y usa clientes/facturas únicos del rango, sin sumar porcentajes", async () => {
    rpc.mockImplementation(async (_name: string, params: { p_desde: string; p_agrupacion: string }) => ({ data: {
      desde: params.p_desde, hasta: "2026-08-31", agrupacion: "mes",
      resumen: { ...summary, total: params.p_desde === "2026-07-01" ? 300 : 150, clientes: 1, facturas: 2 },
      periodos: params.p_agrupacion === "dia" ? (params.p_desde.startsWith("2025") ? [row("2025-07-15",50,"historico"), row("2025-08-15",100,"historico")] : [row("2026-06-15",50,"actual"),row("2026-07-15",100,"actual")]) : [
        { ...row("2026-07-01", 100, "actual"), mo: 60, km: 10, repuestos: 20, terceros: 10, facturas: 2 },
        { ...row("2026-08-01", 200, "actual"), mo: 150, km: 20, repuestos: 25, terceros: 5, facturas: 2 },
      ],
    }, error: null }));
    render(<ServiciosPanorama desde="2026-07-01" hasta="2026-08-31" sucursal="TODAS" buscar="" tipoTiempo="TODOS"
      periodMode="mes" selectedPeriod={null} onSelectPeriod={() => undefined} />);
    const total = (await screen.findByText("Total del período")).parentElement!;
    await waitFor(() => expect(Array.from(total.children).map(cell => cell.textContent)).toEqual([
      "Total del período", "$ 300", "$ 210", "$ 30", "$ 45", "$ 15", "1", "2", "$ 150 (+100%)", "$ 150 (+100%)", "100%",
    ]));
    expect(total.tagName).not.toBe("BUTTON");
    const title = screen.getByRole("heading", { name: "Facturación por período" });
    expect(title.closest("button")).toBeNull();
    expect(screen.queryByRole("button", { name: "Facturación por período" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Períodos" })).not.toBeInTheDocument();
    expect(rpc).toHaveBeenCalledTimes(3); // Ninguna consulta adicional para el total.
  });
  it("calcula LM y LY al cruzar sistemas y usa el mismo tramo para un mes parcial", async () => {
    rpc.mockImplementation(async (_name: string, params: { p_desde: string }) => {
      if (params.p_desde === "2026-01-01") return { data: {
        desde: "2026-01-01", hasta: "2026-09-14", agrupacion: "mes", summary,
        resumen: summary,
        periodos: [row("2026-06-01", 80, "historico"), row("2026-07-01", 100, "actual"), row("2026-08-01", 200, "actual"), row("2026-09-01", 50, "actual")],
      }, error: null };
      if (params.p_desde === "2025-12-01") return { data: {
        desde: "2025-12-01", hasta: "2026-08-14", agrupacion: "mes", resumen: summary,
        periodos: [row("2026-06-15",80,"historico"), row("2026-07-15",100,"actual"), row("2026-08-10", 25, "actual")],
      }, error: null };
      return { data: {
        desde: "2025-01-01", hasta: "2025-09-14", agrupacion: "mes", resumen: summary,
        periodos: [row("2025-07-01", 50, "historico"), row("2025-09-01", 20, "historico")],
      }, error: null };
    });

    render(<ServiciosPanorama
      desde="2026-01-01" hasta="2026-09-14" sucursal="TODAS" buscar="" tipoTiempo="TODOS"
      periodMode="mes" selectedPeriod={null} onSelectPeriod={() => undefined}
    />);

    const july = (await screen.findByText(/jul.*2026/i)).closest('[role="row"]');
    await waitFor(() => expect(july).toHaveTextContent("+25%"));
    expect(july).toHaveTextContent("+100%");

    const september = screen.getByText(/sept.*2026/i).closest('[role="row"]');
    expect(september).toHaveTextContent("+100%");
    expect(september).toHaveTextContent("+150%");
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("ventas_servicios_panorama_v2", expect.objectContaining({ p_desde: "2025-12-01", p_hasta: "2026-08-14" })));
  });
});

it('preserves filters and current amounts when optional daily comparisons are denied', async () => {
  rpc.mockImplementation(async (_name: string, params: {p_agrupacion:string}) => params.p_agrupacion === 'dia'
    ? {data:null,error:{message:'permission denied'}}
    : {data:{resumen:{...summary,total:123.75},periodos:[row('2026-09-01',123.75,'actual')]},error:null});
  render(<ServiciosPanorama desde="2026-09-01" hasta="2026-09-14" sucursal="Santa Rita" buscar="filtro" tipoTiempo="EXTERNO"
    marca="CLAAS" tipoMaquina="TRACTOR" filtros={{cliente:'Cliente de prueba'}} periodMode="mes" selectedPeriod={null} onSelectPeriod={()=>undefined}/>);
  await waitFor(()=>expect(rpc).toHaveBeenCalledTimes(3));
  for(const [name,params] of rpc.mock.calls) {
    expect(name).toBe('ventas_servicios_panorama_v2_filtrado');
    expect(params).toMatchObject({p_sucursal:'Santa Rita',p_buscar:'filtro',p_tipo_tiempo:'EXTERNO',p_marca:'CLAAS',p_tipo_maquina:'TRACTOR',p_filtros:{cliente:'Cliente de prueba'}});
  }
  const total=(await screen.findByText('Total del período')).parentElement!;
  expect(total).toHaveTextContent('$ 124');
  expect(total.children[8]).toHaveTextContent('\u2014');
  expect(total.children[9]).toHaveTextContent('\u2014');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
