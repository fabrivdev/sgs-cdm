import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SupplierFields } from "./SupplierFields";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("./managementApi", () => ({ fleetRpc: rpc }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
function Form() { const [value,setValue]=useState({ruc:"",name:""});return <SupplierFields {...value} onChange={(ruc,name)=>setValue({ruc,name})}/>; }
it("suggests by typed RUC, selects by keyboard, and clears the old name when RUC changes",async()=>{
 rpc.mockResolvedValue([{ruc:"800001-1",razon_social:"Proveedor DEMO"}]); render(<Form/>);
 const input=screen.getByRole("combobox"); fireEvent.change(input,{target:{value:"800"}});
 await screen.findByRole("option",{name:/Proveedor DEMO/});
 expect(rpc).toHaveBeenCalledWith("fleet_search_suppliers",{p_ruc:"800"});
 fireEvent.keyDown(input,{key:"ArrowDown"});fireEvent.keyDown(input,{key:"Enter"});
 expect(screen.getByLabelText("Proveedor")).toHaveValue("Proveedor DEMO");
 expect(screen.getByLabelText("Proveedor")).toHaveAttribute("readonly");
 fireEvent.change(input,{target:{value:"900"}});expect(screen.getByLabelText("Proveedor")).toHaveValue("");
});
it("shows no match without fabricating a supplier",async()=>{
 rpc.mockResolvedValue([]);render(<Form/>);fireEvent.change(screen.getByRole("combobox"),{target:{value:"999"}});
 await screen.findByText("Sin coincidencias en el maestro");expect(screen.getByLabelText("Proveedor")).toHaveValue("");
});
