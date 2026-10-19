import type { PanoramaStory, StoryDatum, StoryTopicId } from './panoramaStoryTypes';
import { storyVisitComparison, type StoryVisitSnapshot } from './panoramaStoryVisits';

export type CampiFinding = { topic: StoryTopicId; kind: 'change' | 'attention' | 'neutral'; text: string; urgency: 'confirmed' | 'review' | 'none' };
const number = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1 });
const money = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 2 });
const valid = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n);
const amount = (d: StoryDatum) => `${d.unit === 'USD' ? 'USD ' : d.unit === 'PYG' ? '₲ ' : ''}${(d.unit === 'USD' || d.unit === 'PYG' ? money : number).format(d.value!)}${d.unit === 'percent' ? '%' : d.unit === 'days' ? ' días' : ''}`;
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[¿?!.]/g, '').replace(/\s+/g, ' ').trim();
const lowercaseFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

function billingAreaContext(story: PanoramaStory, current: number, previous: number): string {
  if (story.id !== 'ventas_facturacion' || story.chart?.kind !== 'bars') return '';
  const rows = story.chart.rows;
  if (rows.length < 2 || rows.some(row => !valid(row.value) || !valid(row.previous) || row.value < 0 || row.previous < 0)) return '';
  const total = (key: 'value' | 'previous') => rows.reduce((sum, row) => sum + row[key]!, 0);
  if (Math.abs(total('value') - current) > 0.02 || Math.abs(total('previous') - previous) > 0.02) return '';
  const largest = [...rows].sort((a, b) => Math.abs(b.value - b.previous!) - Math.abs(a.value - a.previous!))[0];
  if (largest.value === largest.previous) return '';
  return ` Mayor diferencia entre áreas: ${largest.label} (${amount({ ...story.primary!, value: largest.previous! })} → ${amount({ ...story.primary!, value: largest.value })}).`;
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
    if (s.id === 'repuestos_stock' && s.notices?.length) {
      return finding('attention', `Stock antiguo de repuestos: ${s.notices[0].text}. Podés abrir los códigos incluidos en el detalle.`, 'review');
    }
    if (s.id === 'maquinas_pedidos' && p.value! > 0) {
      const total = s.supporting.find(d => d.label === 'Unidades activas')?.value;
      return finding('neutral', `${s.title}: ${amount(p)} de ${valid(total) ? number.format(total) : 'las'} unidades activas no tienen abastecimiento vinculado de forma única. Es diagnóstico de vínculos, no de entregas atrasadas.`);
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
  const suggestions = selected.map(f => {
    const s = usable.find(s => s.id === f.topic)!;
    return { question: `¿Qué muestran los datos de ${s.title.toLowerCase()}?`, topic: s.id };
  });
  for (const story of usable) {
    if (suggestions.length >= 2) break;
    if (!suggestions.some(suggestion => suggestion.topic === story.id)) suggestions.push({ question: `¿Qué muestran los datos de ${story.title.toLowerCase()}?`, topic: story.id });
  }
  return { findings: ordered, sentences, suggestions, attention: selected.some(f => f.kind === 'attention') };
}

export function answerCampi(question: string, stories: readonly PanoramaStory[], previous: StoryVisitSnapshot | null = null): string {
  const interpretation = interpretCampi(stories);
  const q = normalize(question);
  const chosen = interpretation.suggestions.find(s => normalize(s.question) === q);
  if (q === 'que limites tienen estos datos' && interpretation.findings.length) return 'Solo interpreto los temas seleccionados y autorizados que ya están cargados. Una cantidad pendiente o una OS antigua no acreditan demora; una subida no acredita su causa ni rentabilidad. El saldo proyectado no equivale al stock físico. Las fuentes sin corte informado no acreditan actualización en tiempo real.';
  if (q === 'que cambio desde mi ultima visita') {
    const changes = stories.flatMap(story => {
      const comparison = storyVisitComparison(story, previous);
      return comparison?.change ? [`${story.title}: ${amount({ ...story.primary!, value: comparison.before })} → ${amount({ ...story.primary!, value: comparison.current })} desde la referencia guardada de esta sesión; ${comparison.change > 0 ? 'aumentó' : 'disminuyó'} ${amount({ ...story.primary!, value: Math.abs(comparison.change) })}.`] : [];
    });
    return changes.length ? changes.join(' ') : 'No hay un cambio comparable desde tu visita anterior para los temas seleccionados. Falta una referencia previa, cambió el alcance o los valores permanecen iguales.';
  }
  if (['que mejoro', 'que merece atencion', 'que cambio'].includes(q)) {
    if (q === 'que mejoro') return 'No puedo determinar una mejora de negocio solo con estos indicadores. Puedo mostrar los cambios observados y los puntos que requieren revisión.';
    const kind = q === 'que merece atencion' ? 'attention' : 'change';
    const found = interpretation.findings.filter(f => f.kind === kind);
    return found.length ? found.map(f => f.text).join(' ') : kind === 'attention' ? 'Estos temas no contienen una meta, fecha comprometida o umbral verificado que permita señalar una alerta. Puedo mostrar los cambios observados y el detalle de cada tema.' : 'No hay una comparación válida con cambio para estos temas.';
  }
  const story = chosen ? stories.find(s => s.id === chosen.topic) : stories.find(s => normalize(s.question) === q && interpretation.findings.some(f => f.topic === s.id));
  if (!story) return 'No puedo responder esa consulta con los datos cargados. Puedo explicar los temas seleccionados, sus comparaciones y sus límites; probá una pregunta sugerida. No consulto otras fuentes ni infiero causas, vencimientos o compromisos.';
  const finding = interpretation.findings.find(f => f.topic === story.id)!;
  return `${finding.text} Alcance: ${story.scope}. Período: ${story.periodLabel}. Corte: ${story.cutoff ?? 'no informado por la fuente'}. Fuente: ${story.source}. ${story.details.join(' ')}`;
}
