import { loadUnifiedCoverage, unifiedCoverageWindow } from '../unifiedCoverage';
import { projectCoverage } from '../parqueCoverage';
import { formatMonth, monthWindows } from './panoramaDates';
import type { PanoramaStory, StoryPeriod } from './panoramaStoryTypes';
export async function loadUnifiedCoverageStory(base:PanoramaStory,asOf:string,period:StoryPeriod):Promise<PanoramaStory> {
 const windows=monthWindows(asOf,period==='ytd'?Number(asOf.slice(5,7)):6).map(w=>({...w,from:period==='ytd'?asOf.slice(0,4)+'-01-01':w.from}));
 const data=await loadUnifiedCoverage(windows[0].from,asOf);
 const rows=windows.map(w=>unifiedCoverageWindow(data,w.from,w.to));
 const series=rows.map(w=>{const p=projectCoverage(w,[]);if(!p)throw new Error('Hay atenciones sin fecha o identidad verificable.');return {...p,value:p.percent,ids:p.ids,cutoff:asOf,complete:true};});
 const current=series.at(-1)!;
 return {...base,status:current.denominator?'ready':'empty',coverageBasis:'attention',
  primary:{label:'Cobertura posventa',value:current.value,unit:'percent'},supporting:[{label:'Con compra',value:current.numerator,unit:'count'},{label:'Propietarios',value:current.denominator,unit:'count'}],
  cohort:{numerator:current.ids,denominator:data.owners},series,
  coverageRubros:{owners:data.owners,rows:rows.map(r=>({from:r.from,to:r.to,parts:r.parts,services:r.services}))},
  chart:{kind:'trend',title:'Cobertura de posventa del parque principal',unit:'percent',rows:series.map(r=>({label:formatMonth(r.to.slice(0,7)+'-01'),value:r.value}))},
  source:'parque_cobertura_unificada_v1',message:`${current.numerator} de ${current.denominator} propietarios recibieron atención o compraron repuestos.`,
  details:['Parque principal actual, sin plataformas ni cabezales. Una identidad por propietario.','OS cerradas: cierre como referencia; apertura histórica sólo si falta cierre. OS abiertas: jornada completada fechada.','Repuestos: neto positivo del propietario en el período, conservando NC y sustitución legacy/TOTVS.'],
 };
}
