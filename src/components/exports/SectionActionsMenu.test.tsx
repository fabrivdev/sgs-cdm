import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SectionActionsMenu } from "./SectionActionsMenu";
import { TableExportButton } from "./TableExportButton";
import { FiltersBar, FilterCustom } from "@/components/filters/FiltersBar";

const xlsx = vi.hoisted(() => ({ utils: { json_to_sheet: vi.fn(() => ({})), book_new: vi.fn(() => ({})), book_append_sheet: vi.fn() }, writeFile: vi.fn() }));
vi.mock("xlsx", () => xlsx);
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
const open = () => fireEvent.keyDown(screen.getByRole("button", { name: "Acciones de la sección" }), { key: "Enter" });

describe("section actions", () => {
  it("has one entry point after Más filtros, including while the filter drawer is open", async () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    render(<FiltersBar secondaryActions={<SectionActionsMenu options={[{ id: "excel", label: "Exportar tabla", onSelect: vi.fn() }]} />}>
      <FilterCustom label="Estado"><input aria-label="Estado" /></FilterCustom>
    </FiltersBar>);
    const filters = screen.getByRole("button", { name: "Más filtros" });
    const actions = screen.getByRole("button", { name: "Acciones de la sección" });
    expect(filters.nextElementSibling).toContainElement(actions);
    expect(screen.queryByRole("button", { name: /Exportar/ })).not.toBeInTheDocument();
    fireEvent.click(filters);
    await screen.findByRole("dialog");
    expect(document.querySelectorAll('button[aria-label="Acciones de la sección"]')).toHaveLength(1);
    expect(screen.getByRole("dialog").querySelector('button[aria-label="Acciones de la sección"]')).toBeNull();
  });
  it("keeps the same rows, workbook, file and sheet name for an existing exporter", async () => {
    const rows = [{ Código: "000001", Facturado: -10.25 }];
    const fetchRows = vi.fn(() => rows);
    render(<TableExportButton options={[{ label: "Detalle", filename: "detalle.xlsx", sheetName: "Detalle", rows: fetchRows }]} />);
    expect(fetchRows).not.toHaveBeenCalled();
    open(); fireEvent.click(await screen.findByRole("menuitem", { name: "Exportar Detalle" }));
    await waitFor(() => expect(xlsx.writeFile).toHaveBeenCalledWith(expect.anything(), "detalle.xlsx"));
    expect(fetchRows).toHaveBeenCalledTimes(1);
    expect(xlsx.utils.json_to_sheet).toHaveBeenCalledWith(rows);
    expect(xlsx.utils.book_append_sheet).toHaveBeenCalledWith(expect.anything(), expect.anything(), "Detalle");
  });
  it("blocks unavailable exports, prevents overlapping exports, and supports retry after failure", async () => {
    let reject!: (error: Error) => void;
    const exporter = vi.fn().mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; })).mockResolvedValue(undefined);
    render(<SectionActionsMenu options={[{ id: "ready", label: "Exportar tabla", onSelect: exporter }, { id: "empty", label: "Exportar vacía", disabled: true, onSelect: vi.fn() }]} />);
    open();
    expect(await screen.findByRole("menuitem", { name: "Exportar vacía" })).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("menuitem", { name: "Exportar tabla" }));
    expect(screen.getByRole("button", { name: "Acciones de la sección" })).toBeDisabled();
    reject(new Error("download"));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo exportar.");
    open(); fireEvent.click(await screen.findByRole("menuitem", { name: "Exportar tabla" }));
    await waitFor(() => expect(exporter).toHaveBeenCalledTimes(2));
  });
});
