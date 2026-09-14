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
  it("separa ventas, notas de crédito y unidades netas", () => {
    setup();
    expect(screen.getByText("Nuevas vendidas").parentElement).toHaveTextContent("1");
    expect(screen.getByText("Usadas vendidas").parentElement).toHaveTextContent("0");
    expect(screen.getByText("Unidades netas").parentElement).toHaveTextContent("0");
    expect(screen.getAllByText("Nueva").length).toBeGreaterThan(0);
    expect(screen.queryByText("Sin identificar")).not.toBeInTheDocument();
    expect(screen.getByText("CARLOS BENITEZ")).toBeInTheDocument();
  });

  it("agrupa por marca y tipo y permite ver el modelo", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Máquinas" }));
    const groupRow = screen.getByRole("button", { name: /HORSCH SEMBRADORAS/ });
    fireEvent.click(groupRow);
    expect(screen.getByText("MAESTRO 18.50")).toBeInTheDocument();
  });

  it("muestra vendedor y mantiene el chasis como acceso al historial sin exponer la NP", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Detalle" }));
    expect(screen.queryByText("NP")).not.toBeInTheDocument();
    expect(screen.getByText("Vendedor")).toBeInTheDocument();
    expect(screen.getAllByText("CARLOS BENITEZ")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "24491421" })).toBeInTheDocument();
    expect(screen.getByText("Nota de crédito")).toBeInTheDocument();
  });
});
