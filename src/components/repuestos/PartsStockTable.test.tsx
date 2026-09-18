import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StockMatrizRow } from "@/hooks/useRepuestos";
import { PartsStockTable } from "./PartsStockTable";

const row: StockMatrizRow = {
  codigo_interno: "REPIN000001", codigo_fabricante: "000123", marca: "CLAAS",
  descripcion: "DESCRIPCIÓN EXTENSA DE PRUEBA PARA CONSERVAR EL TEXTO COMPLETO", familia: "RODAMIENTOS Y BUJES", unidad: "UN",
  santa_rita: 1000.25, santa_rosa: 0, campo_9: -2, misiones: 3, loma_plata: 4, katuete: 5, total: 1010.25,
};
afterEach(cleanup);
function setup(rows = [row]) {
  const onSort = vi.fn(); const onSelect = vi.fn();
  return { ...render(<PartsStockTable rows={rows} sortKey="total" sortDir="desc" onSort={onSort} onSelect={onSelect} />), onSort, onSelect };
}
describe("compact parts stock table", () => {
  it("separates all identity and branch fields without stacking records", () => {
    const { container } = setup();
    const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
    expect(cells).toHaveLength(12);
    expect(cells.slice(0, 5).map(cell => cell.textContent)).toEqual([row.codigo_interno, row.codigo_fabricante, row.marca, row.descripcion, row.familia]);
    expect(container.querySelectorAll("td p, td br, td .flex-wrap")).toHaveLength(0);
    cells.forEach(cell => expect(cell.children).toHaveLength(1));
    cells.forEach(cell => expect(cell).toHaveClass("whitespace-nowrap", "overflow-hidden"));
    expect(container.querySelector("table")).toHaveClass("table-fixed");
    expect(container.querySelector('[class*="min-w-["]')).toBeNull();
  });
  it("aligns numeric headers and values on the same centered axis without suffixes", () => {
    setup(); const heads = screen.getAllByRole("columnheader");
    const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
    for (let index = 5; index < 12; index++) {
      expect(heads[index]).toHaveClass("text-center"); expect(cells[index]).toHaveClass("text-center");
      expect(within(heads[index]).getByRole("button")).toHaveClass("justify-center");
    }
    expect(cells[5].textContent).toBe("1.000,25"); expect(cells[6].textContent).toBe("0"); expect(cells[7].textContent).toBe("-2");
    expect(cells[11].textContent).toBe("1.010,25"); expect(cells[6]).toHaveClass("text-destructive/70");
    expect(heads[11]).toHaveAttribute("aria-sort", "descending");
  });
  it("preserves existing global sorting callbacks without sorting only the page", () => {
    const { onSort } = setup();
    const keys = ["codigo_interno", "descripcion", "santa_rita", "santa_rosa", "campo_9", "misiones", "loma_plata", "katuete", "total"];
    screen.getAllByRole("button").forEach((button, index) => { fireEvent.click(button); expect(onSort).toHaveBeenLastCalledWith(keys[index]); });
    // These fields are displayed separately; extending their server-order
    // contract is a later step, never an apparent order of 50 local rows.
    for (const index of [1, 2, 4]) expect(within(screen.getAllByRole("columnheader")[index]).queryByRole("button")).toBeNull();
  });
  it("retains source order, full hover values and opening the original product", () => {
    const second = { ...row, codigo_interno: "REPIN000002", total: 2000 };
    const { onSelect } = setup([row, second]);
    expect(within(screen.getAllByRole("row")[1]).getAllByRole("cell")[0].textContent).toBe(row.codigo_interno);
    expect(screen.getAllByTitle(`${row.descripcion} · Fabricante: ${row.codigo_fabricante} · Familia: ${row.familia}`)).toHaveLength(2);
    fireEvent.click(screen.getAllByText(row.descripcion)[0]); expect(onSelect).toHaveBeenCalledWith(row);
    expect(screen.getAllByText("CLAAS")[0].closest("[title=CLAAS]")).toHaveClass("text-marca-claas");
  });
  it("keeps four readable columns on narrow screens and secondary values in the detail/export", () => {
    setup(); const heads = screen.getAllByRole("columnheader");
    expect(heads.filter(head => !head.classList.contains("hidden")).map(head => head.textContent)).toEqual(["Código", "Marca", "Descripción", "Total"]);
    expect(heads.filter(head => head.classList.contains("hidden"))).toHaveLength(8);
    expect(screen.getByText("000123").closest("td")).toHaveClass("hidden", "lg:table-cell");
  });
  it("shows absent identifiers as absent without inventing a code or changing zero stock", () => {
    setup([{ ...row, codigo_fabricante: null, familia: null }]); expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
