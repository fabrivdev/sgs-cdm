import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Planificador from "@/pages/Planificador";
import Trabajos from "@/pages/Trabajos";
import { TrabajosOSTab } from "@/components/trabajos/TrabajosOSTab";

const mocks=vi.hoisted(()=>({tables:{} as Record<string,Record<string,unknown>[]>,errorTable:"",can:vi.fn(),detail:vi.fn(),work:vi.fn(),update:vi.fn(),setFilters:vi.fn(),clearFilters:vi.fn(),sheet:vi.fn((rows:unknown[][])=>({rows})),json:vi.fn((rows:Record<string,unknown>[])=>({rows})),write:vi.fn()}));
const viewport = vi.hoisted(() => ({ width: 1280 }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: (breakpoint = 768) => viewport.width < breakpoint }));
vi.mock("@/hooks/useAuth",()=>({useAuth:()=>({can:mocks.can,isAdmin:true,isCabecilla:false,user:{id:"ADMIN"},profile:null})}));
vi.mock("@/hooks/useServicioTecnicos",()=>({useServicioTecnicos:()=>({data:[{id:"T1",nombre:"TÉCNICO UNO",sucursal:"Santa Rita"}]})}));
vi.mock("@/contexts/AssistantPageContext",()=>({useAssistantPageContext:()=>({setPageFilters:mocks.setFilters,clearPageFilters:mocks.clearFilters})}));
vi.mock("@/components/ServicioFormDialog",()=>({ServicioFormDialog:()=>null}));
vi.mock("@/components/ServicioDetalleDialog",()=>({ServicioDetalleDialog:(props:unknown)=>{mocks.detail(props);return null;}}));
vi.mock("@/components/trabajos/ProgramarIntervencionDialog",()=>({ProgramarIntervencionDialog:()=>null}));
vi.mock("@/components/trabajos/NuevoTrabajoDialog",()=>({NuevoTrabajoDialog:()=>null}));
vi.mock("@/components/trabajos/TrabajoDetalleDrawer",()=>({TrabajoDetalleDrawer:(props:unknown)=>{mocks.work(props);return null;}}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:(table:string)=>{
  const result=()=>({data:mocks.tables[table]??[],error:table===mocks.errorTable?{message:"Fixture read error"}:null});
  const chain={select:()=>chain,order:()=>chain,eq:()=>chain,not:()=>chain,update:(value:unknown)=>{mocks.update(value);return chain;},range:()=>Promise.resolve(result()),then:(resolve:(value:ReturnType<typeof result>)=>unknown)=>Promise.resolve(result()).then(resolve)};return chain;
}}}));
vi.mock("xlsx",()=>({utils:{aoa_to_sheet:mocks.sheet,json_to_sheet:mocks.json,encode_cell:()=>"A1",book_new:()=>({}),book_append_sheet:vi.fn()},writeFile:mocks.write}));
const client={id:"C1",nombre:"CLIENTE CON NOMBRE EXTENSO",sucursal:"Santa Rita" as const};
const service={id:"S1",fecha_programada:"2026-09-18",dia_semana:"Viernes",semana:38,tecnico_responsable_id:"T1",auxiliares:["T2"],sucursal:"Santa Rita",cliente_id:"C1",marca:"CLAAS",tipo_trabajo:"Visita de campo",trabajo_descripcion:"DESCRIPCIÓN COMPLETA DEL TRABAJO",estado:"Pendiente",observaciones:null,horas_trabajadas:0,visto_por:["ADMIN"]};
const order={os_numero:"01-00000001",trabajo_id:"W1",cliente_nombre:client.nombre,fecha_abierta_os:"2026-09-18",fecha_emision_factura:"2026-09-18",factura:"00000123",marca:"CLAAS",nro_chasis:"0000ABC",responsable:"TÉCNICO COMPLETO",cod_mecanico:"MA01",problema:"PROBLEMA COMPLETO",tipo_tiempo:"Cliente",servicios_cantidad:2.5,servicios_valor:null,repuesto_valor:10.55,kilometro_valor:-1.25,terceros_valor:0,situacion_os:"Cerrada",situacion_facturacion:"CRÉDITO 30 DÍAS"};
beforeEach(()=>{
  viewport.width = 1280;
  vi.clearAllMocks();mocks.can.mockReturnValue(true);mocks.errorTable="";
  vi.stubGlobal("ResizeObserver",class{observe(){}disconnect(){}});
  mocks.tables={servicios:[service],profiles:[{id:"T1",nombre:"TÉCNICO UNO",sucursal:"Santa Rita"},{id:"T2",nombre:"TÉCNICO DOS",sucursal:"Katuete"}],clientes:[client],servicio_jornadas:[
    {id:"J1",servicio_id:"S1",fecha:"2026-09-18",estado:"Completado",horas_trabajadas:2.5,observaciones:"OBSERVACIÓN ORIGINAL",tecnico_responsable_id:"T1",auxiliares:[]},
    {id:"J2",servicio_id:"S1",fecha:"2026-09-18",estado:"Completado",horas_trabajadas:0,observaciones:null,tecnico_responsable_id:"T1",auxiliares:[]},
  ],trabajos:[{id:"W1",codigo:"TR0001",os_numero:order.os_numero,sucursal:"Santa Rita",cliente_id:"C1",descripcion_problema:service.trabajo_descripcion,legacy_servicio_id:"S1",prioridad:"media",estado_general:"pendiente"}],ordenes_servicio_importadas:[order]};
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const plan=()=>render(<MemoryRouter initialEntries={["/planificador?semana=all"]}><Planificador/></MemoryRouter>);
const orders=()=>render(<TrabajosOSTab clientes={[client]} profiles={[]}/>);
const workPage=()=>render(<MemoryRouter initialEntries={["/trabajos"]}><Trabajos/></MemoryRouter>);
async function exportRows(label:string){
  const menu=screen.getByRole("button",{name:"Acciones de la sección"});
  expect(screen.getByRole("button",{name:/Más filtros/}).nextElementSibling).toContainElement(menu);
  fireEvent.keyDown(menu,{key:"Enter"});fireEvent.click(await screen.findByRole("menuitem",{name:label}));
  await waitFor(()=>expect(mocks.write).toHaveBeenCalled());
}
describe("compact operational services lists",()=>{
  it.each([320,390,639])("uses neutral native row boundaries and clear interaction feedback in Trabajos at %i px",async width=>{
    viewport.width=width;
    workPage();
    const row=await screen.findByRole("button",{name:/OS-01-00000001/});
    expect(row.parentElement).toHaveClass("max-sm:divide-y","max-sm:divide-border");
    expect(row).toHaveClass("max-sm:!border-border","max-sm:!bg-transparent","max-sm:px-2","max-sm:py-2","max-sm:hover:!bg-muted/60","max-sm:focus-visible:!bg-muted/60","max-sm:active:!bg-muted");
    expect(row).toHaveTextContent("Media");
    expect(row).toHaveTextContent(client.nombre);
    expect(row).toHaveTextContent(service.trabajo_descripcion);
    expect(screen.queryByRole("navigation", {name:"Estado de los trabajos"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name:/Más filtros/}));
    const panel = within(screen.getByRole("dialog"));
    const state = panel.getByRole("combobox", {name:"Estado visible de trabajos"});
    expect(state).toHaveClass("h-11");
    expect(within(state).getAllByRole("option")).toHaveLength(6);
    fireEvent.click(panel.getByRole("button", {name:"Aplicar"}));
    fireEvent.click(row);
    await waitFor(()=>expect(mocks.work.mock.calls.at(-1)?.[0]).toMatchObject({trabajoId:"W1"}));
  });
  it.each([320, 390, 639])("uses a phone agenda without hours or total at %i px and opens the exact journey", async width => {
    viewport.width = width;
    plan();
    const agenda = await screen.findByRole("list", {name: "Jornadas del Planificador"});
    expect(screen.queryByRole("table", {name: "Jornadas del Planificador"})).not.toBeInTheDocument();
    expect(screen.queryByText(/Total horas/)).not.toBeInTheDocument();
    expect(agenda).not.toHaveTextContent(/2,5|0 h|Horas|—/);
    expect(agenda).toHaveTextContent("TR0001");
    expect(within(agenda).getAllByRole("listitem")).toHaveLength(2);
    expect(within(agenda).getByText("Jornada 1/2")).toBeInTheDocument();
    expect(within(agenda).getByText("Jornada 2/2")).toBeInTheDocument();
    const second = within(agenda).getByRole("button", {name: /Abrir jornada.*Jornada 2\/2/});
    fireEvent.click(second);
    expect(mocks.detail.mock.calls.at(-1)?.[0]).toMatchObject({servicio:{id:"S1",jornada_id:"J2",auxiliares:[],horas_trabajadas:0}});
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each([640, 768])("keeps the original table and hour total at %i px", async width => {
    viewport.width = width;
    plan();
    await screen.findAllByRole("button", {name: `Abrir jornada ${service.trabajo_descripcion}`});
    expect(screen.getByRole("table", {name:"Jornadas del Planificador"})).toBeInTheDocument();
    expect(screen.getByText(/Total horas/)).toBeInTheDocument();
    expect(screen.queryByRole("list", {name:"Jornadas del Planificador"})).not.toBeInTheDocument();
  });
  it("phone retains hidden-field sorting, full export and journey hours without displaying them", async () => {
    viewport.width = 390;
    plan(); await screen.findByRole("list", {name:"Jornadas del Planificador"});
    fireEvent.click(screen.getByRole("button", {name:"Ordenar jornadas"}));
    const sort = await screen.findByRole("button", {name:/Ordenar Horas:/});
    fireEvent.click(sort); fireEvent.click(sort);
    fireEvent.keyDown(sort, {key:"Escape"});
    await exportRows("Exportar Planificador");
    expect(mocks.json.mock.calls[0][0]).toEqual([
      expect.objectContaining({"ID Jornada":"J1", Horas:2.5}),
      expect.objectContaining({"ID Jornada":"J2", Horas:0}),
    ]);
  });
  it("phone keeps week navigation inside Filters and shows a true empty state", async () => {
    viewport.width = 390;
    render(<MemoryRouter initialEntries={["/planificador?semana=38"]}><Planificador/></MemoryRouter>);
    await screen.findByRole("list", {name:"Jornadas del Planificador"});
    const agenda = within(screen.getByRole("region", {name:"Agenda del Planificador"}));
    expect(agenda.queryByRole("button", {name:"Semana siguiente"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name:/Más filtros/}));
    let filters = within(screen.getByRole("dialog"));
    expect(filters.getByRole("button", {name:"Semana siguiente"})).toHaveClass("h-11", "w-11");
    fireEvent.click(filters.getByRole("button", {name:"Semana siguiente"}));
    fireEvent.click(filters.getByRole("button", {name:"Aplicar"}));
    expect(screen.getByText("No hay jornadas con estos filtros.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name:/Más filtros/}));
    filters = within(screen.getByRole("dialog"));
    expect(filters.getByRole("button", {name:"Semana anterior"})).toHaveClass("h-11", "w-11");
    fireEvent.click(filters.getByRole("button", {name:"Semana anterior"}));
    fireEvent.click(filters.getByRole("button", {name:"Aplicar"}));
    expect(await screen.findByRole("list", {name:"Jornadas del Planificador"})).toBeInTheDocument();
  });
  it("phone does not hide a failed load behind an empty agenda", async () => {
    viewport.width = 390; mocks.errorTable = "servicio_jornadas";
    plan(); await screen.findByRole("alert");
    expect(screen.queryByText("No hay jornadas con estos filtros.")).not.toBeInTheDocument();
    mocks.errorTable = ""; fireEvent.click(screen.getByRole("button", {name:"Reintentar"}));
    await screen.findByRole("list", {name:"Jornadas del Planificador"});
  });
  it("keeps same-day journeys separate and opens their existing detail directly",async()=>{
    plan();await screen.findAllByRole("button",{name:`Abrir jornada ${service.trabajo_descripcion}`});
    const table=screen.getByRole("table",{name:"Jornadas del Planificador"});expect(table).toHaveClass("table-fixed");expect(within(table).getAllByRole("row")).toHaveLength(3);expect(within(table).getByRole("img",{name:"Jornada 1/2"})).toBeInTheDocument();expect(within(table).getByRole("img",{name:"Jornada 2/2"})).toBeInTheDocument();
    const cells=within(within(table).getAllByRole("row")[1]).getAllByRole("cell");expect(cells[7]).toHaveTextContent("2,5");expect(cells[7]).toHaveClass("text-center");expect(cells[0]).not.toHaveTextContent("Viernes");expect(table.querySelectorAll("td br, td .flex-col")).toHaveLength(0);
    const target=screen.getAllByRole("button",{name:`Abrir jornada ${service.trabajo_descripcion}`})[0];expect(target.tagName).toBe("BUTTON");const rendersBeforeOpen=mocks.detail.mock.calls.length;
    fireEvent.click(target);expect(mocks.detail.mock.calls.at(-1)?.[0]).toMatchObject({servicio:{id:"S1",jornada_id:"J1",auxiliares:[],horas_trabajadas:2.5}});expect(mocks.detail).toHaveBeenCalledTimes(rendersBeforeOpen+1);expect(screen.queryByRole("dialog",{name:`Detalle ${service.trabajo_descripcion}`})).not.toBeInTheDocument();
    const detailProps=mocks.detail.mock.calls.at(-1)?.[0] as {onOpenChange:(open:boolean)=>void};act(()=>detailProps.onOpenChange(false));const rendersAfterClose=mocks.detail.mock.calls.length;
    fireEvent.click(screen.getAllByRole("button",{name:`Abrir jornada ${service.trabajo_descripcion}`})[0]);expect(mocks.detail).toHaveBeenCalledTimes(rendersAfterClose+1);expect(mocks.detail.mock.calls.at(-1)?.[0]).toMatchObject({servicio:{id:"S1",jornada_id:"J1"}});expect(mocks.update).not.toHaveBeenCalled();
  });
  it("sorts original hours and exports the complete journeys, original identities and zero",async()=>{
    plan();await screen.findAllByRole("button",{name:`Abrir jornada ${service.trabajo_descripcion}`});
    const sort=screen.getByRole("button",{name:/Ordenar Horas:/});fireEvent.click(sort);fireEvent.click(sort);expect(sort.closest("th")).toHaveAttribute("aria-sort","descending");
    await exportRows("Exportar Planificador");const rows=mocks.json.mock.calls[0][0];expect(rows).toHaveLength(2);expect(rows[0]).toMatchObject({"ID Jornada":"J1","OS Nº":order.os_numero,Horas:2.5,Auxiliares:""});expect(rows[1]).toMatchObject({"ID Jornada":"J2",Horas:0});expect(mocks.update).not.toHaveBeenCalled();
  });
  it("blocks stale exports after a required read fails and allows retry",async()=>{
    mocks.errorTable="servicio_jornadas";plan();await screen.findByRole("alert");fireEvent.keyDown(screen.getByRole("button",{name:"Acciones de la sección"}),{key:"Enter"});expect(await screen.findByRole("menuitem",{name:"Exportar Planificador"})).toHaveAttribute("data-disabled");
    fireEvent.keyDown(screen.getByRole("menuitem",{name:"Exportar Planificador"}),{key:"Escape"});mocks.errorTable="";fireEvent.click(screen.getByRole("button",{name:"Reintentar"}));await screen.findAllByRole("button",{name:`Abrir jornada ${service.trabajo_descripcion}`});
  });
  it("OS keeps negative amounts, missing money and separate states without stacking",async()=>{
    orders();await screen.findByRole("button",{name:`Detalle ${order.os_numero}`});const table=screen.getByRole("table",{name:"OS vinculadas"});const cells=within(within(table).getAllByRole("row")[1]).getAllByRole("cell");
    expect(cells[4]).toHaveTextContent("2,5");expect(cells[4]).toHaveClass("text-center");expect(cells[5]).toHaveTextContent("—");expect(cells[7]).toHaveTextContent("$ -1,25");expect(cells[8]).toHaveTextContent("$ 9,30");expect(cells[9]).toHaveTextContent("Cerrada · CRÉDITO 30 DÍAS");expect(table.querySelectorAll("td br, td .flex-col")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button",{name:`Detalle ${order.os_numero}`}));const info=await screen.findByRole("dialog",{name:`Detalle ${order.os_numero}`});expect(info).toHaveTextContent("0000ABC");expect(info).toHaveTextContent("00000123");fireEvent.click(screen.getByRole("button",{name:"Ver trabajo"}));expect(mocks.work.mock.calls.at(-1)?.[0]).toMatchObject({trabajoId:"W1"});
  });
  it("OS export contains complete invoice/chassis/crew, amounts and filtered ordering",async()=>{
    orders();await screen.findByRole("button",{name:`Detalle ${order.os_numero}`});await exportRows("Exportar OS vinculadas");
    const rows=mocks.sheet.mock.calls[0][0];expect(rows[1]).toEqual([order.os_numero,"TR0001",client.nombre,expect.any(Date),2.5,null,10.55,-1.25,9.3,"Cerrada · CRÉDITO 30 DÍAS","00000123","0000ABC","TÉCNICO COMPLETO"]);
  });
  it("OS load failure is not shown as an empty list",async()=>{
    mocks.errorTable="ordenes_servicio_importadas";orders();expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar");expect(screen.queryByText(/No hay OS vinculadas/)).not.toBeInTheDocument();
  });
  it("does not grant export permission when unifying the planner",async()=>{
    mocks.can.mockReturnValue(false);plan();await screen.findAllByRole("button",{name:`Abrir jornada ${service.trabajo_descripcion}`});expect(screen.queryByRole("button",{name:"Acciones de la sección"})).not.toBeInTheDocument();
  });
});
