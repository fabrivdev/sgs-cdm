import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSalesSectionExport } from "./SalesSectionExports";
import { render } from "./salesSectionExports.test-support";

afterEach(cleanup);
function Table({ id, value, exporter, allowed = true }: { id: string; value: number; exporter: (value: number) => void; allowed?: boolean }) {
  useSalesSectionExport({ id, label: `Exportar ${id}`, onSelect: () => exporter(value) }, allowed);
  return <div>{id}</div>;
}
describe("sales export registry", () => {
  it("registers multiple tables in one menu, uses latest values and removes inactive tabs", async () => {
    const exporter = vi.fn();
    const view = render(<><Table id="Períodos" value={1} exporter={exporter} /><Table id="Resumen" value={2} exporter={exporter} /></>);
    expect(screen.getAllByRole("button", { name: "Acciones de la sección" })).toHaveLength(1);
    view.rerender(<><Table id="Períodos" value={10} exporter={exporter} /><Table id="Detalle" value={20} exporter={exporter} /></>);
    fireEvent.keyDown(screen.getByRole("button", { name: "Acciones de la sección" }), { key: "Enter" });
    expect(screen.queryByRole("menuitem", { name: "Exportar Resumen" })).not.toBeInTheDocument();
    expect(await screen.findByRole("menuitem", { name: "Exportar Detalle" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Exportar Períodos" }));
    await waitFor(() => expect(exporter).toHaveBeenCalledWith(10));
    view.rerender(<Table id="Períodos" value={10} exporter={exporter} allowed={false} />);
    expect(screen.queryByRole("button", { name: "Acciones de la sección" })).not.toBeInTheDocument();
  });
});
