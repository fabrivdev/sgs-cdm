import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Repuestos from "./Repuestos";
import { STOCK_FILTROS_VACIOS, type StockMatrizRow } from "@/hooks/useRepuestos";

const mocks = vi.hoisted(() => ({
  stock: vi.fn(), full: vi.fn(), can: vi.fn(), refetch: vi.fn(),
  sheet: vi.fn((data: Record<string, unknown>[]) => ({ data })), book: vi.fn(() => ({})), append: vi.fn(), write: vi.fn(),
}));
vi.mock("@/hooks/useRepuestos", async importOriginal => ({
  ...(await importOriginal<typeof import("@/hooks/useRepuestos")>()),
  useStockMatriz: mocks.stock, useFamiliasStock: () => ({ data: [] }), fetchStockMatrizCompleto: mocks.full,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ isAdmin: false, isJefatura: false, isSuperAdmin: false, can: mocks.can }) }));
vi.mock("@/hooks/useSugerenciasCompra", () => ({ useSugerenciaProducto: () => ({ data: null }) }));
vi.mock("@/components/repuestos/DetalleRepuestoSheet", () => ({ DetalleRepuestoSheet: ({ producto }: { producto: StockMatrizRow | null }) => <output aria-label="Producto seleccionado">{producto?.codigo_interno}</output> }));
vi.mock("xlsx", () => ({ utils: { json_to_sheet: mocks.sheet, book_new: mocks.book, book_append_sheet: mocks.append }, writeFile: mocks.write }));
const row: StockMatrizRow = {
  codigo_interno: "REPIN000001", codigo_fabricante: "000123", descripcion: "Rodamiento", marca: "CLAAS", familia: "BUJES", unidad: "UN",
  santa_rita: 5, santa_rosa: 0, campo_9: 0, misiones: 0, loma_plata: 0, katuete: 0, total: 5,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  mocks.can.mockReturnValue(true);
  mocks.stock.mockReturnValue({ data: { rows: [row], count: 51 }, isLoading: false, isError: false, isFetching: false, refetch: mocks.refetch });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("Stock catalogue integration", () => {
  it("retains server sorting both ways, pagination and selection", async () => {
    render(<Repuestos />);
    expect(mocks.stock).toHaveBeenLastCalledWith(STOCK_FILTROS_VACIOS, 0, "total", "desc");
    fireEvent.click(screen.getByRole("button", { name: "Ordenar Código: A a Z" }));
    await waitFor(() => expect(mocks.stock).toHaveBeenLastCalledWith(STOCK_FILTROS_VACIOS, 0, "codigo_interno", "asc"));
    fireEvent.click(screen.getByRole("button", { name: "Ordenar Código: Z a A" }));
    await waitFor(() => expect(mocks.stock).toHaveBeenLastCalledWith(STOCK_FILTROS_VACIOS, 0, "codigo_interno", "desc"));
    fireEvent.click(screen.getByText("Rodamiento")); expect(screen.getByLabelText("Producto seleccionado")).toHaveTextContent(row.codigo_interno);
    expect(screen.getByText("Página 1 de 2 (51 productos)")).toBeInTheDocument();
  });
  it("exports the whole filtered server result, retaining codes and quantities", async () => {
    mocks.full.mockResolvedValue(Array.from({ length: 51 }, (_, index) => ({ ...row, codigo_interno: `REPIN${String(index + 1).padStart(6, "0")}` })));
    render(<Repuestos />);
    const filters = screen.getByRole("button", { name: /Más filtros/ });
    const actions = screen.getByRole("button", { name: "Acciones de la sección" });
    expect(filters.nextElementSibling).toContainElement(actions);
    fireEvent.keyDown(actions, { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Exportar stock por sucursal" }));
    await waitFor(() => expect(mocks.write).toHaveBeenCalled());
    expect(mocks.full).toHaveBeenCalledWith(STOCK_FILTROS_VACIOS, "total", "desc");
    const exported = mocks.sheet.mock.calls[0][0] as unknown as Record<string, unknown>[];
    expect(exported).toHaveLength(51); expect(exported[0]).toMatchObject({ "Código interno": "REPIN000001", "Código fabricante": "000123", "Santa Rita": 5, "Stock total": 5 });
  });
  it("does not give export access to a user without the existing permission", () => {
    mocks.can.mockReturnValue(false); render(<Repuestos />);
    expect(screen.queryByRole("button", { name: "Acciones de la sección" })).toBeNull();
    expect(mocks.full).not.toHaveBeenCalled();
  });
  it("preserves errors and retry instead of treating a failure as zero stock", () => {
    mocks.stock.mockReturnValue({ isLoading: false, isError: true, isFetching: false, refetch: mocks.refetch });
    render(<Repuestos />); expect(screen.getByText("No se pudo cargar el catálogo de stock.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull(); fireEvent.click(screen.getByRole("button", { name: "Reintentar" })); expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });
});
