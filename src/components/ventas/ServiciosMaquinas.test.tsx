import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ServiciosMaquinas } from "./ServiciosMaquinas";

vi.mock("./useServiciosIndicadores", () => ({
  useServiciosIndicadores: () => ({ loading: false, error: null, data: { por_maquina: [
    { marca: "CLAAS", tipo_maquina: "COSECHADORAS", maquinas: 2, ordenes: 3, horas: 8, mo: 100, km: 10, repuestos: 20, terceros: 0, neto: 130 },
    { marca: "JOHN DEERE", tipo_maquina: "TRACTORES", maquinas: 1, ordenes: 1, horas: 4, mo: 50, km: 0, repuestos: 0, terceros: 0, neto: 50 },
  ] } }),
}));
afterEach(cleanup);

describe("service machine brands", () => {
  it("uses the palette from Operaciones while keeping report rows and amounts", () => {
    render(<ServiciosMaquinas desde="2026-08-01" hasta="2026-08-31" sucursal="TODAS" buscar="" tipoTiempo="TODOS" />);
    expect(screen.getByTitle("CLAAS")).toHaveClass("text-marca-claas");
    expect(screen.getByTitle("JOHN DEERE")).toHaveTextContent("JOHN DEERE");
    expect(renderToStaticMarkup(<ServiciosMaquinas desde="2026-08-01" hasta="2026-08-31" sucursal="TODAS" buscar="" tipoTiempo="TODOS" />)).toContain("background-color:hsl(");
    expect(screen.getByText("$ 130")).toBeInTheDocument();
    expect(screen.getAllByText("$ 50")).toHaveLength(2);
    expect(screen.getByText("TRACTORES")).toBeInTheDocument();
  });
});
