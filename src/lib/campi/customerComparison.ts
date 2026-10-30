import type { SectionKey } from '@/lib/permissions';
import { validDay } from './panoramaDates';

export const CUSTOMER_COMPARISON_PERMISSIONS: SectionKey[] = ['parque.clientes','repuestos.ventas','servicios.ordenes','servicios.ventas'];
type RecordValue = Record<string, unknown>;
const object = (x: unknown): RecordValue => { if(!x || typeof x!=='object' || Array.isArray(x)) throw new Error('Contrato de clientes inválido.'); return x as RecordValue; };
const array = (x: unknown): unknown[] => { if(!Array.isArray(x)) throw new Error('Conjunto incompleto.'); return x; };
const number = (x: unknown, integer=false): number => { if(typeof x!=='number' || !Number.isFinite(x) || x<0 || (integer && !Number.isSafeInteger(x))) throw new Error('Medida inválida.'); return x; };
const text = (x: unknown): string => { if(typeof x!=='string' || !x) throw new Error('Identidad ausente.'); return x; };
const dayBefore=(iso:string)=>new Date(Date.parse(iso)-86400000).toISOString().slice(0,10);
const previousYear=(day:string)=>{const [y,m,d]=day.split('-').map(Number);return new Date(Date.UTC(y-1,m-1,Math.min(d,new Date(Date.UTC(y-1,m,0)).getUTCDate()))).toISOString().slice(0,10);};
export type ComparisonWindow={from:string;to:string};
const validateWindow=(window:ComparisonWindow)=>{if(!validDay(window.from)||!validDay(window.to)||window.from>window.to||window.from.slice(0,4)!==window.to.slice(0,4))throw new Error('Ventana inválida.');};
export type CustomerObservation={id:string;machines:number;previous:{sales:number;gross:number;credits:number};current:{sales:number;gross:number;credits:number};ambiguousPrevious:number;ambiguousCurrent:number;otherCurrency:number;state:string};
export type CustomerComparison={
 window:ComparisonWindow;previousWindow:ComparisonWindow;population:number;machines:number;
 coverage:RecordValue;conservation:RecordValue;uncertainties:unknown[];unboundedDetails:unknown[];
 customers:CustomerObservation[];absenceEligible:false;
 groups:{direction:'reduction'|'growth';ids:string[];previousGross:number;currentGross:number;previousCredits:number;currentCredits:number;previousNet:number;currentNet:number;netExact:false}[];
 excluded:number;
};

/** Consumes only the versioned SELECT derived from V3. Never reattributes invoice
 * recipients, merges UUIDs, or deduplicates already aggregated money in the browser. */
