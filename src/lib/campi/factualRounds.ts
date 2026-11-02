import type { SectionKey } from '@/lib/permissions';
import type { PanoramaStory, StoryTopicId } from './panoramaStoryTypes';
import { validDay } from './panoramaDates';
import { commentEvidence, type CommentEvidence } from './commentReaction';

export type FactualComment = { id: string; topic: StoryTopicId; question: string; text: string; evidence?: CommentEvidence };
export function asuncionDay(now = new Date()): string {
 const parts = new Intl.DateTimeFormat('en-US',{timeZone:'America/Asuncion',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const part=(type:string)=>parts.find(p=>p.type===type)!.value;
 return `${part('year')}-${part('month')}-${part('day')}`;
}
import { finite, isSales, salesCopy, topicCopy } from './factualCopy';
const cumulative: Partial<Record<StoryTopicId,string>> = {
 ventas_evolucion:'Ventas acumuladas del año', ventas_facturacion:'Facturación neta acumulada',
 ventas_repuestos:'Ventas acumuladas del año', ventas_servicios:'Ventas acumuladas del año', ventas_maquinas:'Ventas acumuladas del año',
};
/** No raw-row aggregation, inferred historical snapshots, or secondary KPI substitution. */
export function factualVariants(story: PanoramaStory, allowed: (s:SectionKey)=>boolean, today = asuncionDay()): FactualComment[] {
 const original=story.primary;
 const p=original?{...original}:null;
 if(story.status==='error'||!p||!story.sections.length||!story.sections.every(allowed)) return [];
 const result:FactualComment[]=[];
 const push=(id:string,text:string|null,question:string,evidence:CommentEvidence)=>{if(text&&story.billingCoverage&&(story.billingCoverage.additional!=='available'||!story.billingCoverage.allCoreAreas))text+=' Cobertura parcial.';if(text&&!result.some(c=>c.text===text))result.push({id:`${story.id}|${id}`,topic:story.id,text,question,evidence});};
 const window=story.time?.window??story.navigationPeriod;
 const month=today.slice(0,7);
 const currentWindow=window && validDay(window.from)&&validDay(window.to)&&window.to===today&&window.to.slice(0,7)===month;
 const monthly=currentWindow&&window.from===`${month}-01`;
 const ytd=currentWindow&&story.periodMode==='ytd';
 const previousWindow=story.time?.comparison??story.businessWindow?.previous;
 const previousLabel=previousWindow?.from.slice(0,4)===String(Number(today.slice(0,4))-1)?'el mismo tramo del año anterior':'el tramo comparable anterior';
 if((monthly||ytd)&&!['maquinas_pedidos','repuestos_stock','repuestos_alertas'].includes(story.id)) {
  const period=story.periodMode==='ytd'?'ytd':'month';
  const text=isSales(story.id)?story.status==='ready'?salesCopy(story.id,p,period,previousLabel):null:topicCopy(story);
  push('primary',text,`¿Cuánto registra ${p.label.toLowerCase()} ${period==='ytd'?'en el acumulado disponible':'este mes'}?`,commentEvidence(story,p,period,window,previousWindow,isSales(story.id)));
 }
 const snapshot=story.id==='maquinas_pedidos'
  ?story.time?.observedAt===today&&story.machineOrders?.asOf===today&&story.machineOrders.orders===p.value
  :['repuestos_stock','repuestos_alertas'].includes(story.id)&&story.time?.inventoryCutoff===today&&story.time?.classificationDate===today;
 if(snapshot)push('snapshot',topicCopy(story),story.question,commentEvidence(story,p,'snapshot',undefined,undefined,false));
 const previousEnd=new Date(Date.parse(`${month}-01T00:00:00Z`)-86400000).toISOString().slice(0,10);
 if(story.id==='servicios_pendientes'&&story.time?.closedMonth&&window?.from===previousEnd.slice(0,7)+'-01'&&window.to===previousEnd)
  push('closed-month',topicCopy(story),'¿Cuál fue la mediana de resolución el mes pasado?',commentEvidence(story,p,'closed-month',window,undefined,false));
 // Exact date-range reads, same report contract and selected authorized sections.
 for(const temporal of (story.status==='ready'&&isSales(story.id)?story.temporalComparisons??[]:[])) {
  const shift=(day:string,days:number)=>new Date(Date.parse(day+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
  const yesterday=shift(today,-1),sunday=shift(today,-(new Date(today+'T00:00:00Z').getUTCDay()||7));
  const expected=temporal.kind==='day'?{from:yesterday,to:yesterday,previousFrom:shift(yesterday,-7),previousTo:shift(yesterday,-7)}:{from:shift(sunday,-6),to:sunday,previousFrom:shift(sunday,-13),previousTo:shift(sunday,-7)};
  if(temporal.current.from!==expected.from||temporal.current.to!==expected.to||temporal.previous.from!==expected.previousFrom||temporal.previous.to!==expected.previousTo)continue;
  const components=story.sections.map(section=>temporal.components.filter(c=>c.section===section));
  if(components.some(rows=>rows.length!==1)||components.flat().some(c=>!finite(c.value)||!finite(c.previous)))continue;
  const value=components.reduce((sum,rows)=>sum+rows[0].value,0),previous=components.reduce((sum,rows)=>sum+rows[0].previous,0);
  push(temporal.kind,salesCopy(story.id,{label:temporal.label,unit:p.unit,value,comparison:{value:previous,label:''}},temporal.kind),`¿Cómo varió ${temporal.label.toLowerCase()} en ${temporal.kind==='day'?'el último día cerrado frente al mismo día de la semana anterior':'la última semana completa frente a la anterior'}?`,commentEvidence(story,{label:temporal.label,unit:p.unit,value,comparison:{value:previous,label:''}},temporal.kind,temporal.current,temporal.previous,true));
 }
 // These exact labels are produced from the same gross/net KPI by salesStories.
 const annual=story.supporting.find(d=>d.label===cumulative[story.id]&&d.unit===p.unit);
 if(annual && currentWindow && story.status==='ready' && story.periodMode!=='ytd') push('accumulated',salesCopy(story.id,annual,'ytd'),`¿Cómo varía el acumulado disponible de ${p.label.toLowerCase()}?`,commentEvidence(story,annual,'ytd',undefined,undefined,true));
 // Do not traverse historic chart points: old months are not current commentary.
 return result;
}
/** Round-major order; selection order wins, never monetary ranking or a fixed quota. */
export function factualRounds(stories: readonly PanoramaStory[], allowed:(s:SectionKey)=>boolean):FactualComment[] {
 const unique=stories.filter((s,i)=>stories.findIndex(x=>x.id===s.id)===i);
 const groups=unique.map(s=>factualVariants(s,allowed));
 const out:FactualComment[]=[];
 for(let round=0;round<Math.max(0,...groups.map(g=>g.length));round++) for(const group of groups)if(group[round])out.push(group[round]);
 return out;
}
export const readingDuration=(text:string)=>Math.round(Math.max(10000,text.trim().split(/\s+/).length*500)/1000)*1000;
