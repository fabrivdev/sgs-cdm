import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PurchaseSuggestionTable } from "./PurchaseSuggestionTable";
import type { ResultadoSugerencia } from "@/hooks/useSugerenciasCompra";
import { suggestionColumns, suggestionCoverage, orderSuggestions } from "@/lib/suggestionTableOrder";

const row = {
  producto_codigo: "REPIN003344", codigo_fabricante: "24767405", marca: "CLAAS",
  descripcion: "CASQUILLO 24X3.5 6GV 24767405", familia: "RODAMIENTOS Y BUJES",
  abc: "B", fsn: "F", xyz: "Y", segmento: "DEMANDA VOLATIL", stock_global: 260,
  unidades_12m: 1700, demanda_ponderada_mensual: 133.6, stock_objetivo: 958.7,
  sugerencia_unidades: 699, ultima_venta: "2026-08-24", dias_ultima_venta: 7,
  confianza_datos: "BAJA", tipo_stock_seguridad: "ESTIMADA", estado_datos: "LISTO",
  stock_minimo_estrategico: 0,
} as ResultadoSugerencia;
afterEach(cleanup);
function setup(rows = [row]) {
  const onSort = vi.fn(); const onSelect = vi.fn();
  const view = render(<PurchaseSuggestionTable rows={rows} sort={{ key: "sugerencia_unidades", direction: "desc" }}
    onSort={onSort} onSelect={onSelect} leadTimeMonths={3} />);
  return { ...view, onSort, onSelect };
}
describe("compact purchase suggestion table", () => {
  it("uses one-line separate identity/classification cells and the shared brand color", () => {
    const { container } = setup();
    const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
    expect(cells).toHaveLength(12);
    expect(cells.slice(0, 6).map(cell => cell.textContent)).toEqual([
      "CLAAS", "REPIN003344", "24767405", row.descripcion, "BFY", "DEMANDA VOLATIL",
    ]);
    expect(screen.getByText("CLAAS").closest("[title=CLAAS]")).toHaveClass("text-marca-claas");
    expect(container.querySelectorAll("td p, td br, .flex-wrap")).toHaveLength(0);
    expect(container.querySelector("table")).toHaveClass("table-fixed");
    expect(container.querySelector('[class*="min-w-["]')).toBeNull();
    expect(screen.getByTitle(`ABC (participación económica): B · FSN (rotación): F · XYZ (variabilidad): Y`)).toBeInTheDocument();
    expect(screen.getByTitle(`${row.descripcion} · Familia: ${row.familia}`)).toBeInTheDocument();
  });
  it("centers numeric headers and data, retains values and removes unit/age suffixes", () => {
    setup(); const heads = screen.getAllByRole("columnheader");
    const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
    for (const index of [6, 7, 8, 10, 11]) {
      expect(heads[index]).toHaveClass("text-center"); expect(cells[index]).toHaveClass("text-center");
      expect(within(heads[index]).getByRole("button")).toHaveClass("justify-center");
    }
    expect(cells[7].textContent).toBe("133,6"); expect(cells[8].textContent).toBe("1,8");
    expect(cells[10].textContent).toBe("958,7"); expect(cells[11].textContent).toBe("699");
    expect(cells[9].textContent).not.toContain("7 d");
    expect(screen.getByTitle("7 días desde la última venta al corte del análisis")).toBeInTheDocument();
  });
  it("preserves the real-12m coverage basis and distinguishes weighted demand", () => {
    setup(); expect(suggestionCoverage(row)).toBeCloseTo(260 / (1700 / 12));
    expect(suggestionCoverage({ ...row, unidades_12m: 0 })).toBeNull();
    expect(suggestionCoverage({ ...row, unidades_12m: -1 })).toBeNull();
    expect(screen.getByText("Dem. pond.")).toBeInTheDocument();
    expect(screen.getByText("Cobertura 12m")).toBeInTheDocument();
    expect(screen.getByTitle(/no usa la demanda ponderada/)).toBeInTheDocument();
  });
  it("keeps row-level quality warnings and opening the original detail", () => {
    const { onSelect } = setup();
    expect(screen.getAllByLabelText("Confianza baja · Stock de seguridad estimado")).toHaveLength(2);
    fireEvent.click(screen.getByText(row.descripcion)); expect(onSelect).toHaveBeenCalledWith(row);
  });
  it("sorts every header through the parent server-order callback and exposes direction", () => {
    const { onSort } = setup();
    screen.getAllByRole("columnheader").forEach((head, index) => {
      fireEvent.click(within(head).getByRole("button"));
      expect(onSort).toHaveBeenLastCalledWith(suggestionColumns[index].key);
    });
    expect(screen.getAllByRole("columnheader")[11]).toHaveAttribute("aria-sort", "descending");
  });
  it("retains missing values and the empty state without fabricating sales", () => {
    const view = setup([{ ...row, codigo_fabricante: null, ultima_venta: null, dias_ultima_venta: null, unidades_12m: 0 }]);
    expect(screen.getAllByText("—")).toHaveLength(3);
    view.unmount(); setup([]); expect(screen.getByRole("cell")).toHaveAttribute("colspan", "12");
  });
  it("retains five readable columns and quality warnings on phones without losing secondary fields", () => {
    setup();
    const heads = screen.getAllByRole("columnheader");
    expect(heads.filter(head => !head.classList.contains("hidden")).map(head => head.textContent)).toEqual([
      "Marca", "Código", "Descripción", "Stock", "Sugerencia",
    ]);
    expect(heads.filter(head => head.classList.contains("hidden"))).toHaveLength(7);
    expect(screen.getAllByLabelText("Confianza baja · Stock de seguridad estimado")[0]).toHaveClass("md:hidden");
  });
  it("orders identity/segment fields naturally, with absent codes last in both directions", () => {
    const rows = [{ ...row, producto_codigo: "REP10", codigo_fabricante: null, segmento: "B" },
      { ...row, producto_codigo: "REP2", codigo_fabricante: "FAB2", segmento: "A" }];
    expect(orderSuggestions(rows, { key: "producto_codigo", direction: "asc" })[0].producto_codigo).toBe("REP2");
    for (const direction of ["asc", "desc"] as const) {
      expect(orderSuggestions(rows, { key: "codigo_fabricante", direction }).at(-1)?.codigo_fabricante).toBeNull();
    }
    expect(orderSuggestions(rows, { key: "segmento", direction: "asc" })[0].segmento).toBe("A");
  });
});
