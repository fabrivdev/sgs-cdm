import { NEW_SYSTEM_START } from '@/lib/imports/cutoff';
import type { PanoramaStory, StoryPeriod } from './panoramaStoryTypes';
import { validDay, formatRange } from './panoramaDates';
import { closureCohort, closureDuration, resolutionDistribution, type ClosureRow } from './seriesData';

export function resolutionWindow(asOf: string, period: StoryPeriod) {
 if (!validDay(asOf)) throw new Error('Fecha de análisis inválida.');
 return { from: period === 'ytd' ? NEW_SYSTEM_START : [asOf.slice(0,7)+'-01',NEW_SYSTEM_START].sort().at(-1)!, to: asOf };
}
/** All rows must come from loadClosures: verified pagination, not monthly medians. */
export function resolutionWindowStory(rows: readonly ClosureRow[], asOf: string, period: StoryPeriod): PanoramaStory {
 const window=resolutionWindow(asOf,period);
 const ids=rows.map(row=>row.os_numero.trim().toUpperCase());
 if(ids.some(id=>!id)||new Set(ids).size!==ids.length)throw new Error('Identidades de OS duplicadas o vacías.');
 const cohort=closureCohort(rows,window.from,window.to);
 const durations=cohort.map(closureDuration);
 if(durations.some(value=>value===null))throw new Error('Hay OS cerradas sin duración válida en el período.');
 const sorted=(durations as number[]).sort((a,b)=>a-b),n=sorted.length;
 const median=n?(sorted[Math.floor((n-1)/2)]+sorted[Math.floor(n/2)])/2:null;
 const route=`/servicios/ordenes?desde=${window.from}&hasta=${window.to}&estado=cerrada&cohorte=resolution`;
 const label=period==='ytd'?'Desde julio de 2026 hasta hoy':'Este mes hasta hoy';
 return {id:'servicios_pendientes',title:'Resolución de OS',question:'¿Cuánto tardaron las OS cerradas del período?',
  periodMode:period,periodOptions:['month','ytd'],visitKey:`servicios_pendientes:rango-v2:${period}:${asOf}`,
  status:n?'ready':'empty',primary:{label:'Mediana de resolución',value:median,unit:'days'},
  supporting:[{label:'OS cerradas en el período',value:n,unit:'count'}],
  message:n?`${label}, ${n} OS tienen fechas válidas de apertura y cierre.`:'No hay OS cerradas con fecha de cierre en este período.',
  scope:'OS cerradas por fecha de cierre; apertura anterior al rango incluida',sections:['servicios.ordenes'],
  cutoff:null,time:{window},periodLabel:formatRange(window),navigationPeriod:window,
  chart:null,closureDistribution:resolutionDistribution(rows,window.from,window.to)??undefined,
  breakdown:[{label:'OS cerradas en el período',value:n,unit:'count',route}],route,
  details:['Mediana de las duraciones individuales: fecha de cierre menos fecha de apertura; no promedio de medianas mensuales.',
   'La lectura paginada verifica el universo visible por permisos. El corte de consulta no acredita actualización ni integridad histórica del origen.',
   'No se compara un mes parcial con un mes completo. Las OS sin fecha de cierre no pueden atribuirse a este rango.'],
  source:'ordenes_servicio_importadas: cierres paginados por rango'};
}
