import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SalesDataTable, type SalesDisplayColumn } from "./SalesDataTable";
import { serviceNumberColumn, serviceMoneyColumn } from "./serviceSalesColumns";

const { can, exportTable } = vi.hoisted(() => ({ can: vi.fn(), exportTable: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ can }) }));
vi.mock("./salesTableExport", () => ({ exportSalesTable: exportTable }));
type Row = { id: string; name: string; amount: number; qty: number | null };
const columns: SalesDisplayColumn<Row>[] = [
  { key: "name", label: "Nombre", kind: "text", value: row=>row.name, weight: 2 },
  serviceNumberColumn<Row>("qty", "Cantidad", row=>row.qty),
  serviceMoneyColumn<Row>("amount", "Facturado", row=>row.amount),
];
const rows: Row[] = [{id:"a",name:"Texto largo completo",amount:-9.25,qty:null},{id:"b",name:"REP10",amount:1000,qty:0},{id:"c",name:"REP2",amount:9,qty:3}];
const props = { title:"Prueba ventas", rows, columns, initialSort:{key:"amount",direction:"desc" as const}, rowKey:(row:Row)=>row.id, fileName:"ventas.xlsx" };
beforeEach(()=>{can.mockReturnValue(true);});
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe("shared sales table",()=>{
  it("sorts by original numbers, nulls last both ways, keeps every row and matching axes",()=>{
    render(<SalesDataTable {...props} />);
    const dataRows=()=>within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(dataRows().map(row=>row.children[0].textContent)).toEqual(["REP10","REP2","Texto largo completo"]);
    fireEvent.click(screen.getByRole("button",{name:/Ordenar Cantidad/}));
    expect(dataRows().map(row=>row.children[0].textContent)).toEqual(["REP10","REP2","Texto largo completo"]);
    fireEvent.click(screen.getByRole("button",{name:/Ordenar Cantidad/}));
    expect(dataRows().map(row=>row.children[0].textContent)).toEqual(["REP2","REP10","Texto largo completo"]);
    expect(screen.getByRole("button",{name:/Ordenar Nombre/})).toHaveClass("justify-start");
    expect(screen.getByRole("button",{name:/Ordenar Cantidad/})).toHaveClass("justify-center");
    expect(screen.getByRole("button",{name:/Ordenar Facturado/})).toHaveClass("justify-end");
    expect(screen.getByTitle("Texto largo completo")).toHaveClass("truncate");
  });
  it("keeps the period total outside sorting and exports it last without another request",async()=>{
    const footer={id:"footer",name:"Total del período",amount:999.75,qty:3};
    render(<SalesDataTable {...props} footer={footer} />);
    fireEvent.click(screen.getByRole("button",{name:/Ordenar Nombre/}));
    expect(within(screen.getByRole("table")).getAllByRole("row").at(-1)).toHaveTextContent("Total del período");
    fireEvent.click(screen.getByRole("button",{name:"Exportar tabla a Excel"}));
    await waitFor(()=>expect(exportTable).toHaveBeenCalled());
    const exported=exportTable.mock.calls[0][0];
    expect(exported.rows.map((row:Row)=>row.id)).toEqual(["c","b","a","footer"]);
    expect(exported.columns).toBe(columns);
    expect(exported.rows[2].amount).toBe(-9.25);
  });
  it("exports all rows beyond the scroll viewport, and no added financial footer",async()=>{
    const many=Array.from({length:25},(_,index)=>({...rows[0],id:String(index)}));
    render(<SalesDataTable {...props} rows={many} />);
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(26);
    expect(screen.queryByText("Total del período")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Exportar tabla a Excel"}));
    await waitFor(()=>expect(exportTable).toHaveBeenCalled());
    expect(exportTable.mock.calls[0][0].rows).toHaveLength(25);
  });
  it("enforces the same export capability and disables empty exports",()=>{
    can.mockReturnValue(false);
    const view=render(<SalesDataTable {...props} />);
    expect(can).toHaveBeenCalledWith("datos:exportar");
    expect(screen.queryByRole("button",{name:"Exportar tabla a Excel"})).not.toBeInTheDocument();
    can.mockReturnValue(true);view.rerender(<SalesDataTable {...props} rows={[]} />);
    expect(screen.getByRole("button",{name:"Exportar tabla a Excel"})).toBeDisabled();
  });
});
