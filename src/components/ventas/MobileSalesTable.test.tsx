import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, selectExport } from "./salesSectionExports.test-support";
import { SalesDataTable, type SalesDisplayColumn } from "./SalesDataTable";
import { waitFor } from "@testing-library/react";
import { MaquinasPanorama, type MaquinasDashboardResponse } from "./MaquinasVentas";

const { exported } = vi.hoisted(()=>({exported:vi.fn()}));
vi.mock("@/hooks/use-mobile",()=>({useIsMobile:()=>true}));
vi.mock("@/hooks/useAuth",()=>({useAuth:()=>({can:()=>true})}));
vi.mock("./salesTableExport",()=>({exportSalesTable:exported}));
type Row={id:string;cliente:string;total:number;cantidad:number|null;chasis:string};
const rows:Row[]=[{id:"a",cliente:"Cliente de prueba con nombre completo muy largo",total:1500000.25,cantidad:2,chasis:"TEST0001"},{id:"b",cliente:"Nota de crédito",total:-250.5,cantidad:null,chasis:"TEST0002"}];
const columns:SalesDisplayColumn<Row>[]=[
  {key:"cliente",label:"Cliente",kind:"text",value:r=>r.cliente},
  {key:"total",label:"Facturado",kind:"number",align:"right",value:r=>r.total,excelFormat:'"$" #,##0.00'},
  {key:"cantidad",label:"Cantidad",kind:"number",align:"center",value:r=>r.cantidad},
  {key:"chasis",label:"Chasis",kind:"text",value:r=>r.chasis},
];
const props={title:"Ventas de prueba",rows,columns,rowKey:(r:Row)=>r.id,initialSort:{key:"total",direction:"desc" as const},fileName:"prueba.xlsx"};
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe("mobile sales presentation",()=>{
  it("embeds periods under one heading and keeps sorting, detail and collapsing",async()=>{
    const resumen={total:1500000.25,facturas:1,clientes:1,vendidas:1,notas_credito:0,netas:1,promedio_unidad:1500000.25,nuevas:1,usadas:0};
    const data:MaquinasDashboardResponse={resumen,periodos:[{...resumen,periodo:"2026-08-01"}],por_maquina:[],por_modelo:[],lineas:[],dimensiones:{marcas:[],tipos:[]}};
    render(<MaquinasPanorama data={data} loading={false} error={null} periodMode="mes" selectedPeriod={null} onSelectPeriod={()=>{}}/>);
    expect(screen.getAllByRole("heading",{name:"Facturación por período"})).toHaveLength(1);
    expect(screen.queryByRole("heading",{name:"Períodos de Máquinas"})).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    await selectExport();
    await waitFor(()=>expect(exported).toHaveBeenCalled());
    expect(exported.mock.calls[0][0].rows).toHaveLength(2);
    fireEvent.click(screen.getByRole("button",{name:/^Facturación por período$/}));
    expect(screen.getByRole("table").closest("section")).not.toHaveClass("border");
    fireEvent.click(screen.getByRole("button",{name:"Columnas y orden de Facturación por período"}));
    expect(screen.getByLabelText("Mostrar")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText("Mostrar"),{key:"Escape"});
    fireEvent.click(screen.getByRole("button",{name:/^Facturación por período$/}));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
  it("shows two data columns and opens all fields without losing full names, nulls or negative amounts",()=>{
    render(<SalesDataTable {...props}/>);
    const table=screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader")).toHaveLength(3);
    expect(within(table).getByText("$ 1.500.000,25")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Ver detalle de Nota de crédito"}));
    const detail=screen.getByRole("dialog");
    expect(within(detail).getByText("TEST0002")).toBeInTheDocument();
    expect(within(detail).getByText("$ -250,5")).toBeInTheDocument();
    expect(within(detail).getByText("—")).toBeInTheDocument();
    fireEvent.click(within(detail).getByRole("button",{name:"Cerrar"}));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("changes the visible metric and sorts hidden columns in both directions",()=>{
    render(<SalesDataTable {...props}/>);
    fireEvent.click(screen.getByRole("button",{name:"Columnas y orden de Ventas de prueba"}));
    fireEvent.change(screen.getByLabelText("Mostrar"),{target:{value:"cantidad"}});
    fireEvent.change(screen.getByLabelText("Ordenar"),{target:{value:"chasis"}});
    expect(within(screen.getByRole("table")).getAllByRole("row")[1]).toHaveTextContent(rows[0].cliente);
    fireEvent.click(screen.getByRole("button",{name:/Invertir orden/}));
    expect(within(screen.getByRole("table")).getAllByRole("row")[1]).toHaveTextContent("Nota de crédito");
    expect(within(screen.getByRole("table")).getAllByRole("columnheader")[1]).toHaveTextContent("Cantidad");
  });
  it("keeps row selection separate from inspection and exports every original field and footer",async()=>{
    const onRowClick=vi.fn();
    const footer={...rows[0],id:"footer",cliente:"Total del período",total:1499749.75};
    render(<SalesDataTable {...props} footer={footer} onRowClick={onRowClick}/>);
    fireEvent.click(screen.getByRole("button",{name:rows[0].cliente}));
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await selectExport();
    await waitFor(()=>expect(exported).toHaveBeenCalled());
    expect(exported.mock.calls[0][0].columns).toEqual(columns);
    expect(exported.mock.calls[0][0].rows).toEqual([...rows,footer]);
  });
});
