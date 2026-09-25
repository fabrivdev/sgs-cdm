import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComprasPedidosTab } from "./ComprasPedidosTab";
import { SolicitudesCompraTab } from "./SolicitudesCompraTab";
import { purchaseMoney } from "./purchaseTableFormat";
import type { PedidoLinea, SolicitudLinea } from "@/hooks/useCompras";

const mocks = vi.hoisted(()=>({summary:vi.fn(),orders:vi.fn(),requests:vi.fn(),links:vi.fn(),maker:vi.fn(),can:vi.fn(),refetch:vi.fn(),
  upsert:vi.fn(),sheet:vi.fn((rows:Record<string,unknown>[])=>({rows})),book:vi.fn(()=>({})),append:vi.fn(),write:vi.fn()}));
vi.mock("@tanstack/react-query",async original=>({...await original<typeof import("@tanstack/react-query")>(),useQuery:mocks.summary}));
vi.mock("@/hooks/useCompras",()=>({useComprasPedidosLineas:mocks.orders,useComprasSolicitudesLineas:mocks.requests,useComprasVinculos:mocks.links,useProductosFabricanteMap:mocks.maker}));
vi.mock("@/hooks/useAuth",()=>({useAuth:()=>({user:{id:"operator"},can:mocks.can})}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:()=>({upsert:mocks.upsert})}}));
vi.mock("xlsx",()=>({utils:{json_to_sheet:mocks.sheet,book_new:mocks.book,book_append_sheet:mocks.append},writeFile:mocks.write}));
const order:PedidoLinea={sucursal:"Santa Rita",nroPedido:"000010",item:"0001",productoCodigo:"REPIN000001",fecha:"2026-09-17",precioUnitario:8.44,
  proveedorCodigo:"0001",proveedorNombre:"PROVEEDOR CON NOMBRE EXTENSO",moneda:"USD",descripcion:"RODAMIENTO CON DESCRIPCIÓN EXTENSA",unidad:"UN",cantidad:1.25,valorTotal:10.55,cantidadEntregada:1,cantidadPendiente:0.25};
const second:PedidoLinea={...order,item:"0002",productoCodigo:"REPIN000002",cantidad:2.5,valorTotal:21.1,cantidadPendiente:2.5};
const request:SolicitudLinea={sucursal:"Santa Rita",nroSolicitud:"000003",item:"0001",productoCodigo:order.productoCodigo,fechaEmision:"2026-09-01",precioUnitario:8.44,
  solicitante:"SOLICITANTE CON NOMBRE EXTENSO",moneda:"USD",codigoFabricante:"000123",marcaSolicitada:"CLAAS",descripcion:order.descripcion,unidad:"UN",cantidad:1.25,valorTotal:10.55,observacion:null};
const summary={sucursal:"Santa Rita",nro_pedido:"000010",fecha_emision:"2026-09-17",proveedor_nombre:order.proveedorNombre,moneda:"USD",cantidad_items:2,
  valor_total:31.65,cantidad_pendiente_total:2.75,estado_seguimiento:"En transito",fecha_estimada_llegada:null,nro_seguimiento:null,notas:null};
