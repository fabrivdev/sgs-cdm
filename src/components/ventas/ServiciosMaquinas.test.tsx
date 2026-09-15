import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ServiciosMaquinas } from "./ServiciosMaquinas";

vi.mock("./useServiciosIndicadores", () => ({
  useServiciosIndicadores: () => ({ loading: false, error: null, data: { por_maquina: [
    { marca: "CLAAS", tipo_maquina: "COSECHADORAS", maquinas: 2, ordenes: 3, horas: 8, mo: 100, km: 10, repuestos: 20, terceros: 0, neto: 130 },
    { marca: "JOHN DEERE", tipo_maquina: "TRACTORES", maquinas: 1, ordenes: 1, horas: 4, mo: 50, km: 0, repuestos: 0, terceros: 0, neto: 50 },
    { marca: "VALTRA", tipo_maquina: "TRACTORES", maquinas: 2, ordenes: 3, horas: 6, mo: 30, km: 5, repuestos: 10, terceros: 5, neto: 50 },
  ] } }),
}));
afterEach(cleanup);

describe("service machine brands", () => {
  it("groups custom brands into OTROS by machine type without changing amounts", () => {
    render(<ServiciosMaquinas desde="2026-08-01" hasta="2026-08-31" sucursal="TODAS" buscar="" tipoTiempo="TODOS" />);
    expect(screen.getByTitle("CLAAS")).toHaveClass("text-marca-claas");
    expect(screen.getByTitle("OTROS")).toHaveTextContent("OTROS");
    expect(screen.queryByText("JOHN DEERE")).not.toBeInTheDocument();
    expect(screen.queryByText("VALTRA")).not.toBeInTheDocument();
    expect(screen.getByText("$ 130")).toBeInTheDocument();
    expect(screen.getAllByText("$ 100")).toHaveLength(2);
    expect(screen.getByText("$ 80")).toBeInTheDocument();
    const row = screen.getByText("TRACTORES").parentElement!;
    expect(row.children[2]).toHaveTextContent("3");
    expect(row.children[3]).toHaveTextContent("4");
    expect(row.children[4]).toHaveTextContent("10");
    expect(screen.getByText("TRACTORES")).toBeInTheDocument();
  });
});
