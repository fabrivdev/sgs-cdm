import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ParqueClientes from "./ParqueClientes";

const mocks = vi.hoisted(() => ({ can: vi.fn(), machines: vi.fn() }));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ can: mocks.can }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));
vi.mock("@/components/parque/ParqueTab", () => ({ ParqueTab: () => null }));
vi.mock("@/components/parque/StockMaquinasTab", () => ({ StockMaquinasTab: () => null }));
vi.mock("@/components/parque/ClientePanel", () => ({ ClientePanel: () => null }));
vi.mock("@/components/parque/MaquinasTab", () => ({
  MaquinasTab: (props: unknown) => {
    mocks.machines(props);
    return <div>Máquinas</div>;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.can.mockReturnValue(true);
});
afterEach(cleanup);

describe("Parque: acción nativa de creación", () => {
  it("mantiene Nueva máquina en el encabezado y controla el drawer existente", () => {
    render(<MemoryRouter initialEntries={["/parque-maquinas"]}><ParqueClientes /></MemoryRouter>);

    const create = screen.getByRole("button", { name: "Nueva máquina" });
    expect(create.closest("header")).toBeInTheDocument();
    expect(create).toHaveClass("max-sm:w-11", "max-sm:px-0");
    expect(create.parentElement).toHaveClass("[&_button]:min-h-11");
    expect(screen.queryByText("Nueva", { selector: "button" })).not.toBeInTheDocument();

    fireEvent.click(create);
    expect(mocks.machines.mock.calls.at(-1)?.[0]).toMatchObject({ newMachineOpen: true });
  });

  it("no expone la creación sin permiso de gestión", () => {
    mocks.can.mockReturnValue(false);
    render(<MemoryRouter initialEntries={["/parque-maquinas"]}><ParqueClientes /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: "Nueva máquina" })).not.toBeInTheDocument();
  });
});
