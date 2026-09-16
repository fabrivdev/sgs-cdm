import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ServiciosPanorama } from "./ServiciosPanorama";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
afterEach(() => { cleanup(); rpc.mockReset(); });

const summary = { total: 415, facturas: 4, clientes: 4, ordenes: 4, promedio: 103.75 };
const row = (periodo: string, total: number, metodologia: "historico" | "actual") => ({
  periodo, total, mo: total, km: 0, repuestos: 0, terceros: 0,
  facturas: 1, clientes: 1, metodologia,
});

describe("Panorama de Ventas de Servicios", () => {
  it("totaliza componentes y usa clientes/facturas únicos del rango, sin sumar porcentajes", async () => {
    rpc.mockImplementation(async (_name: string, params: { p_desde: string }) => ({ data: {
      desde: params.p_desde, hasta: "2026-08-31", agrupacion: "mes",
      resumen: { ...summary, total: params.p_desde === "2026-07-01" ? 300 : 150, clientes: 1, facturas: 2 },
      periodos: [
        { ...row("2026-07-01", 100, "actual"), mo: 60, km: 10, repuestos: 20, terceros: 10, facturas: 2 },
        { ...row("2026-08-01", 200, "actual"), mo: 150, km: 20, repuestos: 25, terceros: 5, facturas: 2 },
      ],
    }, error: null }));
    render(<ServiciosPanorama desde="2026-07-01" hasta="2026-08-31" sucursal="TODAS" buscar="" tipoTiempo="TODOS"
      periodMode="mes" selectedPeriod={null} onSelectPeriod={() => undefined} />);
    const total = (await screen.findByText("Total del período")).parentElement!;
    expect(Array.from(total.children).map(cell => cell.textContent)).toEqual([
      "Total del período", "$ 300", "$ 210", "$ 30", "$ 45", "$ 15", "1", "2", "+100%", "+100%", "100%",
    ]);
    expect(total.tagName).not.toBe("BUTTON");
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
        periodos: [row("2026-08-01", 25, "actual")],
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

    const july = (await screen.findByText(/jul.*2026/i)).closest("button");
    expect(july).toHaveTextContent("+25%");
    expect(july).toHaveTextContent("+100%");

    const september = screen.getByText(/sept.*2026/i).closest("button");
    expect(september).toHaveTextContent("+100%");
    expect(september).toHaveTextContent("+150%");
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("ventas_servicios_panorama_v2", expect.objectContaining({ p_desde: "2025-12-01", p_hasta: "2026-08-14" })));
  });
});
