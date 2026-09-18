import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as XLSX from "xlsx";
import { useSectionTable } from "./useSectionTable";
import { SalesSectionExportsProvider, SalesSectionExportMenu } from "@/components/ventas/SalesSectionExports";
import { FiltersBar } from "@/components/filters/FiltersBar";
import type { SalesColumn } from "@/components/ventas/salesTableInteraction";

const auth=vi.hoisted(()=>({allowed:true}));
vi.mock("@/hooks/useAuth",()=>({useAuth:()=>({can:()=>auth.allowed})}));
vi.mock("xlsx",async original=>({...await original<typeof XLSX>(),writeFile:vi.fn()}));
type Row={code:string;amount:number;date:string|null;description:string};
const rows:Row[]=[
  {code:"000010",amount:100.25,date:null,description:"=NOT_A_FORMULA"},
  {code:"000002",amount:-2.55,date:"2026-01-02",description:"Devolución ficticia con texto completo"},
  {code:"000002",amount:0,date:"2026-02-01",description:"Segunda línea de la misma factura"},
];
const columns:SalesColumn<Row>[]=[
  {key:"code",label:"Código",kind:"text",value:r=>r.code},
  {key:"amount",label:"Facturado",kind:"number",value:r=>r.amount},
  {key:"date",label:"Fecha",kind:"date",value:r=>r.date},
  {key:"description",label:"Descripción",kind:"text",value:r=>r.description},
];
function Table({data=rows,disabled=false}:{data?:Row[];disabled?:boolean}){
  const t=useSectionTable({rows:data,columns,initialSort:{key:"code",direction:"asc"},title:"Tabla",fileName:"tabla.xlsx",disabled});
  return <table><thead><tr>{columns.map(c=><th key={c.key}>{t.heading(c.key)}</th>)}</tr></thead>
    <tbody>{t.ordered.map((r,i)=><tr key={i}><td>{r.code}</td><td>{r.amount}</td></tr>)}</tbody></table>;
}
function Page(props:{data?:Row[];disabled?:boolean}){
  return <SalesSectionExportsProvider><FiltersBar secondaryActions={<SalesSectionExportMenu/>}/><Table {...props}/></SalesSectionExportsProvider>;
}
beforeEach(()=>vi.stubGlobal("ResizeObserver",class { observe() {} disconnect() {} }));
afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals();auth.allowed=true;});
describe("shared interaction outside Servicios",()=>{
  it("exports every repeated line in the latest raw numeric order with full typed data",async()=>{
    render(<Page/>);
    fireEvent.click(screen.getByRole("button",{name:/Ordenar Facturado/}));
    const values=screen.getAllByRole("row").slice(1).map(r=>r.children[1].textContent);
    expect(values).toEqual(["-2.55","0","100.25"]);
    expect(screen.getAllByRole("button",{name:"Acciones de la sección"})).toHaveLength(1);
    fireEvent.keyDown(screen.getByRole("button",{name:"Acciones de la sección"}),{key:"Enter"});
    fireEvent.click(await screen.findByRole("menuitem",{name:"Exportar Tabla"}));
    await waitFor(()=>expect(XLSX.writeFile).toHaveBeenCalledTimes(1));
    const book=vi.mocked(XLSX.writeFile).mock.calls[0][0] as XLSX.WorkBook;
    const sheet=book.Sheets[book.SheetNames[0]];
    expect(XLSX.utils.sheet_to_json(sheet,{header:1})).toHaveLength(4);
    expect(sheet.A2).toMatchObject({t:"s",v:"000002"});
    expect(sheet.B2).toMatchObject({t:"n",v:-2.55});
    expect(sheet.D2.v).toBe(rows[1].description);
    expect(sheet.D4).toMatchObject({t:"s",v:"=NOT_A_FORMULA"});
    expect(sheet.D4.f).toBeUndefined();
    expect(sheet.C2.z).toBe("dd/mm/yy");
    fireEvent.click(screen.getByRole("button",{name:/Ordenar Facturado/}));
    expect(screen.getAllByRole("row")[1].children[1]).toHaveTextContent("100.25");
  });
  it("uses the latest filtered snapshot and blocks loading, empty results and unauthorized export",()=>{
    const view=render(<Page/>);
    view.rerender(<Page data={[rows[2]]}/>);
    expect(screen.getAllByRole("row")).toHaveLength(2);
    view.rerender(<Page disabled/>);
    expect(screen.getByRole("button",{name:"Acciones de la sección"})).toBeDisabled();
    view.rerender(<Page data={[]}/>);
    expect(screen.getByRole("button",{name:"Acciones de la sección"})).toBeDisabled();
    auth.allowed=false;view.rerender(<Page/>);
    expect(screen.queryByRole("button",{name:"Acciones de la sección"})).not.toBeInTheDocument();
  });
});
