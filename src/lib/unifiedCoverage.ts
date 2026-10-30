import { supabase } from '@/integrations/supabase/client';
import { projectCoverage, type CoverageRubric, type CoverageWindow } from './parqueCoverage';
export const unifiedCoverageEnabled = () => import.meta.env.VITE_UNIFIED_PARK_COVERAGE_ENABLED === 'true';
export type UnifiedCoverage = { version: 1; policy: 'principal_closed_or_completed_v1'; from: string; to: string; owners: string[]; parts: [string,string,number][]; services: [string,string,string,string][]; uncertainOwners: string[] };
const validDay=(v:unknown):v is string=>typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v;
export function parseUnifiedCoverage(raw: unknown, from: string, to: string): UnifiedCoverage {
 const fail=()=>{throw new Error('La cobertura compartida no está completa.');};
 if(!raw||typeof raw!=='object')return fail();
 const p=raw as UnifiedCoverage;
 if(p.version!==1||p.policy!=='principal_closed_or_completed_v1'||p.from!==from||p.to!==to||!validDay(from)||!validDay(to)||from>to)return fail();
 if(!Array.isArray(p.owners)||p.owners.some(x=>typeof x!=='string'||!x)||new Set(p.owners).size!==p.owners.length)return fail();
 if(!Array.isArray(p.uncertainOwners)||p.uncertainOwners.some(x=>!p.owners.includes(x)))return fail();
 const seenParts=new Set<string>(),seenServices=new Set<string>();
 if(!Array.isArray(p.parts)||!Array.isArray(p.services))return fail();
 for(const r of p.parts){if(!Array.isArray(r)||r.length!==3||!p.owners.includes(r[0])||!validDay(r[1])||r[1]<from||r[1]>to||typeof r[2]!=='number'||!Number.isFinite(r[2])||seenParts.has(r[0]+'|'+r[1]))return fail();seenParts.add(r[0]+'|'+r[1]);}
 for(const r of p.services){if(!Array.isArray(r)||r.length!==4||!p.owners.includes(r[0])||!validDay(r[1])||r[1]<from||r[1]>to||typeof r[2]!=='string'||!r[2]||!['cierre','apertura_historica','jornada'].includes(r[3])||seenServices.has(r[2]))return fail();seenServices.add(r[2]);}
 return p;
}
export async function loadUnifiedCoverage(from:string,to:string,signal?:AbortSignal) {
 const request=supabase.rpc('parque_cobertura_unificada_v1' as never,{p_desde:from,p_hasta:to} as never);
 const {data,error}=await (signal?request.abortSignal(signal):request);
 if(error)throw error;
 return parseUnifiedCoverage(data,from,to);
}
/** Parts retain signed net within the requested window; service never uses billing as execution. */
export function unifiedCoverageWindow(source:UnifiedCoverage,from:string,to:string,scope:readonly string[]=source.owners):CoverageWindow {
 if(!validDay(from)||!validDay(to)||from<source.from||to>source.to||from>to)throw new Error('Ventana fuera de la fuente');
 const owners=source.owners.filter(id=>scope.includes(id));
 const totals=new Map<string,number>();
 for(const [id,date,value] of source.parts)if(owners.includes(id)&&date>=from&&date<=to)totals.set(id,(totals.get(id)??0)+value);
 return {from,to,owners,parts:[...totals].filter(([,net])=>net>0).map(([id])=>id),services:[...new Set(source.services.filter(([id,date])=>owners.includes(id)&&date>=from&&date<=to).map(([id])=>id))],complete:!source.uncertainOwners.some(id=>owners.includes(id))};
}
export function unifiedCoverageProjection(source:UnifiedCoverage,from:string,to:string,selection:readonly CoverageRubric[],scope?:readonly string[]) {
 return projectCoverage(unifiedCoverageWindow(source,from,to,scope),selection);
}
