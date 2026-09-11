/* eslint-disable @typescript-eslint/no-explicit-any -- builder mínimo para simular consultas Supabase. */
import {afterEach,describe,it,expect,vi} from "vitest";
import {render,screen,fireEvent,cleanup,within} from "@testing-library/react";
import {SalesExplorer} from "./Ventas";
import {documentsFixture,clientsFixture} from "@/test/sales-fixtures";
const {rpc,from}=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc,from}}));
afterEach(()=>{cleanup();rpc.mockReset();from.mockReset();});
function setup(area:"servicios"|"repuestos"="servicios"){
 const currentLines=[
  {id:"l1",factura:"001000000082",os:"01-00000104",cliente:"Campos del Mañana S.A.",componente:"Mano de obra",total_venta:480},
  {id:"l2",factura:"001001005035",os:"01-00000104",cliente:"Campos del Mañana S.A.",componente:"Repuestos",total_venta:39},
  {id:"l3",factura:"001000000090",os:"01-00000105",cliente:"Ganadera El Fogón S.A.",componente:"Mano de obra",total_venta:250},
 ];
 const previousLines=[
  {id:"p1",factura:"000100",os:"01-00000010",cliente:"Campos del Mañana S.A.",componente:"Mano de obra",total_venta:400},
  {id:"p2",factura:"000101",os:"01-00000011",cliente:"Ganadera El Fogón S.A.",componente:"Mano de obra",total_venta:500},
 ];
 rpc.mockImplementation(async(name:string,params:Record<string,string>)=>{
  if(name==="ventas_servicios_detalle_os") return {data:[{id:"01-00000104",fecha:"2026-09-08",os:"01-00000104",os_numero:"01-00000104",chasis:"24491421",cliente:"Campos del Mañana S.A.",sucursal:"Santa Rita",tipo_tiempo:"Garantía",facturas:2,mo:480,km:0,repuestos:39,terceros:0,total:519}],error:null};
  if(name==="ventas_servicios_lineas") return {data:String(params?.p_desde||"").startsWith("2025")?previousLines:currentLines,error:null};
  if(name==="ventas_clientes_comparacion") return {data:clientsFixture,error:null};
  return {data:documentsFixture,error:null};
 });
 const query=(result:unknown)=>{const builder:any={};["select","order","eq","ilike","in","limit","maybeSingle"].forEach((method)=>{builder[method]=()=>builder;});builder.then=(resolve:any,reject:any)=>Promise.resolve(result).then(resolve,reject);return builder;};
 from.mockImplementation((table:string)=>{
  if(table==="ordenes_servicio_importadas") return query({data:[{os_numero:"01-00000104",fecha_abierta_os:"2026-09-01",fecha_cierre_os:"2026-09-08",fecha_emision_factura:"2026-09-08",factura:"001000000082",tipo_tiempo:"Garantía",problema:"Mantenimiento programado",servicios_cantidad:8,servicios_valor:480,km_cantidad:0,kilometro_valor:0,repuesto_valor:39,terceros_valor:0,situacion_os:"Cerrada",situacion_facturacion:"Facturada",responsable:"Técnico Demo",cliente_nombre:"Campos del Mañana S.A.",marca:"CLAAS",raw_data:null}],error:null});
  if(table==="facturacion_lineas_importadas") return query({data:[{id:"l1",factura:"001000000082",codigo_interno_factura:null,fecha_factura:"2026-09-08",grupo_normalizado:"Servicio",subgrupo_original:"Mano de obra",cod_mercaderia:null,codigo_fabricante:null,mercaderia:"Servicio técnico",observacion:null,cantidad:8,valor_unitario:60,total_venta:480,raw_data:{linked_service_order:"01-00000104"}},{id:"l2",factura:"001001005035",codigo_interno_factura:null,fecha_factura:"2026-09-08",grupo_normalizado:"Repuestos",subgrupo_original:"Repuestos",cod_mercaderia:"REP000087",codigo_fabricante:"1395950",mercaderia:"Tapa de cierre",observacion:null,cantidad:1,valor_unitario:39,total_venta:39,raw_data:{linked_service_order:"01-00000104"}}],error:null});
  return query({data:{modelo_tipo:"AXION 870",marca:"CLAAS",sucursal:"Santa Rita",clientes:{nombre:"Campos del Mañana S.A."}},error:null});
 });
 return render(<SalesExplorer area={area} data={null} loading={false} desde="2026-07-01" hasta="2026-09-10" sucursal="TODAS" buscar=""/>);
}
describe("Ventas por negocio",()=>{
 it("presenta una OS con dos facturas y permite consultar ambas",async()=>{
  setup();
  const order=await screen.findByRole("button",{name:"01-00000104"});
  expect(rpc).toHaveBeenCalledWith("ventas_servicios_os",expect.objectContaining({p_area:"servicios"}));
  expect(screen.getAllByText("Campos del Mañana S.A.")).toHaveLength(1);
  fireEvent.click(order);
  expect(await screen.findByText(/001000000082 · 001001005035/)).toBeInTheDocument();
  expect(screen.getByText("Mano de obra")).toBeInTheDocument();
 });
 it("muestra ambos códigos del repuesto sin abrir la factura",async()=>{
  setup("repuestos");
  expect(await screen.findByText("REP000087")).toBeInTheDocument();
  expect(screen.getByText("1395950")).toBeInTheDocument();
  expect(screen.getByRole("columnheader",{name:"Cód. repuesto"})).toBeInTheDocument();
  expect(screen.getByRole("columnheader",{name:"Cód. fabricante"})).toBeInTheDocument();
 });
 it("presenta clientes en lista y no inventa variaciones entre metodologías",async()=>{
  setup();
  fireEvent.click(screen.getByRole("button",{name:"Clientes"}));
  const name=await screen.findByText("Ganadera El Fogón S.A.");
  const row=name.parentElement;
  expect(row).not.toBeNull();
  expect(within(row!).getByText("—")).toBeInTheDocument();
  expect(screen.getByTitle(/Período no comparable/)).toBeInTheDocument();
 });
});

