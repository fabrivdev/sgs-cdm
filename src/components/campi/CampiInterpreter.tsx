import { useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/layout/AppPrimitives';
import { ResponsiveDrawer, ResponsiveDrawerBody } from '@/components/ui/responsive-drawer';
import { answerCampi, interpretCampi, matchCampiTopic } from '@/lib/campi/campiInterpretation';
import { storyVisitComparison, type StoryVisitSnapshot } from '@/lib/campi/panoramaStoryVisits';
import type { PanoramaStory } from '@/lib/campi/panoramaStoryTypes';
import type { StoryTopicId } from '@/lib/campi/panoramaStoryTypes';
import { CampiPanoramaAvatar } from './CampiPanoramaAvatar';
import type { CampiMood } from './CampiSprite';

const valueLabel = (value: number, unit: string) => `${unit === 'USD' ? '$ ' : unit === 'PYG' ? '₲ ' : ''}${new Intl.NumberFormat('es-PY', { maximumFractionDigits: 2 }).format(value)}${unit === 'percent' ? '%' : unit === 'days' ? ' días' : ''}`;
const signedValue = (value: number, unit: string) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${valueLabel(Math.abs(value), unit)}`;
const visitDate = (at: string) => new Intl.DateTimeFormat('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(at));

export function CampiInterpreter({ stories, loading, previous = null, onOpenStory, userId }: { stories: readonly PanoramaStory[]; loading: boolean; previous?: StoryVisitSnapshot | null; onOpenStory?: (id: StoryTopicId) => void; userId?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const askButtonRef = useRef<HTMLButtonElement>(null);
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState<string | null>(null);
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [questionToken, setQuestionToken] = useState(0);
  const result = interpretCampi(stories);
  const lead = result.findings.find(f => f.kind !== 'neutral') ?? result.findings[0];
  const visit = stories.flatMap(story => {
    const comparison = storyVisitComparison(story, previous);
    return comparison ? [{ story, comparison }] : [];
  }).find(item => item.story.id === lead?.topic && item.comparison.change !== 0)
    ?? stories.flatMap(story => {
      const comparison = storyVisitComparison(story, previous);
      return comparison?.change ? [{ story, comparison }] : [];
    })[0];
  const presentedStory = lead?.kind === 'attention' ? stories.find(story => story.id === lead.topic) : visit?.story ?? stories.find(story => story.id === lead?.topic);
  const tone = loading || !lead ? 'unknown' : lead.kind === 'attention' ? 'attention' : visit || lead.kind === 'change' ? 'change' : 'serene';
  const billing = stories.find(story => story.id === 'ventas_facturacion' && story.status === 'ready');
  const gross = billing?.supporting.find(item => item.label === 'Ventas antes de NC del mes')?.value;
  const credit = billing?.supporting.find(item => item.label === 'Notas de crédito del mes')?.value;
  const billingDelta = billing?.primary?.comparison?.value && billing.primary.value != null ? (billing.primary.value - billing.primary.comparison.value) / Math.abs(billing.primary.comparison.value) : null;
  const mood: CampiMood = loading || !lead ? 'pensativo' : lead.urgency === 'confirmed' ? 'preocupado' : lead.kind === 'attention' ? 'atento' : lead.topic === 'ventas_facturacion' && billingDelta !== null && billingDelta >= 0.1 && gross != null && gross > 0 && credit != null && -credit / gross < 0.2 ? 'contento' : lead.topic === 'ventas_facturacion' && billingDelta !== null && billingDelta <= -0.5 ? 'triste' : lead.topic === 'ventas_facturacion' && billingDelta !== null && billingDelta <= -0.25 ? 'preocupado' : 'sereno';
  const headline = loading ? 'Estoy revisando tus temas.'
    : lead?.kind === 'attention' ? lead.text
    : visit ? `${visit.story.title}: ${signedValue(visit.comparison.change, visit.comparison.unit)} desde tu última visita.`
    : lead?.kind === 'change' ? lead.text
    : result.sentences[0];
  const actions = presentedStory ? [presentedStory] : [];
  const suggestions = visit ? [{ question: '¿Qué cambió desde mi última visita?', topic: visit.story.id }, ...result.suggestions.filter(s => s.topic !== visit.story.id)].slice(0, 2) : result.suggestions;
  const ask = (text: string) => { if (text.trim()) { setAsked(text.trim()); setQuestionsOpen(true); setQuestionToken(current => current + 1); } };
  const brief = (text: string | undefined, billing = false) => {
    if (!text) return '';
    if (billing && lead?.topic === 'ventas_facturacion' && lead.kind === 'attention' && presentedStory?.primary?.value != null) {
      const gross = presentedStory.supporting.find(item => item.label === 'Ventas antes de NC del mes')?.value;
      const credit = presentedStory.supporting.find(item => item.label === 'Notas de crédito del mes')?.value;
      if (gross != null && gross > 0 && credit != null) return `Las NC representan ${new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1 }).format(-credit / gross * 100)}% de las ventas antes de NC; neto ${valueLabel(presentedStory.primary.value, 'USD')}.`;
    }
    return text.split(/(?<=[.!?])\s+/)[0];
  };
  const secondary = result.sentences.find(sentence => sentence !== lead?.text);
  return <Panel className={`panorama-hero panorama-hero--${tone} panorama-hero--${mood}`}>
    <div className="panorama-hero-avatar"><CampiPanoramaAvatar mood={questionsOpen ? 'pensativo' : mood} quiet={questionsOpen} reaction={questionToken ? { kind: 'ask', token: questionToken } : null} greetingKey={userId} /></div>
    <div className="panorama-hero-message">
      <div className="panorama-hero-context"><span className="panorama-hero-kicker">{tone === 'attention' ? 'Para revisar' : tone === 'change' ? visit ? 'Desde tu última visita' : 'Cambio observado' : 'Campi · panorama'}</span></div>
      <div className="campi-synthesis" aria-live="polite"><h2>{brief(headline, true)}</h2>{!loading && secondary && <p>{brief(secondary)}</p>}</div>
      {!loading && visit && <div className="campi-visit-snapshot" aria-label={`Comparación de ${visit.story.title} desde tu última visita en este navegador`}>
        <span>Desde tu última visita del {visitDate(visit.comparison.at)} · {visit.story.title}</span>
        <strong>{valueLabel(visit.comparison.before, visit.comparison.unit)} <span aria-hidden="true">→</span> {valueLabel(visit.comparison.current, visit.comparison.unit)}</strong>
        <small>{lead?.kind === 'attention' && <>Cambio {signedValue(visit.comparison.change, visit.comparison.unit)} · </>}mismo tema y alcance</small>
      </div>}
      {!loading && <div className="campi-hero-actions">{actions.map((story, i) => <Button key={story.id} variant={i === 0 ? 'default' : 'outline'} onClick={() => onOpenStory ? onOpenStory(story.id) : ask(story.question)}>Ver datos de {story.title.toLowerCase()}<ArrowRight className="h-4 w-4" /></Button>)}{result.findings.length > 0 && <Button ref={askButtonRef} variant="outline" onClick={() => { setQuestionsOpen(true); setQuestionToken(current => current + 1); }}>Preguntale a Campi</Button>}</div>}
    </div>
    <ResponsiveDrawer open={questionsOpen} onOpenChange={open => { setQuestionsOpen(open); if (!open) setAsked(null); }} title="Preguntale a Campi" onCloseAutoFocus={event => { event.preventDefault(); askButtonRef.current?.focus(); }}>
      <ResponsiveDrawerBody className="campi-questions">
      <form className="campi-question-form" onSubmit={event => { event.preventDefault(); ask(question); }}>
        <label className="sr-only" htmlFor="campi-question">Preguntale a Campi</label>
        <input ref={inputRef} id="campi-question" value={question} maxLength={300} onChange={event => setQuestion(event.target.value)} placeholder="¿Qué querés saber de tu panorama?" disabled={loading} />
        <Button type="submit" size="icon" disabled={loading || !question.trim()} aria-label="Preguntar a Campi"><ArrowRight className="h-5 w-5" /></Button>
      </form>
      <span className="campi-suggestions-label">Preguntas sugeridas</span>
      <div className="campi-suggestions">{!loading && suggestions.map(s => <button key={s.question} type="button" onClick={() => ask(s.question)}>{s.question}<ArrowRight aria-hidden="true" className="h-4 w-4" /></button>)}</div>
      {asked && <section className="campi-answer-block" aria-live="polite"><h3>Respuesta de Campi</h3><p className="campi-asked">{asked}</p><p className="campi-answer">{answerCampi(asked, stories, previous)}</p></section>}
      {asked && matchCampiTopic(asked, stories) && <Button variant="outline" onClick={() => { const id = matchCampiTopic(asked, stories)?.id; setQuestionsOpen(false); if (id) onOpenStory?.(id); }}>Ver datos de {matchCampiTopic(asked, stories)?.title.toLowerCase()}<ArrowRight className="h-4 w-4" /></Button>}
      </ResponsiveDrawerBody>
    </ResponsiveDrawer>
  </Panel>;
}
