import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MaquinasExplorer, type MaquinasDashboardResponse } from "./MaquinasVentas";

vi.mock("@/components/ventas/MachineHistorySheet", () => ({ MachineHistorySheet: () => null }));
afterEach(cleanup);

const data: MaquinasDashboardResponse = {
  resumen: { total: 280000, facturas: 2, clientes: 2, vendidas: 1, notas_credito: 1, netas: 0, promedio_unidad: 0, nuevas: 1, usadas: 0 },
  periodos: [], por_maquina: [], por_modelo: [], dimensiones: { marcas: ["HORSCH"], tipos: ["SEMBRADORAS"] },
  lineas: [
    { id: "1", fecha: "2026-08-20", factura: "001", cliente_facturado: "Cliente A", sucursal: "Santa Rita", facturado: 300000, es_nota_credito: false, unidades: 1, marca: "HORSCH", tipo_maquina: "SEMBRADORAS", modelo: "MAESTRO 18.50", chasis: "24491421", comercial: "000007 - Carlos Benitez", condicion: "NUEVA", metodologia: "actual" },
    { id: "2", fecha: "2026-08-21", factura: "002", cliente_facturado: "Cliente B", sucursal: "Santa Rita", facturado: -20000, es_nota_credito: true, unidades: -1, marca: "HORSCH", tipo_maquina: "SEMBRADORAS", modelo: "MAESTRO 18.50", chasis: "24491422", comercial: "CARLOS JAVIER BENITEZ ZARZA", condicion: null, metodologia: "actual" },
  ],
};

function setup() {
  return render(<MaquinasExplorer data={data} loading={false} error={null} desde="2026-08-01" hasta="2026-08-31" />);
}

describe("Ventas de Máquinas", () => {
  it("keeps custom brands and their Operaciones colors in the invoice list", () => {
    const brandedData = { ...data, lineas: data.lineas.map((line, index) => ({ ...line, marca: index ? "NB MAQUINAS" : "JOHN DEERE" })) };
    render(<MaquinasExplorer data={brandedData} loading={false} error={null} desde="2026-08-01" hasta="2026-08-31" />);
    fireEvent.click(screen.getByRole("button", { name: "Detalle" }));
    expect(screen.getByTitle("JOHN DEERE")).toHaveTextContent("JOHN DEERE");
    expect(screen.getByTitle("NB")).toHaveTextContent("NB");
    expect(screen.queryByText("OTROS")).not.toBeInTheDocument();
    expect(screen.getByText("$ 300.000")).toBeInTheDocument();
  });
  it("uses the same Oscar identity in the seller summary and invoice detail", () => {
    const oscarData = { ...data, lineas: data.lineas.map((line, index) => ({ ...line, comercial: index ? "OSCAR DANIEL BENITEZ MEZA" : "000006 - Oscar Benítez" })) };
    render(<MaquinasExplorer data={oscarData} loading={false} error={null} desde="2026-08-01" hasta="2026-08-31" />);
    fireEvent.click(screen.getByRole("button", { name: "Vendedores" }));
    expect(screen.getAllByText("OSCAR BENITEZ")).toHaveLength(1);
    expect(screen.getByText("$ 280.000")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Detalle" }));
    expect(screen.getAllByText("OSCAR BENITEZ")).toHaveLength(2);
    expect(screen.queryByText("OSCAR MEZA")).not.toBeInTheDocument();
  });
  it("unifies Campos in customer grouping and invoice detail across systems", () => {
    const camposData = { ...data, lineas: data.lineas.map((line, index) => ({ ...line, cliente_facturado: index ? 'CAMPOS DEL MANANA S.A. - SANTA RITA' : 'campos del mañana SA (OTRA SEDE)' })) };
    render(<MaquinasExplorer data={camposData} loading={false} error={null} desde="2026-08-01" hasta="2026-08-31" />);
    fireEvent.click(screen.getByRole('button', { name: 'Clientes' }));
    expect(screen.getAllByText('CAMPOS DEL MAÑANA S.A.')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Detalle' }));
    expect(screen.getAllByText('CAMPOS DEL MAÑANA S.A.')).toHaveLength(2);
    expect(screen.queryByText(/SANTA RITA/)).not.toBeInTheDocument();
  });
  it("separa ventas, notas de crédito y unidades netas", () => {
    setup();
    expect(screen.queryByText("Nuevas vendidas")).not.toBeInTheDocument();
    expect(screen.queryByText("Usadas vendidas")).not.toBeInTheDocument();
    expect(screen.getByText("Condición")).toBeInTheDocument();
    expect(screen.getAllByText("Netas").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Nueva").length).toBeGreaterThan(0);
    expect(screen.queryByText("Sin identificar")).not.toBeInTheDocument();
    expect(screen.getByText("Marca")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Vendedores" }));
    expect(screen.getByText("CARLOS BENITEZ")).toBeInTheDocument();
  });

  it("agrupa por marca y tipo y permite ver el modelo", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Máquinas" }));
    const groupRow = screen.getByRole("button", { name: /HORSCH SEMBRADORAS/ });
    fireEvent.click(groupRow);
    expect(screen.getByText("MAESTRO 18.50")).toBeInTheDocument();
  });

  it("muestra vendedor y el chasis como texto plano, sin origen ni situación", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Detalle" }));
    expect(screen.queryByText("NP")).not.toBeInTheDocument();
    expect(screen.getByText("Vendedor")).toBeInTheDocument();
    expect(screen.getByText("Tipo")).toBeInTheDocument();
    expect(screen.queryByText("Origen")).not.toBeInTheDocument();
    expect(screen.queryByText("Situación")).not.toBeInTheDocument();
    expect(screen.getAllByText("CARLOS BENITEZ")).toHaveLength(2);
    expect(screen.getByText("24491421")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "24491421" })).not.toBeInTheDocument();
  });
});
