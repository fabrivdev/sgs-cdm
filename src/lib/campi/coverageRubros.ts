import { projectCoverage } from '../parqueCoverage';
import type { SectionKey } from '@/lib/permissions';
import type { PanoramaStory, SeriesPoint, StoryPeriod } from './panoramaStoryTypes';
import { formatMonth, monthWindows } from './panoramaDates';

export type CoverageRubros = { owners: string[]; rows: {from:string;to:string;parts:string[];services:string[]}[] };
const list=(value:unknown):string[]=>{
 if(!Array.isArray(value)||value.some(id=>typeof id!=='string'||!id)||new Set(value).size!==value.length)throw new Error('Identidades incompletas o duplicadas');
 return value;
};
const same=(a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every(id=>b.includes(id));
/** Optional capability: all windows must conserve the existing owner cohort and purchase rule. */
export function parseCoverageRubros(raw:unknown,asOf:string,mode:StoryPeriod,expected:{owners:string[];buyers:string[];series:SeriesPoint[]}):CoverageRubros|null {
 try {
  if(!raw||typeof raw!=='object')return null;
  const p=raw as {version:number;cohort:string;as_of:string;mode:string;owners:unknown;rows:{from:string;to:string;nets:unknown;source_mismatches:number;union_conflicts:number}[]};
  const owners=list(p.owners),windows=monthWindows(asOf,mode==='ytd'?Number(asOf.slice(5,7)):6);
  if(p.version!==1||p.cohort!=='current_park'||p.as_of!==asOf||p.mode!==mode||!same(owners,list(expected.owners))||!Array.isArray(p.rows)||p.rows.length!==windows.length||expected.series.length!==windows.length)return null;
  const rows:CoverageRubros['rows']=[];
  for(let i=0;i<windows.length;i++){
   const row=p.rows[i],window=windows[i],from=mode==='ytd'?window.from.slice(0,4)+'-01-01':window.from,old=expected.series[i];
   if(!row||row.from!==from||row.to!==window.to||row.source_mismatches!==0||row.union_conflicts!==0||!Array.isArray(row.nets)||row.nets.length!==owners.length)return null;
   const parts:string[]=[],services:string[]=[],canonical:string[]=[],seen=new Set<string>();
   for(const net of row.nets){
    if(!Array.isArray(net)||net.length!==4)return null;
    const [id,part,service,total]=net;
    if(typeof id!=='string'||!owners.includes(id)||seen.has(id)||[part,service,total].some(n=>typeof n!=='number'||!Number.isFinite(n))||Math.abs(part+service-total)>1e-8)return null;
    seen.add(id);if(part>0)parts.push(id);if(service>0)services.push(id);if(total>0)canonical.push(id);
   }
   const union=[...new Set([...parts,...services])];
   if(!same(union,canonical)||old.from!==from||old.to!==row.to||!old.complete||old.cutoff!==asOf||old.denominator!==owners.length||old.numerator!==canonical.length)return null;
   if(i===windows.length-1&&!same(canonical,list(expected.buyers)))return null;
   rows.push({from,to:row.to,parts,services});
  }
  return {owners,rows};
 }catch{return null;}
}

export function scopedCoverageStory(story:PanoramaStory,selection:readonly SectionKey[]):PanoramaStory {
 if(story.id!=='clientes_cobertura_posventa'||!story.coverageRubros||!story.primary||!story.sections.includes('parque.maquinas'))return story;
 const selected=new Set(selection.filter(s=>s==='repuestos.ventas'||s==='servicios.ventas'));
 if(!selected.size)return story;
 const data=story.coverageRubros,denominator=data.owners.length;
 const series=data.rows.map(row=>{
  const projection=projectCoverage({...row,owners:data.owners,complete:true},[...(selected.has('repuestos.ventas')?['parts' as const]:[]),...(selected.has('servicios.ventas')?['services' as const]:[])]);
  const ids=projection?.ids??[];
  return {from:row.from,to:row.to,value:denominator?ids.length/denominator*100:null,numerator:ids.length,denominator,ids,cutoff:story.cutoff!,complete:true};
 });
 const current=series.at(-1)!;
 return {...story,coverageSelection:[...selected],primary:{...story.primary,value:current.value},
  supporting:story.supporting.map(row=>row.label==='Con compra'?{...row,value:current.numerator}:row),
  cohort:{numerator:current.ids,denominator:data.owners},series,
  chart:{kind:'trend',unit:'percent',title:story.chart?.title??'Cobertura del parque actual',rows:series.map(row=>({label:formatMonth(row.to.slice(0,7)+'-01'),value:row.value}))},
 };
}
