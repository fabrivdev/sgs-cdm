import type { SectionKey } from '@/lib/permissions';
import type { PanoramaStory, StoryTopicId } from './panoramaStoryTypes';
import { formatRange, validDay } from './panoramaDates';
import { CUSTOMER_COMPARISON_PERMISSIONS } from './customerComparison';

/** Detector availability is evidence-driven, never inferred from a configured topic. */
export const BUSINESS_DETECTORS = [
  ['assigned-orders', 'Pedidos con stock asignado', null],
  ['customers-absent', 'Clientes con parque sin compra', 'Falta cobertura histórica acreditada y atribución OS completa.'],
  ['customers-reduced', 'Variación confirmada de compras con parque', null],
  ['customers-recovered', 'Clientes recuperados', 'Falta historial completo para acreditar inactividad y recuperación.'],
  ['sales-contribution', 'Aporte a variación de ventas', null],
  ['credit-impact', 'Efecto de notas de crédito', 'Faltan motivos y grupos documentales que permitan decidir una acción; la variación de NC sola no acredita un problema comercial.'],
  ['sales-concentration', 'Concentración de ventas', 'Falta distribución completa por cliente y base comparable; áreas no equivalen a clientes.'],
  ['service-resolution', 'Cierres de OS y tiempos', 'Cierres y mediana permanecen en la tarjeta: falta mezcla de trabajos o conservación del pendiente para sostener una decisión de capacidad.'],
  ['service-flow', 'Entradas, salidas y pendiente de OS', 'Falta conservación del pendiente entre dos cortes; cierres no prueban reducción del backlog.'],
  ['finished-unbilled', 'Trabajos terminados facturables', 'Falta vínculo completo trabajo-factura y condición facturable; OS abierta no prueba ingreso bloqueado.'],
  ['old-stock', 'Inventario antiguo', 'Falta acreditar saldo disponible actual por código.'],
  ['uncovered-demand', 'Demanda confirmada sin cobertura', 'Falta demanda pendiente vigente con disponibilidad exacta por código y fecha.'],
  ['excess-purchases', 'Compras que agravan exceso', 'Falta conciliación de compras pendientes, demanda y saldo actual por código.'],
] as const;
export type DetectorId = typeof BUSINESS_DETECTORS[number][0];
export type Finding = {
  id: string; detector: DetectorId; problem: string; topic: StoryTopicId;
  text: string; action: string; period: string; sections: SectionKey[];
  facts: Record<string, number>; decision: string; impact: number; positive: boolean; observation: string;
  focus?: string; evidence?: string[]; targets?: { label: string; route: string }[];
};
const n = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const fmt = (v: number) => new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1 }).format(v);
const money = (v: number) => `USD ${fmt(v)}`;
const close = (a: number, b: number) => Math.abs(a - b) <= 0.02;
export const businessProblem = (detector: DetectorId, scope: string, period: string) =>
  `${detector==='sales-contribution'||detector==='sales-concentration'?'sales-composition':detector}|${scope}|${period}`;
const priorYear = (day: string) => {
  const [y,m,d] = day.split('-').map(Number);
  return `${y-1}-${String(m).padStart(2,'0')}-${String(Math.min(d,new Date(Date.UTC(y-1,m,0)).getUTCDate())).padStart(2,'0')}`;
};
function comparable(s: PanoramaStory) {
  const w=s.businessWindow!;
  if (s.id !== 'servicios_pendientes') return w.previous.from===priorYear(w.current.from) && w.previous.to===priorYear(w.current.to);
  const start=new Date(`${w.current.from}T00:00:00Z`);
  const prior=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()-1,1)).toISOString().slice(0,10);
  const end=(from:string)=>{const [y,m]=from.split('-').map(Number);return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);};
  return w.current.from.endsWith('-01') && w.current.to===end(w.current.from) && w.previous.from===prior && w.previous.to===end(prior);
}

