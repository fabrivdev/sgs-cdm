import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FiltersBar } from "./FiltersBar";

const changed = vi.fn();

function SearchHarness({ initial = "", otherActive = false }: { initial?: string; otherActive?: boolean }) {
  const [value, setValue] = useState(initial);
  const [other, setOther] = useState(otherActive);
  const [renderCount, setRenderCount] = useState(0);
  return <>
    <FiltersBar
      search={{ value, onChange: next => { changed(next); setValue(next); } }}
      activeCount={Number(Boolean(value)) + Number(other)}
      onClear={() => { setValue(""); setOther(false); }}
    >
      <span>Otro filtro</span>
    </FiltersBar>
    <output data-testid="search-value">{value}</output>
    <button onClick={() => setValue("")}>Restablecer desde fuera</button>
    <button onClick={() => setValue("HORSCH")}>Cambiar desde fuera</button>
    <button onClick={() => setRenderCount(count => count + 1)}>Render {renderCount}</button>
  </>;
}

const advance = (milliseconds: number) => act(() => { vi.advanceTimersByTime(milliseconds); });
const type = (value: string) => fireEvent.change(screen.getAllByRole("searchbox")[0], { target: { value } });
const clearSearch = () => fireEvent.click(screen.getAllByRole("button", { name: "Limpiar búsqueda" })[0]);
const expectValue = (value: string) => {
  for (const input of screen.getAllByRole("searchbox", { hidden: true })) expect(input).toHaveValue(value);
  expect(screen.getByTestId("search-value").textContent).toBe(value);
};
const clearFilters = () => {
  fireEvent.click(screen.getByRole("button", { name: "Más filtros" }));
  fireEvent.click(screen.getByRole("button", { name: /^Limpiar/ }));
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  changed.mockReset();
});

describe("FiltersBar controlled search", () => {
  it("uses one accessible custom clear control per responsive search and suppresses the native cancel", () => {
    render(<SearchHarness initial="CLAAS" />);

    const inputs = screen.getAllByRole("searchbox", { hidden: true });
    const clearButtons = screen.getAllByRole("button", { name: /^Limpiar b.squeda$/, hidden: true });

    expect(inputs).toHaveLength(2);
    expect(clearButtons).toHaveLength(inputs.length);
    for (const input of inputs) {
      expect(input).toHaveClass("filters-bar-search");
      expect(within(input.parentElement!).getAllByRole("button", { name: /^Limpiar b.squeda$/, hidden: true })).toHaveLength(1);
    }

    fireEvent.click(clearButtons[0]);
    expectValue("");
    expect(changed).toHaveBeenCalledExactlyOnceWith("");
  });

  it("debounces typing for 250 ms and commits only the latest draft", () => {
    render(<SearchHarness />);
    type("CLA");
    advance(200);
    type("CLAAS");
    advance(249);
    expect(changed).not.toHaveBeenCalled();
    advance(1);
    expect(changed).toHaveBeenCalledExactlyOnceWith("CLAAS");
    expectValue("CLAAS");
  });

  it("keeps a committed search cleared after X, rerenders and repeated clears", () => {
    render(<SearchHarness />);
    type("CLAAS");
    advance(250);
    changed.mockClear();
    clearSearch();
    expectValue("");
    fireEvent.click(screen.getByRole("button", { name: "Render 0" }));
    advance(1000);
    expectValue("");
    expect(changed).toHaveBeenCalledExactlyOnceWith("");
    type("HORSCH");
    advance(250);
    clearSearch();
    advance(1000);
    expectValue("");
  });

  it("cancels a pending draft when X clears the committed search", () => {
    render(<SearchHarness initial="CLAAS" />);
    type("HORSCH");
    advance(100);
    clearSearch();
    advance(1000);
    expectValue("");
    expect(changed).toHaveBeenCalledExactlyOnceWith("");
  });

  it("keeps an applied search cleared by the filter-panel reset", () => {
    render(<SearchHarness initial="CLAAS" />);
    clearFilters();
    advance(1000);
    expectValue("");
    expect(screen.getByRole("button", { name: "Limpiar" })).toBeDisabled();
    expect(changed).not.toHaveBeenCalled();
  });

  it("cancels pending text on panel reset even when the parent search is already empty", () => {
    render(<SearchHarness otherActive />);
    type("CLAAS");
    advance(100);
    clearFilters();
    advance(1000);
    expectValue("");
    expect(changed).not.toHaveBeenCalled();
  });

  it("accepts an external replacement instead of emitting the prior search back", () => {
    render(<SearchHarness initial="CLAAS" />);
    fireEvent.click(screen.getByRole("button", { name: "Cambiar desde fuera" }));
    advance(1000);
    expectValue("HORSCH");
    expect(changed).not.toHaveBeenCalled();
  });

  it("cancels pending input after an external reset", () => {
    render(<SearchHarness initial="CLAAS" />);
    type("HORSCH");
    advance(100);
    fireEvent.click(screen.getByRole("button", { name: "Restablecer desde fuera" }));
    advance(1000);
    expectValue("");
    expect(changed).not.toHaveBeenCalled();
  });

  it("does not postpone typing on unrelated parent rerenders or callback identity changes", () => {
    render(<SearchHarness />);
    type("CLAAS");
    advance(200);
    fireEvent.click(screen.getByRole("button", { name: "Render 0" }));
    advance(50);
    expectValue("CLAAS");
    expect(changed).toHaveBeenCalledExactlyOnceWith("CLAAS");
  });

  it("cancels a pending change on unmount", () => {
    const view = render(<SearchHarness />);
    type("CLAAS");
    view.unmount();
    advance(1000);
    expect(changed).not.toHaveBeenCalled();
  });

  it("cancels a pending change when search is removed and later restored", () => {
    const view = render(<FiltersBar search={{ value: "", onChange: changed }} />);
    type("CLAAS");
    view.rerender(<FiltersBar />);
    view.rerender(<FiltersBar search={{ value: "", onChange: changed }} />);
    advance(1000);
    expect(changed).not.toHaveBeenCalled();
    for (const input of screen.getAllByRole("searchbox")) expect(input).toHaveValue("");
  });
});