export function parseCustomerComparison(input:unknown,window:ComparisonWindow):CustomerComparison {
 validateWindow(window);
 const raw=object(input);
 if(raw.contract_version!==1 || raw.attribution_rule!=='OS_CUSTOMER_V3' || raw.deduplication_rule!=='DOCUMENT_LINE_V3'
   || raw.alcance!=='DATOS_CARGADOS_NO_CERTIFICA_AUSENCIA_EN_ORIGEN') throw new Error('Versión o semántica no acreditada.');
 const windows=array(raw.ventanas).map(x=>{const p=object(x);const from=new Date(text(p.desde)).toISOString();const until=new Date(text(p.hasta)).toISOString();
   if(!from.endsWith('T00:00:00.000Z')||!until.endsWith('T00:00:00.000Z'))throw new Error('Corte no UTC.');
   return {year:number(p.anio,true),from:from.slice(0,10),to:dayBefore(until)};});
 const prior={from:previousYear(window.from),to:previousYear(window.to)};
 if(windows.length!==2 || ![window,prior].every(w=>windows.some(p=>p.from===w.from&&p.to===w.to&&p.year===Number(w.from.slice(0,4))))) throw new Error('Ventanas no equivalentes.');
 const rows=array(raw.detalle_clientes).map(x=>{const r=object(x);const period=(side:string)=>({sales:number(r[`ventas_${side}`],true),gross:number(r[`usd_ventas_${side}`]),credits:number(r[`usd_nc_${side}`])});
   const row={id:text(r.cliente_id),machines:number(r.maquinas,true),previous:period('previous'),current:period('current'),ambiguousPrevious:number(r.ambiguos_previous,true),ambiguousCurrent:number(r.ambiguos_current,true),otherCurrency:number(r.grupos_no_usd,true),state:text(r.estado)};
   if(!row.machines || (!row.previous.sales && row.previous.gross>0) || (!row.current.sales && row.current.gross>0))throw new Error('Cliente o ventas no concilian.');
   return row;
 });
 const population=number(raw.clientes_parque,true);
 if(rows.length!==population||new Set(rows.map(r=>r.id)).size!==population)throw new Error('Población incompleta o duplicada.');
 const states=array(raw.estados).map(x=>object(x));
 if(new Set(states.map(s=>text(s.estado))).size!==states.length || states.reduce((s,r)=>s+number(r.clientes,true),0)!==population
   || states.some(s=>rows.filter(r=>r.state===s.estado).length!==s.clientes))throw new Error('Estados no concilian.');
 const c=object(raw.conservacion),u=array(raw.detalle_no_acotados), uncertainties=array(raw.no_determinados);
 const count=(k:string)=>number(c[k],true);
 if(u.length!==count('filas_detalle_no_acotados')||new Set(u.map(x=>text(object(x).id_linea))).size!==u.length)throw new Error('Detalle de incertidumbre truncado o duplicado.');
 const unbounded=new Set(u.map(x=>text(object(x).clave_grupo))).size;
 if(count('filas_seleccionadas')-count('descartes_auditados_con_contraparte')!==count('filas_restantes')
   ||count('filas_restantes')!==count('copias_reconciliadas')||count('grupos_documentales')>count('filas_restantes')
   ||count('grupos_con_impacto_parque')+count('grupos_fuera_parque_con_identidad_acotada')+count('grupos_no_acotados_sin_impacto_parque')!==count('grupos_documentales')
   ||count('grupos_no_acotados_sin_impacto_parque')>unbounded)throw new Error('Conservación no acreditada.');
 if(uncertainties.length!==2 || new Set(uncertainties.map(x=>number(object(x).anio,true))).size!==2)throw new Error('Incertidumbre incompleta.');
 uncertainties.forEach(x=>{
   const r=object(x);['grupos','identidad_no_acotada','identidad_no_acotada_posible_venta','identidad_no_acotada_solo_nc'].forEach(k=>number(r[k],true));
   if(!windows.some(w=>w.year===r.anio))throw new Error('Año de incertidumbre ajeno a la ventana.');
   const groups=new Map<string,boolean>();
   u.forEach(value=>{const d=object(value);if(!windows.some(w=>w.year===d.anio)||typeof d.grupo_puede_ser_venta!=='boolean')throw new Error('Detalle de incertidumbre inválido.');
     if(d.anio===r.anio){const key=text(d.clave_grupo);if(groups.has(key)&&groups.get(key)!==d.grupo_puede_ser_venta)throw new Error('Grupo contradictorio.');groups.set(key,d.grupo_puede_ser_venta);}
   });
   const possible=[...groups.values()].filter(Boolean).length;
   if(groups.size!==r.identidad_no_acotada||possible!==r.identidad_no_acotada_posible_venta||groups.size-possible!==r.identidad_no_acotada_solo_nc||number(r.grupos,true)<groups.size)throw new Error('Respaldo de incertidumbre incompleto.');
 });
 const eligible=rows.filter(r=>r.previous.sales>0&&r.current.sales>0&&!r.ambiguousPrevious&&!r.ambiguousCurrent&&!r.otherCurrency);
 const groups=(['reduction','growth'] as const).flatMap(direction=>{
   const subset=eligible.filter(r=>direction==='reduction'?r.current.gross<r.previous.gross:r.current.gross>r.previous.gross);
   if(!subset.length)return [];
   const sum=(side:'previous'|'current',key:'gross'|'credits')=>subset.reduce((s,r)=>s+r[side][key],0);
   const previousGross=sum('previous','gross'),currentGross=sum('current','gross'),previousCredits=sum('previous','credits'),currentCredits=sum('current','credits');
   return [{direction,ids:subset.map(r=>r.id).sort(),previousGross,currentGross,previousCredits,currentCredits,previousNet:previousGross-previousCredits,currentNet:currentGross-currentCredits,netExact:false as const}];
 });
 return {window,previousWindow:prior,population,machines:rows.reduce((s,r)=>s+r.machines,0),coverage:object(raw.cobertura_historica),conservation:c,uncertainties,unboundedDetails:u,customers:rows,absenceEligible:false,groups,excluded:population-eligible.length};
}

/** Validated boundary shared by the installed invoker RPC and local tests.
 * Permissions are checked here before transport and again by the function. */
export async function loadCustomerComparison(read:(window:ComparisonWindow)=>Promise<unknown>,allowed:(section:SectionKey)=>boolean,window:ComparisonWindow) {
 if(!CUSTOMER_COMPARISON_PERMISSIONS.every(allowed)) return null;
 validateWindow(window);
 return parseCustomerComparison(await read(window),window);
}
