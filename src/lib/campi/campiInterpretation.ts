import type { PanoramaStory, StoryDatum, StoryTopicId } from './panoramaStoryTypes';

export type CampiFinding = { topic: StoryTopicId; kind: 'change' | 'attention' | 'neutral'; text: string; urgency: 'confirmed' | 'review' | 'none' };
const number = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1 });
const money = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
const valid = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n);
const amount = (d: StoryDatum) => `${d.unit === 'USD' ? '$ ' : d.unit === 'PYG' ? '₲ ' : ''}${(d.unit === 'USD' || d.unit === 'PYG' ? money : number).format(d.value!)}${d.unit === 'percent' ? '%' : d.unit === 'days' ? ' días' : ''}`;
const lowercaseFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

function billingAreaContext(story: PanoramaStory, current: number, previous: number): string {
  if (story.id !== 'ventas_facturacion' && story.id !== 'ventas_evolucion') return '';
  const rows = story.id === 'ventas_evolucion'
    ? story.breakdown.filter(row => valid(row.previous)).map(row => ({ label: row.label, value: row.value!, previous: row.previous! }))
    : story.chart?.kind === 'bars' ? story.chart.rows : [];
  if (rows.length < 2 || rows.some(row => !valid(row.value) || !valid(row.previous) || row.value < 0 || row.previous < 0)) return '';
  const total = (key: 'value' | 'previous') => rows.reduce((sum, row) => sum + row[key]!, 0);
  if (Math.abs(total('value') - current) > 0.02 || Math.abs(total('previous') - previous) > 0.02) return '';
  const largest = [...rows].sort((a, b) => Math.abs(b.value - b.previous!) - Math.abs(a.value - a.previous!))[0];
  if (largest.value === largest.previous) return '';
  return ` Mayor diferencia entre áreas: ${largest.label} (${amount({ value: largest.previous!, unit: 'USD', label: largest.label })} → ${amount({ value: largest.value, unit: 'USD', label: largest.label })}).`;
}

/** Interprets already-authorized stories only. No network, model, causal inference or implicit deadlines. */
export function interpretCampi(stories: readonly PanoramaStory[]) {
  const usable = stories.filter(s => s.status === 'ready' && s.primary && valid(s.primary.value));
  const findings: CampiFinding[] = usable.map(s => {
    const p = s.primary!;
    const finding = (kind: CampiFinding['kind'], text: string, urgency: CampiFinding['urgency'] = 'none'): CampiFinding => ({ topic: s.id, kind, text, urgency });
    if (s.id === 'ventas_facturacion') {
      const gross = s.supporting.find(d => d.label === 'Ventas antes de NC del mes')?.value;
      const credit = s.supporting.find(d => d.label === 'Notas de crédito del mes')?.value;
      if (valid(gross) && gross > 0 && valid(credit) && credit <= 0 && Math.abs(gross + credit - p.value!) <= 0.02 && -credit / gross >= 0.5) {
        return finding('attention', `Facturación: las NC restaron ${amount({ ...p, value: -credit })} de ${amount({ ...p, value: gross })} en ventas; el neto quedó en ${amount(p)}. Revisá la composición por área.`, 'confirmed');
      }
    }
    if (s.id === 'ventas_evolucion' && p.unit === 'USD' && valid(p.comparison?.value) && p.comparison.value > 0) {
      const previous = p.comparison.value;
      const difference = p.value! - previous;
      if (difference !== 0) return finding('change', `Ventas antes de NC ${difference > 0 ? 'subieron' : 'bajaron'} ${number.format(Math.abs(difference / previous * 100))}% frente al período comparable (${amount({ ...p, value: previous })} → ${amount(p)}; diferencia ${amount({ ...p, value: Math.abs(difference) })}).${billingAreaContext(s, p.value!, previous)}`);
    }
    if (s.id === 'repuestos_stock' && s.notices?.length) {
      return finding('attention', `Stock antiguo de repuestos: ${s.notices[0].text}. Podés abrir los códigos incluidos en el detalle.`, 'review');
    }
    if (s.id === 'maquinas_pedidos' && p.value! > 0) {
      const complete = s.supporting.find(d => d.label === 'Pedidos con stock completo')?.value;
      if (valid(complete) && complete <= p.value!) return finding('neutral', `De ${number.format(p.value!)} pedidos pendientes, ${number.format(complete)} tienen stock vinculado para todas sus unidades. La facturación requiere verificar los demás requisitos comerciales.`);
    }
    if (s.id === 'servicios_pendientes' && valid(p.comparison?.value) && p.comparison.value > 0) {
      const difference = p.value! - p.comparison.value;
      if (difference !== 0) return finding('change', `${s.title}: la mediana ${difference > 0 ? 'aumentó' : 'bajó'} ${number.format(Math.abs(difference))} días frente al mes anterior (${amount({ ...p, value: p.comparison.value })} → ${amount(p)}). Compará también cierres y OS abiertas.`);
    }
    // An age bucket, a static color and a negative projected model are not
    // evidence of improvement, breach or a business alert.
    if (['ventas_facturacion', 'repuestos_clientes'].includes(s.id) && valid(p.comparison?.value) && p.comparison.value > 0) {
      const delta = (p.value! - p.comparison.value) / p.comparison.value * 100;
      if (delta !== 0) return finding('change', `${s.title}: ${lowercaseFirst(p.label)} ${delta > 0 ? 'subió' : 'bajó'} ${number.format(Math.abs(delta))}% frente a ${lowercaseFirst(p.comparison.label)} (${amount({ ...p, value: p.comparison.value })} → ${amount(p)}).${billingAreaContext(s, p.value!, p.comparison.value)}`);
    }
    return finding('neutral', `${s.title}: ${amount(p)} en ${lowercaseFirst(p.label)}.`);
  });
  // Only a reconciled majority of sales reversed by NC overrides the user's order.
  // Other observations follow the chosen topic order; no cross-unit score is computed.
  const ordered = [...findings.filter(f => f.urgency === 'confirmed'), ...findings.filter(f => f.urgency !== 'confirmed' && f.kind !== 'neutral'), ...findings.filter(f => f.kind === 'neutral')];
  const selected = ordered.filter(f => f.kind !== 'neutral').slice(0, 2);
  const sentences = selected.length ? selected.map(f => f.text) : [stories.some(s => s.status === 'error') ? 'Hay fuentes que no pude verificar; revisá los temas señalados.' : usable.length ? 'No encontré novedades relevantes comprobadas en estos temas.' : 'Todavía no tengo cifras verificadas para interpretar estos temas.'];
  return { findings: ordered, sentences, attention: selected.some(f => f.kind === 'attention') };
}