export function detectBusinessFindings(stories: readonly PanoramaStory[], allowed: (s: SectionKey) => boolean) {
  const findings: Finding[] = [];
  const blocked = new Map<DetectorId, string>(BUSINESS_DETECTORS.filter(d => d[2]).map(d => [d[0], d[2]! ]));
  for (const detector of BUSINESS_DETECTORS.filter(d => !d[2])) blocked.set(detector[0], 'Sin evidencia comparable autorizada.');
  for (const s of stories) {
    if (s.id === 'clientes_cobertura_posventa') {
      const c=s.customerComparison;
      if(s.status!=='ready' || !c || !CUSTOMER_COMPARISON_PERMISSIONS.every(p=>s.sections.includes(p)&&allowed(p))) continue;
      blocked.delete('customers-reduced');
      for(const g of c.groups) {
        if(!g.ids.length || g.previousGross<=0 || g.currentGross<=0 || g.ids.some(id=>!s.customerComparisonNames?.[id])) continue;
        const down=g.direction==='reduction';
        const scope=[...s.sections].sort().join(',');
        const identity=`customers-reduced|${scope}|${c.window.from}:${c.previousWindow.from}|${g.direction}`;
        findings.push({id:identity,detector:'customers-reduced',problem:`park-purchases|${scope}|${c.window.from}:${c.previousWindow.from}`,topic:s.id,
          text:`${g.ids.length} clientes con máquinas tienen compras de repuestos confirmadas ${down?'menores':'mayores'}: ${money(g.currentGross)} frente a ${money(g.previousGross)} en el mismo tramo del año anterior. ${down?'Priorizá el contacto con esta cartera para entender la reducción registrada.':'Revisá esta cartera para sostener la relación comercial.'}`,
          action:'La comparación incluye compras directas y repuestos atribuidos al cliente de la OS aunque se facturen a otro. Es una prioridad de revisión, no prueba de pérdida, recuperación ni de su causa.',
          period:`${formatRange(c.window)} frente a ${formatRange(c.previousWindow)}`,sections:[...s.sections],
          facts:{current:g.currentGross,previous:g.previousGross,currentCredits:g.currentCredits,previousCredits:g.previousCredits},decision:JSON.stringify([g.direction,...g.ids]),
          impact:Math.abs(g.currentGross-g.previousGross),positive:!down,observation:`${c.window.to}:${c.previousWindow.to}`,
          evidence:[`Mismo grupo con ventas confirmadas en ambos períodos, sin ambigüedades atribuidas ni otras monedas. ${c.population} clientes con parque evaluados; ${c.excluded} quedan fuera de esta comparación.`,
            `Importes antes de NC. NC identificadas: ${money(g.currentCredits)} actuales y ${money(g.previousCredits)} anteriores. Neto identificado: ${money(g.currentNet)} y ${money(g.previousNet)}; puede haber NC sin atribuir.`,
            'El historial no tiene cobertura acreditada: estas son variaciones de registros confirmados observados, no una medición completa de la actividad comercial.',
            ...g.ids.map(id=>{const r=c.customers.find(row=>row.id===id)!;return `${s.customerComparisonNames![id]}: ${money(r.current.gross)} actuales frente a ${money(r.previous.gross)} anteriores, antes de NC; ${r.machines} máquinas.`;})],
          targets:[{label:'Revisar cartera de clientes',route:'/parque-clientes'}]});
      }
      continue;
    }
    if (s.id === 'maquinas_pedidos') {
      const m=s.machineOrders;
      if (s.status!=='ready' || !s.sections.includes('parque.operaciones') || !s.sections.every(allowed) || !m || !validDay(m.asOf)) continue;
      const counts=[m.orders,m.units,m.readyUnits,...m.ready.flatMap(r=>[r.units,r.pendingUnits])];
      if (counts.some(v=>!n(v) || !Number.isInteger(v) || v<0) || new Set(m.ready.map(r=>r.id)).size!==m.ready.length
        || m.ready.some(r=>!r.id || r.units<=0 || r.units>r.pendingUnits!) || m.ready.length>m.orders
        || m.ready.reduce((t,r)=>t+r.units,0)!==m.readyUnits || m.readyUnits>m.units || m.ready.reduce((t,r)=>t+r.pendingUnits!,0)>m.units) continue;
      blocked.delete('assigned-orders');
      const complete=m.ready.filter(r=>r.units===r.pendingUnits);
      if (!complete.length) continue;
      const partial=m.ready.length-complete.length;
      const scope=[...s.sections].sort().join(',');
      findings.push({id:`assigned-orders|${scope}|pending`,detector:'assigned-orders',problem:`order-fulfilment|${scope}`,topic:s.id,
        text:`${complete.length} pedidos pendientes tienen stock registrado para todas sus unidades. Priorizá sus condiciones comerciales y de entrega; otros ${partial} tienen cobertura parcial.`,
        action:'Revisá crédito, condiciones acordadas y disponibilidad física antes de comprometer entrega. La asignación permite enfocar esa revisión; no acredita que el pedido esté listo para facturar.',
        period:`Pedidos pendientes observados al ${m.asOf}. No es una comparación histórica.`,sections:s.sections,
        facts:{complete:complete.length,partial,assigned:m.readyUnits},decision:JSON.stringify(m.ready.map(r=>[r.id,r.units,r.pendingUnits]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))),
        impact:complete.length,positive:true,observation:m.asOf,
        evidence:['Stock registrado con saldo positivo, asignado a la misma unidad; se excluyen ventas confirmadas por chasis. El corte físico del stock no está acreditado.',...complete.map(r=>{const row=s.breakdown.find(b=>b.route?.endsWith(encodeURIComponent(r.id)) && b.group==='Con stock vinculado');return `${row?.label ?? 'Pedido identificado'}: ${r.units} ${r.units===1?'unidad asignada':'unidades asignadas'}.`;})],
        targets:[{label:'Revisar pedidos pendientes',route:'/parque-operaciones'}]});
      continue;
    }
    const window = s.businessWindow;
    if (s.status !== 'ready' || !s.sections.length || !s.sections.every(allowed) || !window
      || ![window.current.from,window.current.to,window.previous.from,window.previous.to].every(validDay)
      || window.current.from > window.current.to || window.previous.from > window.previous.to || !comparable(s)) continue;
    const current = s.primary?.value, previous = s.primary?.comparison?.value;
    if (!n(current) || !n(previous)) continue;
    // Period identity excludes the advancing cutoff. A new month is a new comparison,
    // but a new day alone cannot create a finding revision.
    const scope = [...s.sections].sort().join(',');
    const period = `${window.current.from}:${window.previous.from}`;
    const add = (detector: DetectorId, facts: Finding['facts'], decision: string, text: string, action: string, impact: number, positive = false) => {
      blocked.delete(detector);
      findings.push({ id: `${detector}|${scope}|${period}`, detector, problem: businessProblem(detector,scope,period), topic: s.id,
        text, action, period: `${formatRange(window.current)} frente a ${formatRange(window.previous)}`, sections: s.sections, facts, decision, impact, positive,
        observation: `${window.current.to}:${window.previous.to}` });
    };
    if (s.id === 'ventas_evolucion' && s.primary?.unit === 'USD' && previous > 0 && current >= 0) {
      const rows = s.breakdown;
      if (rows.length < 2 || rows.some(r => !n(r.previous) || !n(r.value) || r.value < 0 || r.previous! < 0 || r.unit !== 'USD')
        || !close(rows.reduce((t,r) => t+r.value,0),current) || !close(rows.reduce((t,r) => t+r.previous!,0),previous)) continue;
      blocked.delete('sales-contribution');
      if (current === previous) continue;
      const direction = Math.sign(current-previous);
      const lead = [...rows].filter(r => Math.sign(r.value-r.previous!) === direction).sort((a,b) => Math.abs(b.value-b.previous!)-Math.abs(a.value-a.previous!))[0];
      if (!lead) continue;
      const contribution = Math.abs((lead.value-lead.previous!)/(current-previous)*100);
      if (!lead.route) { blocked.set('sales-contribution','Falta acceso al grupo de operaciones comparado.'); continue; }
      add('sales-contribution', { current, previous, contribution, leadCurrent:lead.value, leadPrevious:lead.previous! }, `${direction}:${lead.label}`,
        `${lead.label} aporta ${fmt(contribution)}% de la ${direction > 0 ? 'suba' : 'caída'} de ventas: ${money(Math.abs(lead.value-lead.previous!))} ${direction > 0 ? 'más' : 'menos'} que en el mismo tramo del año anterior, antes de NC.`,
        `Priorizá la revisión comercial de ${lead.label} comparando las operaciones de ambos períodos.`, Math.abs(current-previous), direction > 0);
      Object.assign(findings[findings.length-1], {focus:`Foco comercial: ${lead.label}`,targets:[
        {label:`Revisar ${lead.label} actual`,route:`${lead.route}?${new URLSearchParams({desde:window.current.from,hasta:window.current.to})}`},
        {label:`Comparar ${lead.label} anterior`,route:`${lead.route}?${new URLSearchParams({desde:window.previous.from,hasta:window.previous.to})}`},
      ]});
    }
    // A reconciled NC total remains useful in its card, but without reasons or
    // actionable document groups it is not a distinct managerial finding.
    if (s.id === 'ventas_nc_impacto') continue;
    // A change in closures and median alone does not support a capacity decision.
    // Keep its card; do not promote this KPI comparison to a managerial finding.
    if (s.id === 'servicios_pendientes') continue;

  }
  return { findings, blocked };
}

