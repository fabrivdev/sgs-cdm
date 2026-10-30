/** Additional categories never replace the canonical parts/service/machine sources. */
export const SUPPLEMENTAL_RPC='campi_facturacion_adicional_v1';
export const supplementalLabels={otros:'Otros reconocidos',sin_clasificar:'Sin clasificar',revision:'Revisión'} as const;
export type SupplementalId=keyof typeof supplementalLabels;
type Totals={ventas:number;notas_credito:number;facturado:number;lineas:number};
export type SupplementalReport={resumen:Totals;periodos:Array<Totals&{periodo:string}>};
const obj=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Contrato adicional inválido');return v as Record<string,unknown>;};
const num=(v:unknown)=>{if(typeof v!=='number'||!Number.isFinite(v))throw Error('Importe adicional desconocido');return v;};
const count=(v:unknown)=>{const n=num(v);if(!Number.isSafeInteger(n)||n<0)throw Error('Conteo adicional inválido');return n;};
const near=(a:number,b:number)=>Math.abs(a-b)<=.02;
function totals(v:unknown):Totals{const x=obj(v),r={ventas:num(x.ventas),notas_credito:num(x.notas_credito),facturado:num(x.facturado),lineas:count(x.lineas)};if(r.ventas<0||r.notas_credito>0||!near(r.ventas+r.notas_credito,r.facturado))throw Error('Componentes adicionales no concilian');return r;}
export function parseSupplemental(value:unknown,from:string,to:string):Record<SupplementalId,SupplementalReport>{
 const data=obj(value),c=obj(data.controls);
 if(data.version!==1||data.desde!==from||data.hasta!==to||data.coverage!=='observed-canonical'||!Array.isArray(data.categories)||data.categories.length!==3)throw Error('Cobertura adicional no acreditada');
 if(count(c.filas)!==count(c.identidades)||count(c.invalidas)!==0||count(c.signos_invalidos)!==0)throw Error('Identidad o signos adicionales ambiguos');
 const expected:string[]=[];for(let y=+from.slice(0,4),m=+from.slice(5,7);`${y}-${String(m).padStart(2,'0')}-01`<=to;){expected.push(`${y}-${String(m).padStart(2,'0')}-01`);if(++m===13){m=1;y++;}}
 const result={} as Record<SupplementalId,SupplementalReport>;
 for(const raw of data.categories){const x=obj(raw),id=x.id as SupplementalId;if(!(id in supplementalLabels)||result[id]||!Array.isArray(x.periodos))throw Error('Categorías adicionales incompletas');
  const resumen=totals(x.resumen),seen=new Set<string>();const periodos=x.periodos.map(raw=>{const p=obj(raw),periodo=String(p.periodo);if(!expected.includes(periodo)||seen.has(periodo))throw Error('Período adicional duplicado o fuera de rango');seen.add(periodo);return {...totals(p),periodo};});
  if(seen.size!==expected.length)throw Error('Faltan meses adicionales');
  for(const field of ['ventas','notas_credito','facturado','lineas'] as const)if(!near(periodos.reduce((s,p)=>s+p[field],0),resumen[field]))throw Error('Meses adicionales no conservan el total');
  result[id]={resumen,periodos};
 }
 if(Object.values(result).reduce((s,r)=>s+r.resumen.lineas,0)!==c.filas||!near(Object.values(result).reduce((s,r)=>s+r.resumen.facturado,0),num(c.neto)))throw Error('Categorías adicionales no conservan el universo');
 return result;
}

export function combinedSupplemental(value:unknown,from:string,to:string):SupplementalReport{
 const reports=Object.values(parseSupplemental(value,from,to));
 const sum=(rows:Totals[]):Totals=>rows.reduce((a,b)=>({ventas:a.ventas+b.ventas,notas_credito:a.notas_credito+b.notas_credito,facturado:a.facturado+b.facturado,lineas:a.lineas+b.lineas}),{ventas:0,notas_credito:0,facturado:0,lineas:0});
 return {resumen:sum(reports.map(r=>r.resumen)),periodos:reports[0].periodos.map(p=>({...sum(reports.map(r=>r.periodos.find(row=>row.periodo===p.periodo)!)),periodo:p.periodo}))};
}
