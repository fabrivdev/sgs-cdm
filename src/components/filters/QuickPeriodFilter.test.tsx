import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuickPeriodFilter } from "./QuickPeriodFilter";
import { quickPeriodPresets } from "./quickPeriodPresets";

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("quick period filter", () => {
  it("offers the same seven shortcuts and recognizes an exact range", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-25T12:00:00"));
    const presets = quickPeriodPresets(new Date("2026-09-25T12:00:00"));
    expect(presets.map(preset => preset.label)).toEqual([
      "Semana actual", "Semana anterior", "Semana anterior + actual", "Este mes",
      "Últimos 6 meses", "Últimos 12 meses", "Este año",
    ]);
    const onChange = vi.fn();
    render(<QuickPeriodFilter from="2026-09-01" to="2026-09-30" onChange={onChange} />);
    const selector = screen.getByRole("combobox", { name: "Período rápido" });
    expect(selector).toHaveValue("current-month");
    fireEvent.change(selector, { target: { value: "previous-week" } });
    expect(onChange).toHaveBeenCalledWith(presets[1].from, presets[1].to, "dia");
  });

  it("keeps manual ranges custom and cuts current-year productivity at today", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-25T12:00:00"));
    const onChange = vi.fn();
    render(<QuickPeriodFilter from="2026-08-03" to="2026-09-18" endAtToday onChange={onChange} />);
    const selector = screen.getByRole("combobox", { name: "Período rápido" });
    expect(selector).toHaveValue("");
    fireEvent.change(selector, { target: { value: "current-year" } });
    expect(onChange).toHaveBeenCalledWith("2026-01-01", "2026-09-25", "mes");
  });
});
