import {it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({failure:'source',from:''}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>{
 const query={select:()=>query,gte:(_key:string,value:string)=>{state.from=value;return query;},lte:()=>query,order:()=>query,range:async()=>{
 const historical=state.from<'2026-10-01';
 if(historical&&state.failure==='source')return {error:new Error('history unavailable'),data:null,count:null};
 const row=(os:string,date:string)=>({os_numero:os,fecha_abierta_os:'2026-01-01',fecha_cierre_os:date,fecha_emision_factura:'2026-10-20',situacion_os:'Cerrada',tipo_tiempo:'Cliente',servicios_cantidad:2});
 const data=[row('current','2026-10-20'),...(historical?[row('old','2026-09-20')]:[])];return {data,count:data.length,error:null};
 }};return query;
}}}));
vi.mock('@/features/service-orders/billing',async(importOriginal)=>({...await importOriginal<typeof import('@/features/service-orders/billing')>(),loadOrderBilling:async(_client:unknown,ids:string[])=>{
 if(ids.includes('old'))throw new Error('historic billing unavailable');
 return {CURRENT:{os:'current',matched:true,ambiguous:false,documents:['invoice'],date:'2026-10-20',labor:100,parts:0,travel:0,thirdParty:0,total:100,laborLines:1,missingRates:0,billedHours:2}};
}}));
import {loadManagerialStories} from './managerialStories';
it.each(['source','billing'])('keeps both current service KPIs when historical %s fails',async(failure)=>{
 state.failure=failure;
 const stories=await loadManagerialStories(['servicios_eficiencia','servicios_os_facturadas'],['servicios.ordenes','servicios.ventas'],'2026-10-21');
 for(const story of stories){expect(story.status).toBe('ready');expect(story.primary?.value).toBe(100);expect(story.chart).toBeNull();expect(story.details.join()).toContain('Serie histórica no disponible');}
});
