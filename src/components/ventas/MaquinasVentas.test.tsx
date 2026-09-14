import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { MaquinasExplorer, type MaquinasDashboardResponse } from "./MaquinasVentas";

vi.mock("@/components/ventas/MachineHistorySheet", () => ({ MachineHistorySheet: () => null }));
afterEach(cleanup);

const data: MaquinasDashboardResponse = {
  resumen: { total: 280000, facturas: 2, clientes: 2, vendidas: 2, notas_credito: 1, netas: 1, promedio_unidad: 280000, con_np: 2, sin_np: 1 },
  periodos: [], por_maquina: [], por_modelo: [], dimensiones: { marcas: ["HORSCH"], tipos: ["SEMBRADORAS"] },
  lineas: [
    { id: "1", fecha: "2026-08-20", factura: "001", cliente_facturado: "Cliente A", sucursal: "Santa Rita", facturado: 300000, es_nota_credito: false, unidades: 1, marca: "HORSCH", tipo_maquina: "SEMBRADORAS", modelo: "MAESTRO 18.50", chasis: "24491421", propietario: "Cliente A", operacion_id: "op-1", np_numero: "NP-100", np_fecha: "2026-08-01", np_cliente: "Cliente A", comercial: "Vendedor", condicion: "NUEVA", vinculo_np: "FACTURA_Y_CHASIS", metodologia: "actual" },
    { id: "2", fecha: "2026-08-21", factura: "002", cliente_facturado: "Cliente B", sucursal: "Santa Rita", facturado: -20000, es_nota_credito: true, unidades: -1, marca: "HORSCH", tipo_maquina: "SEMBRADORAS", modelo: "MAESTRO 18.50", chasis: "24491422", propietario: "Cliente B", operacion_id: null, np_numero: null, np_fecha: null, np_cliente: null, comercial: null, condicion: null, vinculo_np: null, metodologia: "actual" },
  ],
};

function setup() {
  return render(<MemoryRouter><MaquinasExplorer data={data} loading={false} error={null} desde="2026-08-01" hasta="2026-08-31" /></MemoryRouter>);
}

describe("Ventas de Máquinas", () => {
  it("separa ventas, notas de crédito y unidades netas", () => {
    setup();
    expect(screen.getByText("Vendidas").parentElement).toHaveTextContent("1");
    expect(screen.getByText("Notas de crédito").parentElement).toHaveTextContent("1");
    expect(screen.getByText("Unidades netas").parentElement).toHaveTextContent("0");
    expect(screen.getByText(/1 vinculadas · 1 sin NP/)).toBeInTheDocument();
  });

  it("agrupa por marca y tipo y permite ver el modelo", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Máquinas" }));
    const groupRow = screen.getByRole("button", { name: /HORSCH SEMBRADORAS/ });
    fireEvent.click(groupRow);
    expect(screen.getByText("MAESTRO 18.50")).toBeInTheDocument();
  });

  it("enlaza la NP y mantiene el chasis como acceso al historial", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Detalle" }));
    expect(screen.getByRole("link", { name: /NP-100/ })).toHaveAttribute("href", "/parque-operaciones?operacion=op-1");
    expect(screen.getByRole("button", { name: "24491421" })).toBeInTheDocument();
    expect(screen.getByText("Nota de crédito")).toBeInTheDocument();
  });
});
