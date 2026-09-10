import {afterEach,describe,it,expect,vi} from "vitest";
import {render,screen,fireEvent,cleanup,within} from "@testing-library/react";
import {SalesExplorer} from "./Ventas";
import {documentsFixture,clientsFixture} from "@/test/sales-fixtures";
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc}}));
afterEach(()=>{cleanup();rpc.mockReset();});
function setup(area:"servicios"|"repuestos"="servicios"){
 rpc.mockImplementation(async(name:string)=>({data:name==="ventas_clientes_comparacion"?clientsFixture:documentsFixture,error:null}));
 return render(<SalesExplorer area={area} data={null} loading={false} desde="2026-07-01" hasta="2026-09-10" sucursal="TODAS" buscar=""/>);
}
describe("Ventas por negocio",()=>{
 it("presenta una OS con dos facturas y permite consultar ambas",async()=>{
  setup();
  const order=await screen.findByRole("button",{name:"01-00000104"});
  expect(rpc).toHaveBeenCalledWith("ventas_servicios_os",expect.objectContaining({p_area:"servicios"}));
  expect(screen.getAllByText("Campos del Mañana S.A.")).toHaveLength(1);
  fireEvent.click(order);
  expect(screen.getByText("001000000082")).toBeInTheDocument();
  expect(screen.getByText("001001005035")).toBeInTheDocument();
  expect(screen.getAllByText("Mano de obra").length).toBeGreaterThan(0);
 });
 it("muestra ambos códigos del repuesto sin abrir la factura",async()=>{
  setup("repuestos");
  expect(await screen.findByText("REP000087")).toBeInTheDocument();
  expect(screen.getByText("1395950")).toBeInTheDocument();
  expect(screen.getByRole("columnheader",{name:"Cód. repuesto"})).toBeInTheDocument();
  expect(screen.getByRole("columnheader",{name:"Cód. fabricante"})).toBeInTheDocument();
 });
 it("presenta clientes en tabla con variaciones positivas y negativas",async()=>{
  setup();
  fireEvent.click(screen.getByRole("button",{name:"Clientes"}));
  const name=await screen.findByText("Ganadera El Fogón S.A.");
  expect(name.closest("tr")).not.toBeNull();
  expect(within(name.closest("tr")!).getByText("-50.0%")).toBeInTheDocument();
  expect(screen.getByText("+29.8%")).toBeInTheDocument();
 });
});

