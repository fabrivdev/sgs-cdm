import type { PanoramaStory } from './panoramaStoryTypes';
const amount = (v: unknown): number => { if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new Error('Importe inválido.'); return v; };
const count = (v: unknown): number => { const n=amount(v); if(!Number.isInteger(n))throw new Error('Conteo inválido.'); return n; };
/** An unverified new breakdown must never hide the already validated order totals. */
export function withOrderComposition(story: PanoramaStory, raw: unknown): PanoramaStory {
 if (!raw || typeof raw !== 'object' || !('pedidos_completos' in raw)) return story;
 try { return validateOrderComposition(story, raw); } catch { return story; }
}
export function validateOrderComposition(story: PanoramaStory, raw: unknown): PanoramaStory {
 const data=raw as {pedidos_completos?: {id:string;unidades:number;disponibles:number;categoria:string;clasificable:boolean}[]};
 if(data.pedidos_completos===undefined)return story;
 if(!Array.isArray(data.pedidos_completos))throw new Error('Universo de pedidos inválido.');
 const rows=data.pedidos_completos, labels=['Cobertura completa','Cobertura parcial','Sin cobertura','No clasificables'];
 if(rows.length!==story.primary?.value || new Set(rows.map(r=>r.id)).size!==rows.length)throw new Error('Universo de pedidos no concilia.');
 for(const row of rows){
   if(!row.id || !labels.includes(row.categoria))throw new Error('Pedido sin identidad o categoría.');
   if (typeof row.clasificable !== 'boolean' || (row.categoria === 'No clasificables') !== !row.clasificable) throw new Error('Clasificación no acreditada.');
   count(row.unidades);count(row.disponibles);
   if(row.categoria==='Cobertura completa' && (row.unidades<=0 || row.disponibles!==row.unidades))throw new Error('Cobertura completa inválida.');
   if(row.categoria==='Cobertura parcial' && !(row.disponibles>0 && row.disponibles<row.unidades))throw new Error('Cobertura parcial inválida.');
   if(row.categoria==='Sin cobertura' && row.disponibles!==0)throw new Error('Cobertura nula inválida.');
 }
 const units=story.supporting.find(r=>r.label==='Unidades pendientes')?.value;
 if(rows.reduce((sum,r)=>sum+r.unidades,0)!==units)throw new Error('Unidades de pedidos no concilian.');
 const full=rows.filter(r=>r.categoria===labels[0]).length;
 // Only this exhaustive order universe includes lines without an assigned unit.
 // The ready-stock RPC denominator excludes those lines and cannot prove full coverage.
 if(story.machineOrders) story={...story,machineOrders:{...story.machineOrders,ready:story.machineOrders.ready.map(ready=>{
   const row=rows.find(r=>r.id===ready.id);
   return {...ready,pendingUnits:row?.clasificable && row.disponibles===ready.units ? row.unidades : undefined};
 })}};
 return {...story,supporting:story.supporting.map(r=>r.label==='Pedidos con stock completo'?{...r,value:full}:r),chart:{kind:'bars',title:'Cobertura de todos los pedidos pendientes',unit:'count',rows:labels.map(label=>({label,value:rows.filter(r=>r.categoria===label).length}))}};
}
export function withPartsExpansion(story: PanoramaStory, raw: unknown): PanoramaStory {
 const data=raw as {tramos_compra?:{tramo:string;codigos:number;valor_usd:number}[];transiciones?:{codigo:string;destino:string;dias_hasta:number;valor_usd:number}[]};
 if(story.id==='repuestos_stock' && data.tramos_compra!==undefined){
   const rows=data.tramos_compra;
   if(!Array.isArray(rows)||new Set(rows.map(r=>r.tramo)).size!==rows.length||rows.some(r=>!['366–1000 días','>1000 días','Sin fecha válida'].includes(r.tramo)))throw new Error('Tramos inválidos.');
   const total=rows.reduce((sum,r)=>{count(r.codigos);return sum+amount(r.valor_usd);},0);
   if(Math.abs(total-(story.primary?.value??0))>0.02)throw new Error('Tramos no concilian con stock antiguo.');
   // Keep the card's Gris/Rojo composition; age buckets belong to the deeper view.
   return {...story,detailChart:{kind:'bars',title:'Valor antiguo por días desde última compra',unit:'USD',rows:rows.map(r=>({label:r.tramo,value:r.valor_usd}))}};
 }
 if(story.id==='repuestos_alertas' && data.transiciones!==undefined){
   const rows=data.transiciones;
   if(!Array.isArray(rows)||new Set(rows.map(r=>r.codigo)).size!==rows.length)throw new Error('Transiciones duplicadas.');
   for(const row of rows)if(!row.codigo||!['GRIS','ROJO'].includes(row.destino)||count(row.dias_hasta)<1||row.dias_hasta>30)throw new Error('Transición inválida.');
   if(Math.abs(rows.reduce((sum,r)=>sum+amount(r.valor_usd),0)-(story.primary?.value??0))>0.02)throw new Error('Transiciones no concilian.');
   const windows = [{label:'1–7 días',from:1,to:7},{label:'8–14 días',from:8,to:14},{label:'15–21 días',from:15,to:21},{label:'22–30 días',from:22,to:30}];
   if(story.chart?.kind==='bars')for(const name of ['GRIS','ROJO'] as const){
     const expected=story.chart.rows.find(item=>item.label.toUpperCase()===name);
     const matching=rows.filter(item=>item.destino===name);
     if(!expected||expected.count!==matching.length||typeof expected.value!=='number'||!Number.isFinite(expected.value)||Math.abs(expected.value-matching.reduce((sum,item)=>sum+item.valor_usd,0))>0.02)throw new Error('Transiciones no concilian por destino.');
   }
   const changeBuckets = windows.map(window=>{
     const within = rows.filter(row=>row.dias_hasta>=window.from&&row.dias_hasta<=window.to);
     const destination = (name:'GRIS'|'ROJO')=>{
       const matching = within.filter(row=>row.destino===name);
       return {value:matching.reduce((sum,row)=>sum+row.valor_usd,0),count:matching.length};
     };
     return {label:window.label,gris:destination('GRIS'),rojo:destination('ROJO')};
   });
   const buckets = changeBuckets.map(bucket=>({label:bucket.label,
     value:bucket.gris.value+bucket.rojo.value,codes:bucket.gris.count+bucket.rojo.count}));
   if(Math.abs(buckets.reduce((sum,bucket)=>sum+bucket.value,0)-(story.primary?.value??0))>0.02||buckets.reduce((sum,bucket)=>sum+bucket.codes,0)!==rows.length)throw new Error('Ventanas de transición no concilian.');
   return {...story,changeBuckets,chart:{kind:'bars',title:'Cambios posibles por ventana de 30 días',unit:'USD',rows:buckets.map(bucket=>({label:bucket.label,value:bucket.value,count:bucket.codes}))}};
 }
 return story;
}
export type CustomerIdentity={id:string;propietario:boolean;base:boolean;actual:boolean;servicios:boolean;repuestos:boolean};
export type CustomerCohortPayload={
 version:number;desde:string;hasta:string;prev_desde:string;prev_hasta:string;
 cohorte_base:string[];cohorte_actual:string[];retenidos:string[];
 propietarios:string[];propietarios_con_compra:string[];
 desglose_lineas:null;desglose_estado:string;
};
const ids=(value:unknown):string[]=>{
 if(!Array.isArray(value)||value.some(id=>typeof id!=='string'||!id)||new Set(value).size!==value.length)throw new Error('Identidades de clientes inválidas.');
 return value;
};
export function validateCustomerCohorts(raw:unknown, expected:{
 desde:string;hasta:string;prev_desde:string;prev_hasta:string;
 compradores_base:number;compradores_retenidos:number;
 propietarios_elegibles:number;propietarios_con_compra_actual:number;
}):CustomerCohortPayload{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Cohortes de clientes ausentes.');
 const data=raw as Record<string,unknown>;
 if(data.version!==2||['desde','hasta','prev_desde','prev_hasta'].some(key=>data[key]!==expected[key as keyof typeof expected])
   ||data.desglose_lineas!==null||data.desglose_estado!=='pendiente_definicion_no_aditiva')throw new Error('Ventanas o desglose de clientes incompatibles.');
 const base=ids(data.cohorte_base),actual=ids(data.cohorte_actual),retained=ids(data.retenidos),owners=ids(data.propietarios),buyers=ids(data.propietarios_con_compra);
 const baseSet=new Set(base),actualSet=new Set(actual),ownerSet=new Set(owners);
 if(base.length!==expected.compradores_base||retained.length!==expected.compradores_retenidos
   ||owners.length!==expected.propietarios_elegibles||buyers.length!==expected.propietarios_con_compra_actual
   ||retained.some(id=>!baseSet.has(id)||!actualSet.has(id))||buyers.some(id=>!ownerSet.has(id)))throw new Error('Las identidades de clientes no concilian.');
 return data as CustomerCohortPayload;
}
/** A common denominator and deduplicated union. Must reconcile against the existing summary before use. */
export function customerCohorts(rows: readonly CustomerIdentity[]) {
 if(new Set(rows.map(r=>r.id)).size!==rows.length||rows.some(r=>!r.id||['propietario','base','actual','servicios','repuestos'].some(k=>typeof r[k as keyof CustomerIdentity]!=='boolean')||r.actual!==(r.servicios||r.repuestos)))throw new Error('Identidades de clientes incompletas.');
 const owners=rows.filter(r=>r.propietario), base=rows.filter(r=>r.base);
 return {base:base.map(r=>r.id),retained:base.filter(r=>r.actual).map(r=>r.id),owners:owners.map(r=>r.id),services:owners.filter(r=>r.servicios).map(r=>r.id),parts:owners.filter(r=>r.repuestos).map(r=>r.id),union:owners.filter(r=>r.actual).map(r=>r.id)};
}
