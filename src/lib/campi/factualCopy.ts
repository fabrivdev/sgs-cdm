import type { PanoramaStory, StoryDatum, StoryTopicId } from './panoramaStoryTypes';
export const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const usd=new Intl.NumberFormat('es-PY',{maximumFractionDigits:0});
const fmt=new Intl.NumberFormat('es-PY',{maximumFractionDigits:2});
export const num=(n:number)=>fmt.format(n);
export const amount=(n:number,unit:StoryDatum['unit'])=>`${unit==='USD'?'$ ':unit==='PYG'?'₲ ':''}${unit==='USD'?usd.format(n):num(n)}${unit==='percent'?'%':unit==='days'?' días':''}`;
const grossIds=['ventas_evolucion','ventas_repuestos','ventas_servicios','ventas_maquinas'];
export const isSales=(id:StoryTopicId)=>grossIds.includes(id)||id==='ventas_facturacion';
export function salesCopy(id:StoryTopicId,metric:StoryDatum,period:'month'|'ytd'|'day'|'week',reference='el mismo tramo del año anterior'):string|null {
 if(!finite(metric.value))return null;
 const gross=grossIds.includes(id),kind=gross?'bruta':'neta',v=amount(metric.value,metric.unit),prev=metric.comparison?.value;
 if(!finite(prev))return period==='month'?gross?`La facturación bruta de este mes alcanza ${v}.`:`Este mes, la facturación neta suma ${v}.`:period==='ytd'?`La facturación ${kind} acumulada alcanza ${v}.`:null;
 const delta=metric.value-prev;if(delta===0||(metric.unit==='USD'&&Math.abs(delta)<.5))return null;
 const d=amount(Math.abs(delta),metric.unit),up=delta>0,tail=up?'más':'menos';
 if(period==='day')return gross?`La última jornada registró ${v} en facturación bruta, ${d} ${tail} que el mismo día de la semana anterior.`:up?`La última jornada cerró con ${v} en facturación neta, ${d} más que el mismo día de la semana anterior.`:`La facturación neta de la última jornada fue de ${v}, ${d} menos que el mismo día de la semana anterior.`;
 if(period==='week')return gross?up?`La semana cerró con ${v} en facturación bruta, ${d} más que la anterior.`:`La facturación bruta semanal alcanzó ${v}, ${d} menos que la semana anterior.`:up?`La facturación neta semanal alcanzó ${v}, superando en ${d} a la semana anterior.`:`La semana cerró con ${v} en facturación neta, ${d} menos que la anterior.`;
 if(period==='ytd')return up?`La facturación ${kind} acumulada alcanza ${v}, superando en ${d} al período comparable del año anterior.`:gross?`La facturación bruta acumulada suma ${v}, ${d} menos que en el período comparable del año anterior.`:`La facturación neta acumulada se sitúa en ${v}, ${d} menos que en el período comparable del año anterior.`;
 return gross?up?`Este mes, la facturación bruta alcanzó ${v}, ${d} más que en ${reference}.`:`La facturación bruta de este mes alcanza ${v}, ${d} menos que en ${reference}.`:up?`La facturación neta de este mes alcanza ${v}, con un crecimiento de ${d} respecto ${reference.startsWith('el ')?'al '+reference.slice(3):'a '+reference}.`:`La facturación neta alcanza ${v}, una caída de ${d} frente ${reference.startsWith('el ')?'al '+reference.slice(3):'a '+reference}.`;
}
function percentage(p:number){let text=num(p);for(let digits=3;p!==100&&p!==0&&['100','0'].includes(text)&&digits<=17;digits++)text=new Intl.NumberFormat('es-PY',{maximumFractionDigits:digits}).format(p);return text;}
const support=(s:PanoramaStory,label:string)=>s.supporting.find(x=>x.label===label)?.value;
const count=(n:unknown):n is number=>finite(n)&&Number.isInteger(n)&&n>=0;
function pair(s:PanoramaStory,a:string,b:string,integer=true){const n=support(s,a),d=support(s,b);return finite(n)&&finite(d)&&n>=0&&d>0&&(!integer||(count(n)&&count(d)&&n<=d))&&finite(s.primary?.value)&&Math.abs(n/d*100-s.primary.value)<.11?{n,d}:null;}
/** Only known zero denominators certify empty; a missing value or error never does. */
export function topicCopy(s:PanoramaStory):string|null {
 const p=s.primary?.value,ytd=s.periodMode==='ytd';
 let v=finite(p)?percentage(p):null;
 if(s.status==='error')return null;
 switch(s.id){
 case 'servicios_pendientes':{
  const n=s.supporting.find(x=>x.label.startsWith('OS cerradas en'))?.value;
  if(s.status==='empty')return n===0?'No se registran órdenes de servicio cerradas en el período seleccionado para calcular el tiempo de resolución.':null;
  if(!finite(p))return null;
  if(s.time?.closedMonth)return `Durante el mes pasado, la mediana de resolución de las OS cerradas fue de ${v} días.`;
  return ytd?`Desde julio de 2026, la mediana de resolución es de ${v} días${count(n)?`, considerando ${num(n)} órdenes de servicio cerradas`:''}.`:count(n)?`Las ${num(n)} órdenes de servicio cerradas este mes registran una mediana de resolución de ${v} días.`:`La mediana de resolución de las órdenes de servicio cerradas este mes es de ${v} días.`;
 }
 case 'servicios_os_facturadas':{
  if(s.status==='empty')return support(s,'OS cerradas')===0?'No se registran órdenes cerradas en el período seleccionado.':null;
  if(!finite(p))return null;const q=pair(s,'Facturadas a cliente','OS cerradas');
  if(q&&q.n!==q.d&&['100','0'].includes(v!))v=percentage(q.n/q.d*100);
  if(q?.n===0)return `Ninguna de las ${num(q.d)} órdenes cerradas del período registra facturación a clientes.`;
  if(q&&q.n===q.d)return `Las ${num(q.d)} órdenes de servicio cerradas del período registran facturación a clientes.`;
  return (ytd?`En el acumulado disponible, el ${v}% de las órdenes cerradas tuvo facturación a clientes`:`Este mes, el ${v}% de las órdenes de servicio cerradas registró facturación a clientes`)+(q?` (${num(q.n)} de ${num(q.d)}).`:'.');
 }
 case 'agenda_cumplimiento':{
  if(s.status==='empty')return support(s,'Evaluables')===0?'No hay compromisos evaluables en el período seleccionado.':null;
  if(!finite(p))return null;const q=pair(s,'Completadas','Evaluables');
  if(q&&q.n!==q.d&&['100','0'].includes(v!))v=percentage(q.n/q.d*100);
  if(q?.n===0)return `Ninguno de los ${num(q.d)} compromisos evaluables del período fue completado.`;
  if(q&&q.n===q.d)return `Se completaron los ${num(q.d)} compromisos evaluables del período, alcanzando un cumplimiento del 100%.`;
  return ytd?`En el acumulado disponible, la agenda registra un cumplimiento del ${v}%${q?` (${num(q.n)} de ${num(q.d)} compromisos evaluables)`:''}.`:`Este mes se completó el ${v}% de los compromisos evaluables de la agenda${q?` (${num(q.n)} de ${num(q.d)})`:''}.`;
 }
 case 'servicios_productividad':case 'servicios_eficiencia':{
  const efficiency=s.id==='servicios_eficiencia',q=pair(s,efficiency?'Horas facturadas':'Horas trabajadas',efficiency?'Horas trabajadas':'Horas disponibles',false);
  if(s.status==='empty')return support(s,efficiency?'Horas trabajadas':'Horas disponibles')===0&&(!efficiency||!s.details.length)?efficiency?'No hay horas trabajadas conciliadas suficientes para calcular la eficiencia del período.':'No hay capacidad disponible calculable para determinar la productividad del período.':null;
  if(!finite(p))return null;
  if(q&&q.n!==q.d&&['100','0'].includes(v!))v=percentage(q.n/q.d*100);
  if(q?.n===0)return efficiency?`Se registran ${num(q.d)} horas trabajadas conciliadas, sin horas facturadas contabilizadas en el período.`:`Se registran ${num(q.d)} horas de capacidad disponible, sin horas trabajadas contabilizadas en el período.`;
  const head=efficiency?ytd?`En el acumulado disponible, la eficiencia del taller se sitúa en ${v}%`:`La eficiencia del taller alcanza el ${v}% este mes`:ytd?`En el acumulado disponible, la productividad técnica se sitúa en ${v}%`:`La productividad técnica de este mes alcanza el ${v}%`;
  return head+(q?efficiency?`, con ${num(q.n)} horas facturadas sobre ${num(q.d)} trabajadas conciliadas.`:`, con ${num(q.n)} horas trabajadas sobre ${num(q.d)} disponibles.`:'.');
 }
 case 'clientes_retencion':case 'clientes_cobertura_posventa':{
  const coverage=s.id==='clientes_cobertura_posventa',q=pair(s,coverage?'Con compra':'Retenidos',coverage?'Propietarios':'Cohorte base');
  if(s.status==='empty')return support(s,coverage?'Propietarios':'Cohorte base')===0?coverage?'No hay propietarios del parque disponibles para calcular la cobertura de posventa.':'No hay una cohorte de clientes válida para calcular la retención.':null;
  if(!finite(p))return null;
  if(!q)return coverage?`La cobertura de posventa alcanza el ${v}%.`:`La retención de clientes alcanza el ${v}%.`;
  if(q.n!==q.d&&['100','0'].includes(v!))v=percentage(q.n/q.d*100);
  if(coverage&&s.coverageBasis==='attention'){
   const action=s.coverageSelection?.length===1?s.coverageSelection[0]==='repuestos.ventas'?'registraron compras de repuestos':'recibieron atención de servicio':'recibieron atención de servicio o compraron repuestos';
   if(q.n===0)return `Ninguno de los ${num(q.d)} propietarios del parque registra cobertura en el período analizado.`;
   if(q.n===q.d)return `Todos los ${num(q.d)} propietarios del parque ${action} durante el período analizado.`;
   return `La cobertura de posventa alcanza el ${v}%: ${num(q.n)} de los ${num(q.d)} propietarios del parque ${action}.`;
  }
  if(q.n===0)return coverage?`Ninguno de los ${num(q.d)} propietarios del parque registró compras de ${s.coverageSelection?.length===1?s.coverageSelection[0]==='repuestos.ventas'?'repuestos':'servicios':'repuestos o servicios'} durante el período analizado.`:`Ninguno de los ${num(q.d)} clientes considerados registró una nueva compra en la ventana de recompra.`;
  if(q.n===q.d)return coverage?`Todos los ${num(q.d)} propietarios del parque registraron compras de ${s.coverageSelection?.length===1?s.coverageSelection[0]==='repuestos.ventas'?'repuestos':'servicios':'posventa'} durante el período analizado.`:`Los ${num(q.d)} clientes considerados para el análisis volvieron a comprar, alcanzando una retención del 100%.`;
  return coverage?`La cobertura de posventa alcanza el ${v}%: ${num(q.n)} de los ${num(q.d)} propietarios del parque registraron compras de ${s.coverageSelection?.length===1?s.coverageSelection[0]==='repuestos.ventas'?'repuestos':'servicios':'repuestos o servicios'}.`:`De los ${num(q.d)} clientes considerados para el análisis, ${num(q.n)} volvieron a comprar, alcanzando una retención del ${v}%.`;
 }
 case 'maquinas_pedidos':{
  if(!count(p))return null;if(p===0)return 'Actualmente no se registran pedidos pendientes de máquinas.';
  const n=support(s,'Pedidos con stock completo'),rows=s.chart?.rows,full=rows?.find(x=>x.label==='Cobertura completa')?.value;
  const complete=rows?.length===4&&new Set(rows.map(x=>x.label)).size===4&&rows.find(x=>x.label==='No clasificables')?.value===0&&rows.every(x=>count(x.value))&&rows.reduce((a,x)=>a+x.value!,0)===p&&count(n)&&n===full&&n<=p;
  if(!complete)return `Hay ${num(p)} pedidos de máquinas pendientes.`;
  if(n===0)return `Actualmente hay ${num(p)} pedidos pendientes, pero ninguno tiene stock vinculado para todas sus unidades.`;
  if(n===p)return `Los ${num(p)} pedidos pendientes de máquinas cuentan con stock vinculado para todas sus unidades.`;
  return `Hay ${num(p)} pedidos de máquinas pendientes, de los cuales ${num(n)} cuentan con stock vinculado para todas sus unidades.`;
 }
 case 'repuestos_stock':case 'repuestos_alertas':{
  if(!finite(p)||p<0)return null;const alert=s.id==='repuestos_alertas',n=support(s,alert?'Códigos expuestos':'Códigos en gris y rojo');
  if(n===0&&p===0)return alert?'Actualmente no se identifican repuestos próximos a pasar a gris o rojo durante los siguientes 30 días, según los criterios vigentes.':'Actualmente no se registra stock de repuestos clasificado en gris o rojo.';
  if(s.status==='empty')return null;
  return alert?`En los próximos 30 días, ${count(n)?`${num(n)} códigos por un valor de `:''}${amount(p,s.primary!.unit)} podrían pasar a gris o rojo si no cambian las fechas ni los criterios de clasificación.`:`El stock antiguo de repuestos alcanza ${amount(p,s.primary!.unit)}${count(n)?`, distribuido entre ${num(n)} códigos clasificados en gris y rojo`:''}.`;
 }
 default:return null;
 }
}
