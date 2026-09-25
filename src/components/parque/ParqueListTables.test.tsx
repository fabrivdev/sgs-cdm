import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StockMaquinasTab } from "./StockMaquinasTab";
import { MaquinasTab } from "./MaquinasTab";
import { ParqueTab } from "./ParqueTab";
import ParqueClientes from "@/pages/ParqueClientes";
import MaquinariaOperaciones, { OrdersTable } from "@/pages/MaquinariaOperaciones";

const mocks=vi.hoisted(()=>({tables:{} as Record<string,Record<string,unknown>[]>,can:vi.fn(),errorTable:"",rpc:vi.fn(),transfer:vi.fn(),
  sheet:vi.fn((rows:unknown[][])=>({"!ref":"A1:Z3",rows})),json:vi.fn((rows:Record<string,unknown>[])=>({rows})),write:vi.fn()}));
vi.mock("pdfjs-dist",()=>({getDocument:vi.fn(),GlobalWorkerOptions:{}}));
vi.mock("@/hooks/useAuth",()=>({useAuth:()=>({can:mocks.can,isAdmin:false,roles:[]})}));
vi.mock("@/hooks/useMachineCatalog",()=>({useMachineCatalog:()=>({data:{brands:[],models:[],aliases:[]},isLoading:false})}));
vi.mock("./TransferirMaquinaDialog",()=>({TransferirMaquinaDialog:(props:unknown)=>{mocks.transfer(props);return null;}}));
vi.mock("./NuevaMaquinaDialog",()=>({NuevaMaquinaDialog:()=>null}));
vi.mock("./ClientePanel",()=>({ClientePanel:()=>null}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc:mocks.rpc,from:(table:string)=>{
  const result=()=>({data:mocks.tables[table]??[],error:table===mocks.errorTable?{message:"Fixture read error"}:null});
  const chain={select:()=>chain,order:()=>chain,eq:()=>chain,in:()=>chain,range:()=>Promise.resolve(result()),then:(resolve:(value:ReturnType<typeof result>)=>unknown)=>Promise.resolve(result()).then(resolve)};
  return chain;
}}}));
vi.mock("xlsx",()=>({utils:{aoa_to_sheet:mocks.sheet,json_to_sheet:mocks.json,encode_cell:()=>"A1",book_new:()=>({}),book_append_sheet:vi.fn()},writeFile:mocks.write}));
const machine={id:"M1",cliente_id:"C1",anio:2020,marca:"CLAAS",marca_nombre:null,subgrupo:"COSECHADORAS",subgrupo_personalizado:null,modelo_tipo:"MODELO CON NOMBRE LARGO",serie:"000123456789",vendedor:"VENDEDOR COMPLETO",sucursal:"Santa Rita",localidad:null,activo:true};
const stock={carga_id:"LOAD",id:"S1",producto_codigo:"000001",sucursal:"Santa Rita",filial_original:null,deposito:"DEPÓSITO CON NOMBRE LARGO",tipo:"COSECHADORAS",marca:"CLAAS",modelo:machine.modelo_tipo,estado:"Nuevo",chasis:"000123456789",saldo_actual:1.25,importado_en:"2026-09-18"};
const imported={id:"I1",numero_unidad:1,cantidad_lote:3,importacion_linea_id:"IL1",operacion_id:null,linea_id:null,unidad_id:null,np_numero:null,np_fecha:null,cliente_nombre:null,comercial:null,marca:"CLAAS",producto:"COSECHADORAS",modelo:machine.modelo_tipo,cantidad:1,estado_fuente:"Arribado",oc:"000111",po:null,fecha_pedido:"2026-01-21",eta:"2026-12-17",ata:"2026-08-28",llave_interna:"CLA111-1",proveedor:"CLAAS",invoice_supplier:null,factura_proveedor_fecha:null,factura_proveedor_moneda:null,precio_oc:500,costo_final_sin_iva:null,costo_final:null,chasis:machine.serie,venta_facturada:null,valor_venta:null,situacion_vinculo:null,estado_disponibilidad:"RESERVADO",disponibilidad_detalle:null,stock_sucursal:"Santa Rita",stock_deposito:null,stock_saldo:1,vinculo_manual:false,detalle_manual:false,alcance_valor_oc:"UNITARIO",moneda_oc:"USD",costo_stock_habilitado:true,stock_fisico_confirmado:true};
beforeEach(()=>{
  vi.stubGlobal("innerWidth", 1024);
  vi.clearAllMocks();mocks.errorTable="";mocks.can.mockReturnValue(true);
  vi.stubGlobal("ResizeObserver",class{observe(){}disconnect(){}});
  vi.stubGlobal("matchMedia",vi.fn().mockReturnValue({matches:false,addListener:vi.fn(),removeListener:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn()}));
  mocks.tables={parque_maquinas:[machine,{...machine,id:"M2",cliente_id:"C2",marca:"HORSCH",modelo_tipo:"OTRO MODELO",serie:"000999",anio:2022}],clientes:[{id:"C1",nombre:"CLIENTE CON NOMBRE MUY LARGO",sucursal:"Santa Rita",activo:true},{id:"C2",nombre:"OTRO CLIENTE",sucursal:"Katuete",activo:true}],contactos_cliente:[{id:"T1",cliente_id:"C1",nombre:"Contacto",telefono:"000123456",es_principal:true,activo:true}],parque_stock_maquinas:[stock,{...stock,id:"S2",producto_codigo:"000002",saldo_actual:2.5}],maquinaria_importacion_unidades_operativas:[imported,{...imported,id:"I2",llave_interna:"CLA111-2",numero_unidad:2,chasis:null,stock_fisico_confirmado:false,costo_stock_habilitado:false,estado_disponibilidad:"SIN_CHASIS"}]};
  mocks.rpc.mockImplementation((name:string)=>Promise.resolve({error:null,data:name.includes("ultimas")?[{cliente_id:"C1",ult_repuesto:"2026-01-05",ult_servicio:"2026-01-05"}]:[{cliente_id:"C1",fact_actual:125.55,fact_prev:100,tiene_rep_rango:true,tiene_srv_rango:true},{cliente_id:"C2",fact_actual:-10.25,fact_prev:20,tiene_rep_rango:true,tiene_srv_rango:true}]}));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
function setup(component:React.ReactNode,path="/"){
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>{component}</MemoryRouter></QueryClientProvider>);
}
async function exportTable(label:string){
  const menu=screen.getByRole("button",{name:"Acciones de la sección"});
  expect(screen.getByRole("button",{name:/Más filtros/}).nextElementSibling).toContainElement(menu);
  fireEvent.keyDown(menu,{key:"Enter"});fireEvent.click(await screen.findByRole("menuitem",{name:label}));
  await waitFor(()=>expect(mocks.write).toHaveBeenCalled());
}
describe("Parque and imports compact lists",()=>{
  it("phone park rows identify the chassis and owner without merging records or authorizing a transfer",async()=>{
    vi.stubGlobal("innerWidth", 390);
    const open=vi.fn(); setup(<MaquinasTab onOpenCliente={open}/>);
    const detail=await screen.findByRole("button", {name:`Detalle ${machine.modelo_tipo}`});
    expect(detail).toHaveTextContent(machine.serie);
    expect(detail).toHaveTextContent("CLIENTE CON NOMBRE MUY LARGO");
    const row=detail.closest("tr")!;
    expect(within(row).getAllByRole("cell")).toHaveLength(2);
    fireEvent.click(detail);
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button",{name:"Ver cliente"}));
    expect(open).toHaveBeenCalledExactlyOnceWith("C1");
    expect(mocks.transfer.mock.calls.at(-1)?.[0]).not.toMatchObject({maquina:{id:machine.id}});
  });
  it("phone stock preserves fractional quantities, duplicate warning and full chassis",async()=>{
    vi.stubGlobal("innerWidth", 320); setup(<StockMaquinasTab/>);
    const details=await screen.findAllByRole("button", {name:`Detalle ${machine.modelo_tipo}`});
    expect(details[0]).toHaveTextContent(machine.serie);
    expect(details[0]).toHaveTextContent(/repetido/i);
    const cells=within(details[0].closest("tr")!).getAllByRole("cell");
    expect(cells).toHaveLength(2); expect(cells[1]).toHaveTextContent("1,25");
    fireEvent.click(screen.getByRole("button",{name:"Ordenar Stock de máquinas"}));
    expect(await screen.findByRole("button",{name:/Ordenar Chasis:/})).toBeInTheDocument();
  });
  it("orders preserves billing, delivery, money and the original selection",()=>{
    const row={id:"U1",operacion_id:"OP1",np_numero:"000101",np_fecha:"2026-09-17",cliente_nombre:"CLIENTE CON NOMBRE MUY LARGO",comercial:null,marca:"CLAAS",producto:"COSECHADORAS",modelo:machine.modelo_tipo,cantidad:1,condicion:"NUEVA",abastecimiento:"STOCK",estado_fuente:"FACTURADA",estado_operacion:"FACTURADA",chasis:machine.serie,estado_disponibilidad:"DISPONIBLE",disponibilidad_detalle:null,estado_importacion_fuente:null,eta:null,ata:null,proveedor:null,factura_venta:"FACT 5106",factura_fecha:"2026-09-22",costo_producto:null,valor_venta:111234.56,moneda_valor:"USD",observaciones:null,actualizado_en:"2026-09-18",es_historico:false};
    const select=vi.fn();setup(<OrdersTable rows={[row]} heading={key=>key} onSelect={select} entregaByUnitId={new Map([[row.id,{estado:"FACTURADA",chasis:machine.serie}]])} estadoByOperacionId={new Map([[row.operacion_id,"FACTURADA"]])} stockChasisSet={new Set([machine.serie])}/>);
    const table=screen.getByRole("table",{name:"Operaciones de máquinas"});const cells=within(within(table).getAllByRole("row")[1]).getAllByRole("cell");
    expect(cells[7]).toHaveTextContent("Pendiente");expect(cells[8]).toHaveTextContent("En stock");expect(cells[9]).toHaveClass("text-right");expect(cells[9]).toHaveTextContent("$ 111.234,56");expect(cells[9]).not.toHaveTextContent("USD");
    expect(cells[7]).not.toHaveClass("hidden");expect(cells[8]).toHaveClass("hidden");
    fireEvent.change(screen.getByLabelText("Estado visible"),{target:{value:"entrega"}});
    expect(cells[7]).toHaveClass("hidden");expect(cells[8]).not.toHaveClass("hidden");
    fireEvent.click(screen.getByRole("button",{name:"Ver NP NP0101"}));expect(select).toHaveBeenCalledExactlyOnceWith(row);expect(table.querySelectorAll("td br,td .flex-col")).toHaveLength(0);
  });
  it("stock keeps centered fractions, full hover and duplicate warnings",async()=>{
    setup(<StockMaquinasTab/>);await screen.findAllByRole("button",{name:`Detalle ${machine.modelo_tipo}`});
    const table=screen.getByRole("table",{name:"Stock de máquinas"});expect(table).toHaveClass("table-fixed");
    const row=within(table).getAllByRole("row")[1];const cells=within(row).getAllByRole("cell");expect(cells[8]).toHaveTextContent("1,25");expect(cells[8]).toHaveClass("text-center");
    expect(cells[7]).toHaveAttribute("title",expect.stringContaining("más de una referencia"));expect(within(row).getByRole("img",{name:"Chasis repetido"})).toBeInTheDocument();
    expect(table.querySelectorAll("td br, td p, td .flex-col")).toHaveLength(0);
    fireEvent.click(within(row).getByRole("button",{name:`Detalle ${machine.modelo_tipo}`}));
    expect(await screen.findByRole("dialog",{name:`Detalle ${machine.modelo_tipo}`})).toHaveTextContent(stock.deposito);
  });
  it("stock sorts both ways and exports all original codes and amounts",async()=>{
    setup(<StockMaquinasTab/>);await screen.findByText("1,25");
    const sort=screen.getByRole("button",{name:/Ordenar Saldo:/});fireEvent.click(sort);fireEvent.click(sort);
    expect(sort.closest("th")).toHaveAttribute("aria-sort","descending");
    await exportTable("Exportar Stock de máquinas");const rows=mocks.sheet.mock.calls[0][0];expect(rows).toHaveLength(3);expect(rows[1][2]).toBe("000002");expect(rows[1][8]).toBe(2.5);expect(rows[2][8]).toBe(1.25);
  });
  it("machine numeric headings match cells and opening/transferring preserves identity",async()=>{
    const open=vi.fn();setup(<MaquinasTab onOpenCliente={open}/>);await screen.findByRole("button",{name:"Transferir 000123456789"});
    const table=screen.getByRole("table",{name:"Máquinas del parque"});const row=within(table).getAllByRole("row")[1];const cells=within(row).getAllByRole("cell");
    expect(cells[5]).toHaveClass("text-center");expect(cells[6]).toHaveTextContent(String(new Date().getFullYear()-2020));expect(cells[6]).not.toHaveTextContent("a");
    expect(screen.getByRole("button",{name:/Ordenar Año:/}).closest("th")).toHaveClass("text-center");
    fireEvent.click(screen.getByRole("button",{name:"Transferir 000123456789"}));expect(mocks.transfer.mock.calls.at(-1)?.[0]).toMatchObject({maquina:{id:"M1",clienteIdActual:"C1",serie:"000123456789"}});expect(open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"CLIENTE CON NOMBRE MUY LARGO"}));expect(open).toHaveBeenCalledWith("C1");
  });
  it("machine search exports the complete original metadata without suffixes",async()=>{
    setup(<MaquinasTab/>);await screen.findByRole("table",{name:"Máquinas del parque"});await screen.findByText("000123456789");
    fireEvent.change(screen.getAllByRole("searchbox",{name:"Buscar"})[0],{target:{value:"000123456789"}});
    await waitFor(()=>expect(screen.queryByText("000999")).not.toBeInTheDocument());await exportTable("Exportar máquinas");
    expect(mocks.json.mock.calls[0][0]).toHaveLength(1);expect(mocks.json.mock.calls[0][0][0]).toMatchObject({Serie:"000123456789",Vendedor:"VENDEDOR COMPLETO",Sucursal:"Santa Rita",Año:2020});
  });
  it("clients keeps branch and activity in context without crowding visible headings",async()=>{
    const open=vi.fn();setup(<ParqueTab onOpenCliente={open}/>);await screen.findByRole("button",{name:"Detalle CLIENTE CON NOMBRE MUY LARGO"});
    await waitFor(()=>expect(screen.queryByText("cargando facturación...")).not.toBeInTheDocument());
    const table=screen.getByRole("table",{name:"Clientes del parque"});const row=within(table).getAllByRole("row")[1];const cells=within(row).getAllByRole("cell");
    expect(within(table).getAllByRole("columnheader")).toHaveLength(10);
    expect(within(table).queryByRole("columnheader",{name:/Sucursal|^Rep\.|^Serv\./})).not.toBeInTheDocument();
    expect(cells[0]).not.toHaveTextContent("Santa Rita");expect(cells[2]).toHaveClass("text-center");expect(cells[5]).not.toHaveTextContent(/\d+d/);
    expect(within(table).getAllByRole("row")[2]).toHaveTextContent("$ -10");
    fireEvent.click(screen.getByRole("button",{name:"Detalle CLIENTE CON NOMBRE MUY LARGO"}));
    const context=await screen.findByRole("dialog",{name:"Detalle CLIENTE CON NOMBRE MUY LARGO"});expect(context).toHaveTextContent("000123456");expect(context).toHaveTextContent("Santa Rita");expect(context).toHaveTextContent("RepuestosSí");expect(context).toHaveTextContent("ServiciosSí");fireEvent.click(context);expect(open).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"Ver cliente"}));expect(open).toHaveBeenCalledWith("C1");
  });
  it("client export retains original cents and filtering despite compact columns",async()=>{
    setup(<ParqueTab/>);await screen.findByRole("button",{name:"Detalle CLIENTE CON NOMBRE MUY LARGO"});
    await waitFor(()=>expect(screen.queryByText("cargando facturación...")).not.toBeInTheDocument());
    fireEvent.change(screen.getAllByRole("searchbox",{name:"Buscar"})[0],{target:{value:"CLIENTE CON NOMBRE"}});
    await waitFor(()=>expect(screen.queryByRole("button",{name:"Detalle OTRO CLIENTE"})).not.toBeInTheDocument());
    await exportTable("Exportar clientes");expect(mocks.json.mock.calls[0][0]).toHaveLength(1);expect(mocks.json.mock.calls[0][0][0]).toMatchObject({"Fact. YTD":125.55,Teléfono:"000123456",Sucursal:"Santa Rita",Repuesto:"Sí",Servicio:"Sí"});
  });
  it("client machine sorting still works both ways and exports every branch",async()=>{
    mocks.tables.parque_maquinas.push({...machine,id:"M3",sucursal:"Santa Rosa",serie:"000333"});
    setup(<ParqueTab/>);await screen.findByRole("button",{name:"Detalle CLIENTE CON NOMBRE MUY LARGO"});
    const table=screen.getByRole("table",{name:"Clientes del parque"});
    const sort=within(table).getByRole("button",{name:/Ordenar Maq\.:/});
    fireEvent.click(sort);expect(sort.closest("th")).toHaveAttribute("aria-sort","ascending");
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("OTRO CLIENTE");
    fireEvent.click(sort);expect(sort.closest("th")).toHaveAttribute("aria-sort","descending");
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("CLIENTE CON NOMBRE MUY LARGO");
    await exportTable("Exportar clientes");expect(mocks.json.mock.calls[0][0]).toHaveLength(2);
    expect(mocks.json.mock.calls[0][0][0]).toMatchObject({Sucursal:"Santa Rita, Santa Rosa",Maquinarias:2});
  });
  it("permission changes do not grant export or transfers",async()=>{
    mocks.can.mockReturnValue(false);setup(<MaquinasTab/>);await screen.findByText("000123456789");expect(screen.queryByRole("button",{name:/Transferir/})).not.toBeInTheDocument();expect(screen.queryByRole("button",{name:"Acciones de la sección"})).not.toBeInTheDocument();
  });
  it("billing timeout is not repeated automatically, blocks export and allows manual recovery",async()=>{
    vi.spyOn(console,"error").mockImplementation(()=>undefined);
    const state=vi.fn();mocks.rpc.mockResolvedValue({data:null,error:{code:"57014",message:"canceling statement due to statement timeout"}});
    setup(<ParqueTab onFacturacionEstadoChange={state}/>);
    await screen.findByText(/57014/);expect(mocks.rpc).toHaveBeenCalledTimes(1);expect(state).toHaveBeenLastCalledWith("error");
    fireEvent.keyDown(screen.getByRole("button",{name:"Acciones de la sección"}),{key:"Enter"});
    expect(await screen.findByRole("menuitem",{name:"Exportar clientes"})).toHaveAttribute("data-disabled");
    fireEvent.keyDown(screen.getByRole("menuitem",{name:"Exportar clientes"}),{key:"Escape"});
    mocks.rpc.mockImplementation((name:string)=>Promise.resolve({error:null,data:name.includes("ultimas")?[]:[{cliente_id:"C1",fact_actual:12.55,fact_prev:10,tiene_rep_rango:true,tiene_srv_rango:false}]}));
    fireEvent.click(screen.getByRole("button",{name:"Reintentar"}));
    await waitFor(()=>expect(state).toHaveBeenLastCalledWith("ready"));expect(screen.queryByText(/57014/)).not.toBeInTheDocument();
    await exportTable("Exportar clientes");expect(mocks.json.mock.calls[0][0][0]["Fact. YTD"]).toBe(12.55);
  });
  it("the real clients page marks failed coverage unavailable but keeps machine/client counts",async()=>{
    vi.spyOn(console,"error").mockImplementation(()=>undefined);
    mocks.rpc.mockResolvedValue({data:null,error:{code:"57014",message:"statement timeout"}});
    setup(<ParqueClientes/>,"/parque-clientes");await screen.findByText(/57014/);
    const service=screen.getByText("Cobertura de servicio en período").parentElement?.parentElement;
    const parts=screen.getByText("Cobertura de repuestos en período").parentElement?.parentElement;
    expect(service).toHaveTextContent("—");expect(parts).toHaveTextContent("—");expect(service).not.toHaveTextContent("0%");
    expect(screen.getByText("Máquinas activas").parentElement?.parentElement).toHaveTextContent("2");
    expect(screen.getByText("Clientes con máquinas").parentElement?.parentElement).toHaveTextContent("2");
  });
  it("unmount aborts an in-flight billing request",async()=>{
    let signal:AbortSignal|undefined;
    mocks.rpc.mockImplementation(()=>({abortSignal:(s:AbortSignal)=>{signal=s;return new Promise(()=>undefined);}}));
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
    const view=render(<QueryClientProvider client={client}><MemoryRouter><ParqueTab/></MemoryRouter></QueryClientProvider>);
    await waitFor(()=>expect(signal).toBeDefined());view.unmount();expect(signal?.aborted).toBe(true);
  });
  it("failed stock reads block exports and show the real error",async()=>{
    mocks.errorTable="parque_stock_maquinas";vi.spyOn(console,"error").mockImplementation(()=>undefined);setup(<StockMaquinasTab/>);
    await screen.findByText(/No se pudo cargar el stock/);fireEvent.keyDown(screen.getByRole("button",{name:"Acciones de la sección"}),{key:"Enter"});expect(await screen.findByRole("menuitem",{name:"Exportar Stock de máquinas"})).toHaveAttribute("data-disabled");
  });
  it("actual imports page keeps one list and menu, centered position, arrival and full export",async()=>{
    setup(<MaquinariaOperaciones/>,"/parque-importaciones");await screen.findByRole("button",{name:"Ver importación CLA111-1"});
    const table=screen.getByRole("table",{name:"Importaciones de máquinas"});expect(table).toHaveClass("table-fixed");expect(screen.getAllByRole("table")).toHaveLength(1);
    const cells=within(within(table).getAllByRole("row")[1]).getAllByRole("cell");expect(cells[5]).toHaveTextContent("1/3");expect(cells[5]).toHaveClass("text-center");expect(cells[9]).toHaveTextContent("Completado");expect(cells[10]).toHaveTextContent("Reservado");
    expect(screen.getByRole("button",{name:/Ordenar Unidad:/}).closest("th")).toHaveClass("text-center");
    const sort=screen.getByRole("button",{name:/Ordenar OC:/});fireEvent.click(sort);fireEvent.click(sort);expect(sort.closest("th")).toHaveAttribute("aria-sort","descending");
    await exportTable("Exportar Importaciones");const rows=mocks.sheet.mock.calls[0][0];expect(rows).toHaveLength(3);expect(rows[1][1]).toBe("000111");expect(rows[1][5]).toBe("1/3");expect(rows[1][6]).toBeInstanceOf(Date);expect(rows[1][9]).toBe("Completado");expect(rows[1][10]).toBe("Reservado");expect(rows[1][11]).toBe(machine.serie);
  });
});
