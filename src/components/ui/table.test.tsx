import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TableHead } from "./table";
afterEach(cleanup);
describe("sortable native headers",()=>{
  it("supports Enter and Space without making plain headers interactive",()=>{
    const click=vi.fn();
    render(<table><thead><tr><TableHead onClick={click}>Código</TableHead><TableHead>Acciones</TableHead></tr></thead></table>);
    const header=screen.getByRole("columnheader",{name:"Código"});
    expect(header).toHaveAttribute("tabindex","0");
    fireEvent.keyDown(header,{key:"Enter"});fireEvent.keyDown(header,{key:" "});
    expect(click).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("columnheader",{name:"Acciones"})).not.toHaveAttribute("tabindex");
  });
  it("respects caller preventDefault and never double-activates a nested control",()=>{
    const click=vi.fn();
    render(<table><thead><tr><TableHead onClick={click} onKeyDown={e=>e.preventDefault()}><button>Ordenar</button></TableHead></tr></thead></table>);
    fireEvent.keyDown(screen.getByRole("columnheader"),{key:"Enter"});
    fireEvent.keyDown(screen.getByRole("button"),{key:" "});
    expect(click).not.toHaveBeenCalled();
  });
});
