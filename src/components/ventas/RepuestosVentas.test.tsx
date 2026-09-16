import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RepuestosVentas, type PartsListing, type PartsOverview } from "./RepuestosVentas";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
afterEach(() => { cleanup(); rpc.mockReset(); });
const summary = { facturado: 125, ventas: 150, notas_credito: -25, clientes: 1, documentos: 2, documentos_nc: 1, lineas: 3, unidades_netas: 2 };
const overview: PartsOverview = {
  resumen: summary, periodos: [{ ...summary, periodo: "2026-08-01", desde: "2026-08-01", hasta: "2026-08-31", anterior: 100, anterior_lineas: 2, anio_anterior: 50, anio_anterior_lineas: 1 }],
  por_sucursal: [{ ...summary, sucursal: "Santa Rita" }], por_marca: [{ ...summary, marca: "CLAAS" }],
  comparacion: { facturado: 100, lineas: 2, desde: "2026-07-01", hasta: "2026-07-31" }, comparacion_ly: { facturado: 50, lineas: 1, desde: "2025-08-01", hasta: "2025-08-31" },
};
const detail: PartsListing = { total: 3, pagina: 1, paginas: 1, total_periodo: 125, filas: [
  { id: "a", fecha: "2026-08-10", factura: "FACT1", cliente: "Cliente A", sucursal: "Santa Rita", codigo: "REP1", codigo_fabricante: "FAB1", descripcion: "Rodamiento", cantidad: 2, facturado: 100, metodologia: "actual" },
  { id: "b", fecha: "2026-08-10", factura: "FACT1", cliente: "Cliente A", sucursal: "Santa Rita", codigo: "REP2", codigo_fabricante: "FAB2", descripcion: "Correa", cantidad: 1, facturado: 50, metodologia: "actual" },
  { id: "c", fecha: "2026-08-21", factura: "NC1", cliente: "Cliente A", sucursal: "Santa Rita", codigo: "REP1", codigo_fabricante: "FAB1", descripcion: "Rodamiento", cantidad: -1, facturado: -25, metodologia: "actual", es_nota_credito: true },
] };
function mockRpc() {
  rpc.mockImplementation((name: string, args: Record<string, unknown>) => ({ abortSignal: () => Promise.resolve({ error: null,
    data: name === "ventas_repuestos_estado_historico_v1" ? { cargado: true, notas_credito_verificadas: true } : name === "ventas_repuestos_panorama_v2" ? overview
       : args.p_vista === "detalle" ? detail : { ...detail, filas: [{ ...summary, id: "g1", cliente: "Cliente A", vendedor: "000007 – CARLOS JAVIER BENITEZ ZARZA", codigo: "REP1", codigo_fabricante: "FAB1", descripcion: "Rodamiento", anterior: 50, ultima: "2026-08-10" }] },
  }) }));
}
function Harness({ desde = "2026-01-01", hasta = "2026-09-15" }: { desde?: string; hasta?: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  return <RepuestosVentas desde={desde} hasta={hasta} sucursal="TODAS" buscar="" periodMode="mes" selectedPeriod={selected} onSelectPeriod={setSelected} />;
}
function setup(props?: { desde?: string; hasta?: string }) {
  mockRpc();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><Harness {...props} /></QueryClientProvider>);
}
describe("Ventas de Repuestos", () => {
  it("el total conserva clientes/documentos únicos y calcula variaciones sobre el rango", async () => {
    rpc.mockImplementation((name: string) => ({ abortSignal: () => Promise.resolve({ error: null,
      data: name === "ventas_repuestos_estado_historico_v1" ? { cargado: true, notas_credito_verificadas: true } : {
        ...overview, periodos: [
          { ...overview.periodos[0], periodo: "2026-07-01", facturado: 100, ventas: 100, notas_credito: 0, documentos: 1 },
          { ...overview.periodos[0], facturado: 25, ventas: 50, documentos: 2 },
        ],
      },
    }) }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
    const total = (await screen.findByText("Total del período")).closest("tr")!;
    expect(within(total).getAllByRole("cell").map(cell => cell.textContent)).toEqual([
      "Total del período", "$ 125", "$ 150", "$ -25", "1", "2", "2", "+25%", "+150%", "100%",
    ]);
  });
  it("comparte panorama y resumen sin repetir la consulta", async () => {
    setup(); await screen.findByText("CLAAS");
    expect(rpc.mock.calls.filter(([name]) => name === "ventas_repuestos_panorama_v2")).toHaveLength(1);
    expect(rpc).not.toHaveBeenCalledWith("ventas_area_resumen", expect.anything());
    const tables = screen.getAllByRole("table");
    const periodHeads = within(tables[0]).getAllByRole("columnheader").slice(1, 7).map(node => node.textContent);
    const summaryHeads = within(tables[1]).getAllByRole("columnheader").slice(1, 7).map(node => node.textContent);
    expect(summaryHeads).toEqual(periodHeads);
    expect(screen.getByText("Total del período")).toBeInTheDocument();
    expect(within(tables[0]).getAllByRole("row")).toHaveLength(3); // Cabecera, período y total.
  });
  it("detalle plano: dos líneas repiten la factura, con ambos códigos y NC", async () => {
    setup(); fireEvent.click(screen.getByRole("button", { name: "Detalle" }));
    await screen.findByText("REP2");
    expect(screen.getAllByText("FACT1")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "FACT1" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Cód. fabricante" })).toBeInTheDocument();
    expect(screen.getByText("FAB2")).toBeInTheDocument();
    expect(screen.getByText("-1")).toBeInTheDocument();
    expect(screen.getByText("NC")).toBeInTheDocument();
    const table = screen.getAllByRole("table").at(-1)!;
    expect(within(table).getAllByRole("row")).toHaveLength(4); // Cabecera y 3 líneas, sin agrupadores.
    expect(within(table).getAllByText("$ -25").length).toBeGreaterThan(0);
  });
  it("selección agosto recorta detalle y KPI hasta el 31 y permite volver", async () => {
    setup(); await screen.findByText("CLAAS");
    fireEvent.click(screen.getByRole("button", { name: /ago/i }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("ventas_repuestos_panorama_v2", expect.objectContaining({ p_desde: "2026-08-01", p_hasta: "2026-08-31" })));
    fireEvent.click(screen.getByRole("button", { name: "Detalle" }));
    await screen.findByText("REP2");
    expect(rpc).toHaveBeenCalledWith("ventas_repuestos_listado_v2", expect.objectContaining({ p_desde: "2026-08-01", p_hasta: "2026-08-31", p_vista: "detalle" }));
    fireEvent.click(screen.getByRole("button", { name: "Ver período completo" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("ventas_repuestos_listado_v2", expect.objectContaining({ p_desde: "2026-01-01", p_hasta: "2026-09-15" })));
  });
  it("clientes y repuestos son listas con los mismos indicadores", async () => {
    setup(); fireEvent.click(screen.getByRole("button", { name: /^Clientes$/ }));
    await screen.findByText("Cliente A");
    expect(screen.getByRole("columnheader", { name: "Cliente facturado" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Sucursales" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Año anterior" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Repuestos$/ }));
    await screen.findByText("REP1");
    expect(screen.getByText("FAB1")).toBeInTheDocument();
    expect(screen.getByText("Rodamiento")).toBeInTheDocument();
  });
  it("elimina Análisis y agrega la vista de vendedores", async () => {
    setup(); await screen.findByText("CLAAS");
    expect(screen.queryByRole("button", { name: "Análisis" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Vendedores" }));
    expect(await screen.findByText("CARLOS BENITEZ")).toBeInTheDocument();
    expect(screen.queryByText(/000007/)).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Vendedor" })).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalledWith("ventas_area_analisis_negocio", expect.anything());
  });
  it("muestra descripción y cantidades históricas sin un marcador agregado", async () => {
    detail.filas[0].metodologia = "historico";
    setup(); fireEvent.click(screen.getByRole("button", { name: "Detalle" }));
    await screen.findByText("Correa");
    expect(screen.getAllByText("Rodamiento").length).toBeGreaterThan(0);
    expect(screen.queryByText("Histórico sin detalle por artículo")).not.toBeInTheDocument();
    detail.filas[0].metodologia = "actual";
  });
  it("carga el detalle por scroll sin recortar su total", async () => {
    setup();
    rpc.mockImplementation((name: string, args: Record<string, unknown>) => ({ abortSignal: () => Promise.resolve({ error: null,
      data: name === "ventas_repuestos_estado_historico_v1" ? { cargado: true, notas_credito_verificadas: true } : name === "ventas_repuestos_panorama_v2" ? overview : { ...detail, total: 51, paginas: 2, pagina: Number(args.p_pagina), total_periodo: 5000,
        filas: [{ ...detail.filas[0], id: String(args.p_pagina), codigo: args.p_pagina === 2 ? "ULTIMO" : "PRIMERO" }] },
    }) }));
    fireEvent.click(screen.getByRole("button", { name: "Detalle" }));
    await screen.findByText("PRIMERO");
    await screen.findByText("ULTIMO");
    expect(screen.getByText("2 de 51 registros")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("ventas_repuestos_listado_v2", expect.objectContaining({ p_pagina: 2, p_por_pagina: 50 }));
  });
  it("no lanza informes ante un rango vacío o invertido", () => {
    setup({ desde: "", hasta: "2026-08-31" });
    expect(screen.getByRole("alert")).toHaveTextContent("rango de fechas válido");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("avisa si faltan NC históricas, también para comparaciones LY actuales", async () => {
    setup({ desde: "2026-08-01", hasta: "2026-08-31" });
    rpc.mockImplementation((name: string) => ({ abortSignal: () => Promise.resolve({ error: null,
      data: name === "ventas_repuestos_estado_historico_v1" ? { cargado: true, notas_credito_verificadas: false } : overview,
    }) }));
    // Consulta fresca en un nuevo cliente para comprobar el aviso de fuente pendiente.
    cleanup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><Harness desde="2026-08-01" hasta="2026-08-31" /></QueryClientProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("pendiente de conciliar");
  });
  it("una migración ausente no aparece como ventas cero", async () => {
    rpc.mockImplementation(() => ({ abortSignal: () => Promise.resolve({ data: null, error: { code: "PGRST202" } }) }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
    expect((await screen.findAllByRole("alert"))[0]).toHaveTextContent("Falta aplicar el SQL");
    expect(screen.queryByText("$ 0")).not.toBeInTheDocument();
  });
});
