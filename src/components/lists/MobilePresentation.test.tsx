import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompactListInfo, CompactListTable } from "./CompactListTable";
import { MobileRecord } from "./MobileRecord";
import { PartsStockTable } from "@/components/repuestos/PartsStockTable";
import type { StockMatrizRow } from "@/hooks/useRepuestos";

const viewport = vi.hoisted(() => ({ width: 390 }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: (breakpoint = 768) => viewport.width < breakpoint }));
afterEach(() => { cleanup(); viewport.width = 390; });
const row = { id: "0001", model: "MODELO CON NOMBRE LARGO", chassis: "0000123456789", customer: "CLIENTE CON APELLIDO COMPUESTO", amount: -1234.56 };
const columns = [
  { key: "model", label: "Modelo", kind: "text" as const, width: "w-1/2", value: (r: typeof row) => r.model },
  { key: "chassis", label: "Chasis", kind: "text" as const, width: "w-1/4", value: (r: typeof row) => r.chassis },
  { key: "amount", label: "Importe", kind: "number" as const, width: "w-1/4", value: (r: typeof row) => r.amount },
];
function setup() {
  const sort = vi.fn(); const select = vi.fn();
  render(<CompactListTable rows={[row]} columns={columns} id={r => r.id} label="Prueba"
    sort={{key: "model", direction: "asc"}} onSort={sort} onSelect={select}
    mobileColumns={[
      { ...columns[0], render: r => <CompactListInfo label={r.model} summary={<MobileRecord primary={r.model} secondary={r.chassis} context={r.customer} />} fields={[["Cliente", r.customer], ["Importe", String(r.amount)]]} /> },
      { ...columns[2], align: "right" },
    ]} />);
  return {sort, select};
}
describe("phone-specific record presentation", () => {
  it.each([320, 390, 639])("shows grouped identity only on a phone (%i px)", width => {
    viewport.width = width; setup();
    const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
    expect(cells).toHaveLength(2);
    expect(cells[0]).toHaveTextContent(row.model); expect(cells[0]).toHaveTextContent(row.chassis); expect(cells[0]).toHaveTextContent(row.customer);
    expect(cells[1]).toHaveTextContent("-1234.56"); expect(cells[1]).toHaveClass("text-right");
  });
  it.each([640, 768, 1280])("retains separate original columns from tablet upward (%i px)", width => {
    viewport.width = width; setup();
    const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
    expect(cells).toHaveLength(3); expect(cells[0]).not.toHaveTextContent(row.chassis);
    expect(screen.queryByRole("button", {name: "Ordenar Prueba"})).not.toBeInTheDocument();
  });
  it("offers original hidden sort fields and keeps detail separate from row actions", async () => {
    const {sort, select} = setup();
    fireEvent.click(screen.getByRole("button", {name: "Ordenar Prueba"}));
    fireEvent.click(await screen.findByRole("button", {name: /Ordenar Chasis:/}));
    expect(sort).toHaveBeenLastCalledWith("chassis");
    fireEvent.keyDown(document.activeElement!, {key: "Escape"});
    fireEvent.click(screen.getByRole("button", {name: `Detalle ${row.model}`}));
    expect(await screen.findByRole("dialog", {name: `Detalle ${row.model}`})).toHaveTextContent(row.customer);
    expect(select).not.toHaveBeenCalled();
  });
  it("forwards server-side sorting and opens exactly the original part, retaining codes, fractions and warnings", async () => {
    const part: StockMatrizRow = {codigo_interno: "REPIN00001", codigo_fabricante: "000009", descripcion: row.model, marca: "CLAAS", familia: null, unidad: "UN", santa_rita: 1.25, santa_rosa: 0, campo_9: -2, misiones: 0, katuete: 0, loma_plata: 0, total: -0.75};
    const sort = vi.fn(); const select = vi.fn();
    render(<PartsStockTable rows={[part]} sortKey="total" sortDir="desc" onSort={sort} onSelect={select} />);
    expect(within(screen.getAllByRole("row")[1]).getAllByRole("cell")).toHaveLength(2);
    expect(screen.getByText("-0,75")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Ver repuesto REPIN00001"}));
    expect(select).toHaveBeenCalledExactlyOnceWith(part);
    fireEvent.click(screen.getByRole("button", {name: "Ordenar Stock de repuestos"}));
    fireEvent.click(await screen.findByRole("button", {name: /Ordenar S. Rita:/}));
    expect(sort).toHaveBeenLastCalledWith("santa_rita");
  });
});
