import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MaintenanceGroupCell } from "./MaintenanceGroupCell";
afterEach(cleanup);
it("opens the complete group by click or focus without opening the row", () => {
  const row = vi.fn();
  render(
    <div onClick={row}>
      <MaintenanceGroupCell
        group="Filtros"
        works={[
          { name: "Filtro de aceite", observation: "Original" },
          { name: "Filtro de aire", observation: null },
          { name: "Filtro de combustible", observation: null },
        ]}
      />
    </div>,
  );
  const mark = screen.getByRole("button", { name: "Consultar Filtros" });
  fireEvent.click(mark);
  expect(screen.getByText("Filtro de combustible")).toBeInTheDocument();
  expect(screen.getByText("Original")).toBeInTheDocument();
  expect(row).not.toHaveBeenCalled();
});
it("supports keyboard focus and does not mark absent groups", () => {
  render(
    <>
      <MaintenanceGroupCell
        group="Filtros"
        works={[{ name: "Filtro de aceite", observation: null }]}
      />
      <MaintenanceGroupCell group="Otros" works={[]} />
    </>,
  );
  fireEvent.focus(screen.getByRole("button", { name: "Consultar Filtros" }));
  expect(screen.getByText("Filtro de aceite")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Consultar Otros" }),
  ).not.toBeInTheDocument();
});
