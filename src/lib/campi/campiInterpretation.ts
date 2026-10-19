import type { PanoramaStory, StoryDatum, StoryTopicId } from './panoramaStoryTypes';

export type CampiFinding = { topic: StoryTopicId; kind: 'advance' | 'attention' | 'neutral'; text: string; rank: number };
const number = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1 });
const valid = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n);
const amount = (d: StoryDatum) => `${d.unit === 'USD' ? 'USD ' : d.unit === 'PYG' ? '₲ ' : ''}${number.format(d.value!)}${d.unit === 'percent' ? '%' : ''}`;
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[¿?!.]/g, '').replace(/\s+/g, ' ').trim();

/** Interprets already-authorized stories only. No network, model, causal inference or implicit deadlines. */
export function interpretCampi(stories: readonly PanoramaStory[]) {
  const usable = stories.filter(s => s.status === 'ready' && s.primary && valid(s.primary.value));
  const findings: CampiFinding[] = usable.map(s => {
    const p = s.primary!;
    const finding = (kind: CampiFinding['kind'], text: string, rank: number): CampiFinding => ({ topic: s.id, kind, text, rank });
    if (s.id === 'servicios_pendientes') {
      const aged = s.supporting.find(d => d.label === 'Abiertas hace más de 30 días' && d.unit === 'count');
      if (valid(aged?.value) && aged.value > 0 && p.unit === 'count' && aged.value <= p.value!) return finding('attention', `Conviene revisar ${number.format(aged.value)} de ${number.format(p.value!)} OS abiertas por su antigüedad de más de 30 días; esto no acredita vencimiento.`, 100);
    }
    if (s.id === 'maquinas_proyeccion') {
      const negatives = s.breakdown.filter(d => d.unit === 'count' && valid(d.value) && d.value < 0);
      if (negatives.length) return finding('attention', `La proyección tiene ${negatives.length} ${negatives.length === 1 ? 'modelo con saldo negativo' : 'modelos con saldo negativo'} después de sumar compras y restar ventas pendientes.`, 95);
    }
    if (s.id === 'repuestos_stock') {
      const red = s.supporting.find(d => d.label === 'Rojo · valor Kardex' && d.unit === 'USD');
      if (valid(red?.value) && red.value > 0) return finding('attention', `Repuestos tiene ${amount(red!)} de valor Kardex en rojo: sin ventas en tres años y última compra hace más de 1.000 días.`, 90);
    }
    // Positive sales movement is not a claim about profitability, demand or its cause.
    if (['ventas_facturacion', 'repuestos_clientes'].includes(s.id) && valid(p.comparison?.value) && p.comparison.value > 0) {
      const delta = (p.value! - p.comparison.value) / p.comparison.value * 100;
      if (delta !== 0) return finding(delta > 0 ? 'advance' : 'attention', `${s.title}: ${p.label.toLowerCase()} ${delta > 0 ? 'subió' : 'bajó'} ${number.format(Math.abs(delta))}% frente a ${p.comparison.label.toLowerCase()} (${amount({ ...p, value: p.comparison.value })} → ${amount(p)}).`, 50 + Math.min(Math.abs(delta), 30));
    }
    return finding('neutral', `${s.title}: ${amount(p)} en ${p.label.toLowerCase()}, sin base suficiente para calificarlo como mejora o alerta.`, 0);
  });
  const ordered = [...findings].sort((a, b) => b.rank - a.rank || a.topic.localeCompare(b.topic));
  const advance = ordered.find(f => f.kind === 'advance');
  const attention = ordered.find(f => f.kind === 'attention');
  const selected: CampiFinding[] = [advance, attention].filter((f): f is CampiFinding => Boolean(f));
  for (const f of ordered) if (selected.length < 2 && !selected.some(x => x.topic === f.topic)) selected.push(f);
  const sentences = selected.map(f => f.text);
  if (!sentences.length) sentences.push('Todavía no tengo cifras verificadas para interpretar estos temas.');
  if (sentences.length < 2) sentences.push(stories.some(s => s.status === 'error') ? 'Hay fuentes que no se pudieron verificar; revisá el tema indicado.' : 'No hay otro hecho con base suficiente para destacar en esta selección.');
  const suggestions = selected.map(f => {
    const s = usable.find(s => s.id === f.topic)!;
    return { question: `¿Qué muestran los datos de ${s.title.toLowerCase()}?`, topic: s.id };
  });
  if (suggestions.length < 2 && usable.length) suggestions.push({ question: '¿Qué límites tienen estos datos?', topic: usable[0].id });
  return { findings, sentences, suggestions, attention: Boolean(attention) };
}

export function answerCampi(question: string, stories: readonly PanoramaStory[]): string {
  const interpretation = interpretCampi(stories);
  const q = normalize(question);
  const chosen = interpretation.suggestions.find(s => normalize(s.question) === q);
  if (q === 'que limites tienen estos datos' && interpretation.findings.length) return 'Solo interpreto los temas seleccionados y autorizados que ya están cargados. Una cantidad pendiente no acredita demora; una subida no acredita su causa ni rentabilidad. Las fuentes sin corte informado no acreditan actualización en tiempo real.';
  if (['que mejoro', 'que merece atencion', 'que cambio'].includes(q)) {
    const kind = q === 'que mejoro' ? 'advance' : q === 'que merece atencion' ? 'attention' : null;
    const found = interpretation.findings.filter(f => !kind || f.kind === kind);
    return found.length ? found.map(f => f.text).join(' ') : 'No hay evidencia comparable suficiente en estos datos para afirmar eso.';
  }
  const story = chosen ? stories.find(s => s.id === chosen.topic) : stories.find(s => normalize(s.question) === q && interpretation.findings.some(f => f.topic === s.id));
  if (!story) return 'No puedo responder esa consulta con los datos cargados. Puedo explicar los temas seleccionados, sus comparaciones y sus límites; probá una pregunta sugerida. No consulto otras fuentes ni infiero causas, vencimientos o compromisos.';
  const finding = interpretation.findings.find(f => f.topic === story.id)!;
  return `${finding.text} Alcance: ${story.scope}. Período: ${story.periodLabel}. Corte: ${story.cutoff ?? 'no informado por la fuente'}. Fuente: ${story.source}. ${story.details.join(' ')}`;
}
