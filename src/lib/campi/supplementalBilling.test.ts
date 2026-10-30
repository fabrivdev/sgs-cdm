import {beforeEach,expect,it,vi} from 'vitest';
import {combinedSupplemental} from './supplementalBilling';
import {loadSalesStories} from './salesStories';
import {scopedSalesStory} from './salesScope';
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc}}));
function additional(from:string,to:string){
 const periods:string[]=[];for(let m=+from.slice(5,7);m<=+to.slice(5,7);m++)periods.push(`${from.slice(0,4)}-${String(m).padStart(2,'0')}-01`);
 const categories=['otros','sin_clasificar','revision'].map((id,i)=>({id,resumen:{ventas:(i+1)*10*periods.length,notas_credito:-i*periods.length,facturado:((i+1)*10-i)*periods.length,lineas:periods.length},periodos:periods.map(periodo=>({periodo,ventas:(i+1)*10,notas_credito:-i,facturado:(i+1)*10-i,lineas:1}))}));
 return {version:1,desde:from,hasta:to,coverage:'observed-canonical',controls:{filas:periods.length*3,identidades:periods.length*3,invalidas:0,signos_invalidos:0,neto:periods.length*57},categories};
}
beforeEach(()=>{rpc.mockReset().mockImplementation(async(name,args)=>{
 if(name==='campi_facturacion_adicional_v1')return {data:additional(args.p_desde,args.p_hasta),error:null};
 const months=Array.from({length:+args.p_hasta.slice(5,7)-+args.p_desde.slice(5,7)+1},(_,i)=>`${args.p_desde.slice(0,4)}-${String(+args.p_desde.slice(5,7)+i).padStart(2,'0')}-01`);
 return {data:{resumen:{ventas:100*months.length,notas_credito:-10*months.length,facturado:90*months.length},periodos:months.map(periodo=>({periodo,ventas:100,notas_credito:-10,facturado:90}))},error:null};
});});
it('suma el complemento completo, incluidos desconocidos y revisión, sin confundirlos con cero',()=>{
 const a=additional('2026-01-01','2026-10-29');expect(combinedSupplemental(a,a.desde,a.hasta).resumen).toEqual({ventas:600,notas_credito:-30,facturado:570,lineas:30});
 for(const field of ['identidades','invalidas','signos_invalidos'] as const){const b=structuredClone(a);b.controls[field]++;expect(()=>combinedSupplemental(b,a.desde,a.hasta)).toThrow();}
 const bad=structuredClone(a);bad.categories[0].periodos.pop();expect(()=>combinedSupplemental(bad,a.desde,a.hasta)).toThrow();
 const duplicate=structuredClone(a);duplicate.categories[1].id='otros';expect(()=>combinedSupplemental(duplicate,a.desde,a.hasta)).toThrow();
 const mismatch=structuredClone(a);mismatch.controls.neto++;expect(()=>combinedSupplemental(mismatch,a.desde,a.hasta)).toThrow();
 expect(()=>combinedSupplemental(a,'2026-02-01',a.hasta)).toThrow();
});
it.each(['month','ytd'] as const)('integra Otros una sola vez por periodo en %s y conserva bruto NC neto',async mode=>{
 const [gross,net]=await loadSalesStories(['ventas_evolucion','ventas_facturacion'],['repuestos.ventas','servicios.dashboard'],'2026-10-29',mode);
 expect(gross.status).toBe('ready');expect(net.status).toBe('ready');
 expect(gross.primary?.value).toBe(mode==='month'?160:1600);expect(net.primary?.value).toBe(mode==='month'?147:1470);
 expect(net.billingComponents).toEqual(mode==='month'?{gross:160,credits:-13,net:147}:{gross:1600,credits:-130,net:1470});
 expect(gross.salesScopes?.map(x=>x.label)).toEqual(['Repuestos','Otros']);
 expect(scopedSalesStory(gross,'servicios.dashboard').primary?.value).toBe(mode==='month'?60:600);
 expect(scopedSalesStory(gross,'repuestos.ventas').primary?.value).toBe(mode==='month'?100:1000);
 expect(scopedSalesStory(gross,null).primary?.value).toBe(gross.primary?.value);
 expect(gross.billingCoverage).toEqual({additional:'available',allCoreAreas:false});
 expect(rpc.mock.calls.filter(([name])=>name==='campi_facturacion_adicional_v1')).toHaveLength(2);
});
it('no consulta Otros sin permiso y no bloquea las áreas existentes si falta RPC',async()=>{
 const [limited]=await loadSalesStories(['ventas_facturacion'],['repuestos.ventas'],'2026-10-29');
 expect(limited.billingCoverage?.additional).toBe('unauthorized');expect(rpc.mock.calls.some(([n])=>n==='campi_facturacion_adicional_v1')).toBe(false);
 const original=rpc.getMockImplementation()!;rpc.mockImplementation(async(name,args)=>name==='campi_facturacion_adicional_v1'?{error:{message:'PGRST202'},data:null}:original(name,args));
 const [partial]=await loadSalesStories(['ventas_facturacion'],['repuestos.ventas','servicios.dashboard'],'2026-10-29');
 expect(partial.status).toBe('ready');expect(partial.primary?.value).toBe(90);expect(partial.billingCoverage?.additional).toBe('unavailable');expect(partial.sections).toEqual(['repuestos.ventas']);
});
