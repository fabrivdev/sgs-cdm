import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ServiceSalesTextFilter } from "./ServiceSalesTextFilter";
import { serviceFiltersKey, serviceFilteredRequest, serviceFilteredError } from "./serviceSalesFilters";

afterEach(()=>{cleanup();vi.useRealTimers();});
describe("service filter controls",()=>{
  it("commits pending text before Apply closes the filter panel and on Enter",()=>{
    vi.useFakeTimers(); const onChange=vi.fn();
    render(<ServiceSalesTextFilter label="Código" value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole("searchbox"),{target:{value:"MA01"}});
    fireEvent.blur(screen.getByRole("searchbox"));
    expect(onChange).toHaveBeenCalledWith("MA01");
    fireEvent.change(screen.getByRole("searchbox"),{target:{value:"KM01"}});
    fireEvent.keyDown(screen.getByRole("searchbox"),{key:"Enter"});
    expect(onChange).toHaveBeenLastCalledWith("KM01");
  });
  it("debounces typing and cancels pending edits on external clear",()=>{
    vi.useFakeTimers();const onChange=vi.fn();
    const view=render(<ServiceSalesTextFilter label="Cliente" value="old" onChange={onChange} />);
    fireEvent.change(screen.getByRole("searchbox"),{target:{value:"new"}});
    act(()=>{vi.advanceTimersByTime(349);});expect(onChange).not.toHaveBeenCalled();
    act(()=>{vi.advanceTimersByTime(1);});expect(onChange).toHaveBeenCalledWith("new");
    onChange.mockClear();fireEvent.change(screen.getByRole("searchbox"),{target:{value:"pending"}});
    view.rerender(<ServiceSalesTextFilter label="Cliente" value="" onChange={onChange} />);
    act(()=>{vi.advanceTimersByTime(1000);});expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });
  it("uses stable trimmed keys and original RPCs when advanced filters are empty",()=>{
    expect(serviceFiltersKey({cliente:" A ",os:"OS1",factura:"  "})).toBe(serviceFiltersKey({os:"OS1",cliente:"A"}));
    expect(serviceFilteredRequest("ventas_servicios_lineas_v2",serviceFiltersKey({cliente:" "}))).toEqual({name:"ventas_servicios_lineas_v2",params:{}});
    expect(serviceFilteredRequest("ventas_servicios_lineas_v2",serviceFiltersKey({documento:"nc"}))).toEqual({name:"ventas_servicios_lineas_v2_filtrado",params:{p_filtros:{documento:"nc"}}});
  });
  it("names the required SQL and never pretends filters were applied",()=>{
    expect(serviceFilteredError({code:"PGRST202"},'{"documento":"nc"}')).toContain("20260917180000");
    expect(serviceFilteredError({message:"network error"},"{}")).toBe("network error");
  });
});