const query = (data:unknown) => ({data,isLoading:false,isError:false,refetch:mocks.refetch});
beforeEach(()=>{
  vi.clearAllMocks(); vi.stubGlobal("ResizeObserver",class{observe(){} disconnect(){}});
  mocks.summary.mockReturnValue(query([summary])); mocks.orders.mockReturnValue(query([order,second])); mocks.requests.mockReturnValue(query([request]));
  mocks.links.mockReturnValue(query([])); mocks.maker.mockReturnValue(query(new Map([[order.productoCodigo,"000123"]]))); mocks.can.mockReturnValue(true);
  mocks.upsert.mockResolvedValue({error:null});
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function setup(type:"orders"|"requests"="orders") {
  render(<QueryClientProvider client={new QueryClient()}>{type==="orders"?<ComprasPedidosTab/>:<SolicitudesCompraTab/>}</QueryClientProvider>);
}
const itemRows = (name:string) => within(screen.getByRole("table",{name})).getAllByRole("row").slice(1).map(row=>within(row).getAllByRole("cell"));
async function exportItems(name:string) {
  const actions=screen.getByRole("button",{name:"Acciones de la sección"});
  expect(screen.getByRole("button",{name:/Más filtros/}).nextElementSibling).toContainElement(actions);
  fireEvent.keyDown(actions,{key:"Enter"}); fireEvent.click(await screen.findByRole("menuitem",{name}));
  await waitFor(()=>expect(mocks.write).toHaveBeenCalled()); return mocks.sheet.mock.calls[0][0];
}
describe("purchase table presentation",()=>{
  it("groups phone item identity and keeps the full detail and hidden-field ordering", async()=>{
    vi.stubGlobal("innerWidth",320);
    setup(); fireEvent.click(screen.getByRole("button",{name:"Ítems del pedido 000010 (Santa Rita)"}));
    const identity=screen.getByRole("button",{name:"Detalle REPIN000001"});
    expect(identity).toHaveTextContent(order.descripcion!);
    expect(identity).toHaveTextContent(order.productoCodigo);
    fireEvent.click(screen.getByRole("button",{name:"Ordenar ítems del pedido 000010"}));
    const ordering=await screen.findByRole("dialog");
    expect(within(ordering).getByRole("button",{name:/Ordenar Pendiente/})).toBeInTheDocument();
  });
  it("keeps order lines numeric-only, fractions, money and matching axes",()=>{
    setup(); fireEvent.click(screen.getByRole("button",{name:"Ítems del pedido 000010 (Santa Rita)"}));
    const rows=itemRows("Ítems del pedido 000010");
    expect(rows[0].map(cell=>cell.textContent)).toEqual(["0001","REPIN000001",order.descripcion,"1,25","$ 8,44","$ 10,55","0,25","Santa Rita-000003 (probable)"]);
    expect(rows[0][3]).toHaveClass("text-center"); expect(rows[0][6]).toHaveClass("text-center"); expect(rows[0][5]).toHaveClass("text-right");
    expect(rows[0][3]).toHaveAttribute("title","1.25 UN"); expect(rows[0][2]).toHaveAttribute("title",order.descripcion);
    const table=screen.getByRole("table",{name:"Ítems del pedido 000010"}); expect(table).toHaveClass("table-fixed");
    expect(table.querySelectorAll("td br,td p,td .flex-wrap")).toHaveLength(0);
    const heads=within(table).getAllByRole("columnheader"); expect(heads[3]).toHaveClass("text-center"); expect(within(heads[3]).getByRole("button")).toHaveClass("justify-center");
  });
  it("retains both directions for summaries and items and keyboard-ready headers",()=>{
    mocks.summary.mockReturnValue(query([summary,{...summary,nro_pedido:"000002",valor_total:2}])); setup();
    const table=screen.getByRole("table",{name:"Pedidos de compra"});
    fireEvent.click(within(table).getByRole("button",{name:"Ordenar Total: menor a mayor"}));
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("000002");
    fireEvent.click(within(table).getByRole("button",{name:"Ordenar Total: mayor a menor"})); expect(within(table).getAllByRole("row")[1]).toHaveTextContent("000010");
    fireEvent.click(screen.getByRole("button",{name:"Ítems del pedido 000010 (Santa Rita)"}));
    const items=screen.getByRole("table",{name:"Ítems del pedido 000010"});
    fireEvent.click(within(items).getByRole("button",{name:"Ordenar Cant.: menor a mayor"})); expect(itemRows("Ítems del pedido 000010")[0][3]).toHaveTextContent("1,25");
    fireEvent.click(within(items).getByRole("button",{name:"Ordenar Cant.: mayor a menor"})); expect(itemRows("Ítems del pedido 000010")[0][3]).toHaveTextContent("2,5");
    expect(within(items).getByRole("columnheader",{name:"Cant."})).toHaveAttribute("aria-sort","descending");
  });
  it("exports all filtered ordered items as original typed values",async()=>{
    setup(); fireEvent.change(screen.getAllByRole("searchbox",{name:"Buscar"})[0],{target:{value:"000123"}});
    await waitFor(()=>expect(itemRows("Ítems del pedido 000010")).toHaveLength(1));
    const exported=await exportItems("Exportar Ítems de pedidos");
    expect(exported).toHaveLength(1); expect(exported[0]).toMatchObject({"N° pedido":"000010",Ítem:"0001",Producto:"REPIN000001",Unidad:"UN",Cantidad:1.25,"Precio unitario":8.44,Total:10.55,Pendiente:0.25,Solicitudes:"Santa Rita-000003"});
  });
  it("retains request classification, probable/manual linkage and zero-price absence",()=>{
    mocks.requests.mockReturnValue(query([request,{...request,item:"0002",precioUnitario:0,productoCodigo:"REPIN000002"}])); setup("requests");
    fireEvent.click(screen.getByRole("button",{name:"Ítems de la solicitud 000003 (Santa Rita)"}));
    const rows=itemRows("Ítems de la solicitud 000003"); expect(rows[0][3].textContent).toBe("1,25"); expect(rows[0][4].textContent).toBe("$ 8,44");
    expect(rows[0][6]).toHaveTextContent("Santa Rita-000010 (probable)"); expect(rows[1][4].textContent).toBe("—"); expect(rows[1][5].textContent).toBe("Reposición"); expect(rows[1][6].textContent).toBe("—");
    expect(rows[0][3]).toHaveClass("text-center"); expect(rows[0][4]).toHaveClass("text-right");
  });
  it("keeps request export complete, manufacturer zeros, currency and values",async()=>{
    setup("requests"); const exported=await exportItems("Exportar Ítems de solicitudes");
    expect(exported[0]).toMatchObject({"N° solicitud":"000003","Código fabricante":"000123",Unidad:"UN",Cantidad:1.25,Total:10.55,Pedido:"Santa Rita-000010"});
  });
  it("keeps editing and ambiguous linking restricted to the existing permission",async()=>{
    setup(); fireEvent.click(screen.getByRole("button",{name:"Editar"})); expect(await screen.findByRole("dialog")).toHaveTextContent("Seguimiento — Pedido 000010"); cleanup();
    mocks.can.mockReturnValue(false); setup(); expect(screen.queryByRole("button",{name:"Editar"})).toBeNull(); expect(screen.queryByRole("button",{name:"Acciones de la sección"})).toBeNull(); cleanup();
    mocks.can.mockReturnValue(true); mocks.orders.mockReturnValue(query([order,{...order,nroPedido:"000011"}])); setup("requests");
    fireEvent.click(screen.getByRole("button",{name:"Ítems de la solicitud 000003 (Santa Rita)"})); fireEvent.click(screen.getByRole("button",{name:"Vincular (2)"}));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Elegir el pedido correspondiente"); expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("does not present missing dependencies as complete data or enable export",()=>{
    mocks.links.mockReturnValue({...query(undefined),isLoading:true}); setup(); expect(screen.getByText("Cargando pedidos…")).toBeInTheDocument(); expect(screen.queryByRole("table")).toBeNull(); cleanup();
    mocks.links.mockReturnValue({...query(undefined),isLoading:false,isError:true}); setup("requests"); expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar las solicitudes completas.");
    expect(screen.queryByRole("button",{name:"Acciones de la sección"})).toBeNull(); fireEvent.click(screen.getByRole("button",{name:"Reintentar"})); expect(mocks.refetch).toHaveBeenCalledTimes(3);
  });
  it("formats currencies without conversion or inventing an unknown currency",()=>{
    expect(purchaseMoney(10.55,"USD")).toBe("$ 10,55"); expect(purchaseMoney(10.55,"PYG")).toBe("₲ 10,55");
    expect(purchaseMoney(10.55,"EUR")).toBe("€ 10,55"); expect(purchaseMoney(10.55,null)).toBe("10,55"); expect(purchaseMoney(-2.11,"USD")).toBe("$ -2,11");
  });
  it("keeps secondary fields accessible by code without stacking table records",async()=>{
    setup(); fireEvent.click(screen.getByRole("button",{name:"Ítems del pedido 000010 (Santa Rita)"}));
    fireEvent.click(screen.getByRole("button",{name:"Detalle REPIN000001"}));
    const help=await screen.findByRole("dialog",{name:"Detalle REPIN000001"}); expect(help).toHaveTextContent("Pendiente0,25");
    expect(help).toHaveTextContent("UnidadUN"); expect(help).toHaveTextContent("Santa Rita-000003 (probable)"); expect(help).toHaveTextContent("$ 8,44");
    fireEvent.keyDown(help,{key:"Escape"}); await waitFor(()=>expect(screen.queryByRole("dialog",{name:"Detalle REPIN000001"})).toBeNull());
  });
});
