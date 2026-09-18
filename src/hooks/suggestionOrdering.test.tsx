import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cargarSugerenciaViva, useSugerenciaViva, type ResultadoSugerencia } from "./useSugerenciasCompra";
import { orderSuggestions } from "@/lib/suggestionTableOrder";
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc}}));
const records=Array.from({length:80},(_,i)=>({producto_codigo:"REP"+(i+1),marca:i%2?"CLAAS":"HORSCH",codigo_fabricante:i===2?null:"FAB"+(80-i),descripcion:"Pieza "+(80-i),segmento:i%2?"FLUJO ESTABLE":"ESTRELLA",stock_global:80-i,sugerencia_unidades:i%3,unidades_12m:0}) as ResultadoSugerencia);
const summary={total_piezas:40,piezas_sugeridas:26,unidades_sugeridas:39,piezas_nuevas_sin_historial:0,piezas_sin_ventas_recientes:0,piezas_confianza_baja:0};
function mock(){rpc.mockImplementation(async(name,args)=>{
  const rows=orderSuggestions(records.filter(r=>r.marca===args.p_marca&&(!args.p_solo_sugeridos||r.sugerencia_unidades>0)),{key:args.p_orden,direction:args.p_direccion});
  return {data:{resumen:summary,total_filtrado:rows.length,rows:rows.slice(args.p_offset,args.p_offset+args.p_limite)}};
});}
function Page({page=1}:{page?:number}){
  const q=useSugerenciaViva(["CLAAS","HORSCH"],"2026-08-31",{orden:{key:"stock_global",direction:"asc"},soloSugeridos:false},page);
  return <div>{q.data?.rows.map(r=><span key={r.producto_codigo}>{r.producto_codigo}:{r.stock_global};</span>)}</div>;
}
afterEach(()=>{cleanup();rpc.mockReset();});
describe("global suggestion ordering",()=>{
  it.each(["marca","codigo_fabricante","descripcion","segmento"])("preserves complete merged export and server order for %s",async key=>{
    mock();const sort={key,direction:"desc" as const};
    const full=await cargarSugerenciaViva(["CLAAS","HORSCH"],"2026-08-31",{orden:sort,soloSugeridos:false});
    expect(full.rows).toEqual(orderSuggestions(records,sort));
    expect(full.rows).toHaveLength(80);
    expect(rpc).toHaveBeenCalledWith("repuestos_sugerencia_viva_ordenada",expect.objectContaining({p_orden:key,p_direccion:"desc"}));
  });
  it("orders on the server before merging brand partitions and paginating",async()=>{
    mock();const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
    const view=render(<QueryClientProvider client={client}><Page/></QueryClientProvider>);
    await screen.findByText("REP80:1;");
    expect(rpc).toHaveBeenCalledWith("repuestos_sugerencia_viva_ordenada",expect.objectContaining({p_orden:"stock_global",p_direccion:"asc",p_offset:0}));
    expect(view.container.textContent).toBe(orderSuggestions(records,{key:"stock_global",direction:"asc"}).slice(0,50).map(r=>r.producto_codigo+":"+r.stock_global+";").join(""));
    view.rerender(<QueryClientProvider client={client}><Page page={2}/></QueryClientProvider>);
    await screen.findByText("REP30:51;");
    await waitFor(()=>expect(view.container.textContent).toBe(orderSuggestions(records,{key:"stock_global",direction:"asc"}).slice(50).map(r=>r.producto_codigo+":"+r.stock_global+";").join("")));
  });
  it("complete export respects soloSugeridos=false and rejects truncated responses",async()=>{
    mock();const full=await cargarSugerenciaViva("CLAAS","2026-08-31",{orden:{key:"stock_global",direction:"asc"},soloSugeridos:false});
    expect(full.rows).toHaveLength(40);expect(full.rows.some(r=>r.sugerencia_unidades===0)).toBe(true);
    rpc.mockResolvedValue({data:{resumen:summary,total_filtrado:41,rows:[]}});
    await expect(cargarSugerenciaViva("CLAAS","2026-08-31",{})).rejects.toThrow("incompleta");
  });
});