export type FindingState = 'seen' | 'attended' | 'paused' | 'postponed' | 'resolved';
export type FindingMemory = Record<string, { state: FindingState; decision: string; facts: Finding['facts']; at: string; observation?: string }>;
const factsChanged = (a: Finding['facts'],b: Finding['facts']) => [...new Set([...Object.keys(a),...Object.keys(b)])].some(k=>
  // Enriching older memory with line detail is not a business event.
  !((k==='leadCurrent'||k==='leadPrevious') && !(k in a)) && a[k]!==b[k]);
function explainFacts(f: Finding, before: Finding['facts']) {
  const creditLabels:Record<string,string>={currentCredits:'NC identificadas actuales',previousCredits:'NC identificadas anteriores'};
  const labels: Record<string,string> = { current:f.detector==='service-resolution'?'Mediana actual':f.detector==='credit-impact'?'NC actuales':'Ventas actuales',previous:f.detector==='service-resolution'?'Mediana anterior':f.detector==='credit-impact'?'NC del período anterior':'Ventas del período anterior',contribution:'Aporte de la línea',closed:'OS cerradas actuales',priorClosed:'OS cerradas anteriores',gross:'Ventas brutas',net:'Neto',leadCurrent:'Ventas actuales de la linea',leadPrevious:'Ventas anteriores de la linea' };
  return Object.keys(f.facts).filter(k=>k in before && before[k]!==f.facts[k]).map(k=>{
    const unit=f.detector==='assigned-orders'?(k==='assigned'?' unidades':' pedidos'):k==='contribution'?'%':k==='closed'||k==='priorClosed'?' OS':f.detector==='service-resolution'?' días':' USD';
    const orderLabels:Record<string,string>={complete:'Pedidos con asignación completa',partial:'Pedidos con asignación parcial',assigned:'Unidades asignadas'};
    return `${creditLabels[k] ?? orderLabels[k] ?? labels[k] ?? 'Indicador'}: ${n(before[k])?fmt(before[k]):'sin dato'} → ${fmt(f.facts[k])}${unit}`;
  }).join('; ');
}
const key = (user: string) => `sig-cdm:campi:findings:v1:${user}`;
export function readFindingMemory(user: string): FindingMemory {
  if (!user) return {};
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key(user)) ?? '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return Object.fromEntries(Object.entries(raw).filter(([,v]) => v && typeof v === 'object'
      && ['seen','attended','paused','postponed','resolved'].includes(v.state) && typeof v.decision === 'string'
      && v.facts && Object.values(v.facts).every(n) && typeof v.at === 'string'));
  } catch { return {}; }
}
export function rememberFinding(user: string, finding: Finding, state: FindingState, explicit = false): boolean {
  if (!user) return false;
  try {
    const memory = readFindingMemory(user);
    // Rendering/visiting can acknowledge a revision, never clear a deliberate state.
    const preservedState = state === 'seen' && !explicit ? memory[finding.id]?.state ?? state : state;
    const old=memory[finding.id];
    if (old?.observation && old.observation > finding.observation) {
      // A stale tab may change an explicit workflow state, never replace newer evidence.
      if (!explicit || old.state===state) return true;
      memory[finding.id]={...old,state,at:new Date().toISOString()};
      localStorage.setItem(key(user),JSON.stringify(memory));return true;
    }
    // Idempotent acknowledgement prevents storage-event loops between tabs.
    if(old && old.state===preservedState && old.decision===finding.decision && old.observation===finding.observation && Object.keys(old.facts).length===Object.keys(finding.facts).length && !factsChanged(old.facts,finding.facts)) return true;
    memory[finding.id] = { state: preservedState, decision: finding.decision, facts: finding.facts, observation:finding.observation, at: new Date().toISOString() };
    localStorage.setItem(key(user), JSON.stringify(memory)); return true;
  } catch { return false; }
}
export function selectBusinessFindings(findings: readonly Finding[], memory: FindingMemory) {
  const eligible = findings.filter(f => !['paused','postponed','resolved'].includes(memory[f.id]?.state)
    && (!memory[f.id]?.observation || memory[f.id].observation! <= f.observation));
  // Same-window corrections are explicit revisions with no invented materiality
  // threshold. Advancing-window amounts stay in follow-up but their delta is shown.
  const novelty = (f: Finding) => !memory[f.id] || memory[f.id].decision !== f.decision
    || (memory[f.id].observation===f.observation && factsChanged(memory[f.id].facts,f.facts));
  const ordered: Finding[]=[];
  const problems=new Set<string>();
  for(const fresh of [true,false]) {
    // Compare monetary impacts with money and closure counts with counts, then
    // alternate decision families. No score adds dollars to days or invents urgency.
    const buckets=[eligible.filter(f=>novelty(f)===fresh && f.detector==='assigned-orders'),eligible.filter(f=>novelty(f)===fresh && !['service-resolution','assigned-orders'].includes(f.detector)),eligible.filter(f=>novelty(f)===fresh && f.detector==='service-resolution')];
    buckets.forEach(bucket=>bucket.sort((a,b)=>b.impact-a.impact || a.id.localeCompare(b.id)));
    while(buckets.some(bucket=>bucket.length)) for(const bucket of buckets) {
      const f=bucket.shift();if(f && !problems.has(f.problem)){problems.add(f.problem);ordered.push(f);}
    }
  }
  return ordered.slice(0,4).map(f => ({ ...f, status: !memory[f.id] ? 'new' : novelty(f) ? 'changed' : 'follow-up',
    change: memory[f.id] && (novelty(f) || factsChanged(memory[f.id].facts,f.facts))
      ? `${memory[f.id].decision!==f.decision ? f.detector==='assigned-orders' ? 'Cambió el conjunto de pedidos o la asignación de sus unidades; revisá el detalle actualizado' : 'Cambió la situación' : memory[f.id].observation===f.observation ? 'Cifras corregidas en el mismo período' : 'Seguimiento con cifras actualizadas; puede incluir avance del período'}. ${explainFacts(f,memory[f.id].facts)} ${f.text}` : null }));
}
