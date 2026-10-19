import { useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/layout/AppPrimitives';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { answerCampi, interpretCampi } from '@/lib/campi/campiInterpretation';
import { storyVisitComparison, type StoryVisitSnapshot } from '@/lib/campi/panoramaStoryVisits';
import type { PanoramaStory } from '@/lib/campi/panoramaStoryTypes';
import { CampiPanoramaAvatar } from './CampiPanoramaAvatar';

const valueLabel = (value: number, unit: string) => `${unit === 'USD' ? 'USD ' : unit === 'PYG' ? '₲ ' : ''}${new Intl.NumberFormat('es-PY', { maximumFractionDigits: 2 }).format(value)}${unit === 'percent' ? '%' : unit === 'days' ? ' días' : ''}`;
const signedValue = (value: number, unit: string) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${valueLabel(Math.abs(value), unit)}`;
const visitDate = (at: string) => new Intl.DateTimeFormat('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(at));

export function CampiInterpreter({ stories, loading, previous = null }: { stories: readonly PanoramaStory[]; loading: boolean; previous?: StoryVisitSnapshot | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState<string | null>(null);
  const result = interpretCampi(stories);
  const attention = [...result.findings].filter(f => f.kind === 'attention').sort((a, b) => b.rank - a.rank)[0];
  const attentionStory = stories.find(s => s.id === attention?.topic);
  const visit = stories.flatMap(story => {
    const comparison = storyVisitComparison(story, previous);
    return comparison ? [{ story, comparison }] : [];
  }).find(item => item.story.id === attention?.topic && item.comparison.change !== 0)
    ?? stories.flatMap(story => {
      const comparison = storyVisitComparison(story, previous);
      return comparison?.change ? [{ story, comparison }] : [];
    })[0];
  const lead = attention ?? result.findings.find(f => f.kind === 'change') ?? result.findings[0];
  const leadStory = stories.find(story => story.id === lead?.topic);
  const tone = loading || !lead ? 'unknown' : attention ? 'attention' : visit || lead.kind === 'change' ? 'change' : 'serene';
  const headline = loading ? 'Estoy revisando tus temas.'
    : attention ? attention.text
    : visit ? `${visit.story.title}: ${signedValue(visit.comparison.change, visit.comparison.unit)} desde tu última visita.`
    : lead ? lead.text : 'Todavía no tengo cifras verificadas para resumir tus temas.';
  const actions = leadStory ? [leadStory] : [];
  const suggestions = visit ? [{ question: '¿Qué cambió desde mi última visita?', topic: visit.story.id }, ...result.suggestions.filter(s => s.topic !== visit.story.id)].slice(0, 2) : result.suggestions;
  const ask = (text: string) => { if (text.trim()) setAsked(text.trim()); };
  return <Panel className={`panorama-hero panorama-hero--${tone}`}>
    <div className="panorama-hero-avatar"><CampiPanoramaAvatar attention={tone === 'attention'} change={tone === 'change'} /></div>
    <div className="panorama-hero-message">
      <div className="panorama-hero-context"><span className="panorama-hero-kicker">{tone === 'attention' ? 'Para revisar' : tone === 'change' ? visit ? 'Desde tu última visita' : 'Cambio observado' : 'Campi · panorama'}</span>{!loading && leadStory && <span>{leadStory.scope} · {leadStory.periodLabel}</span>}</div>
      <div className="campi-synthesis" aria-live="polite"><h2>{headline}</h2></div>
      {!loading && visit && <div className="campi-visit-snapshot" aria-label={`Comparación de ${visit.story.title} desde tu última visita en este navegador`}>
        <span>Desde tu última visita del {visitDate(visit.comparison.at)} · {visit.story.title}</span>
        <strong>{valueLabel(visit.comparison.before, visit.comparison.unit)} <span aria-hidden="true">→</span> {valueLabel(visit.comparison.current, visit.comparison.unit)}</strong>
        <small>{attention && <>Cambio {signedValue(visit.comparison.change, visit.comparison.unit)} · </>}mismo tema y alcance</small>
      </div>}
      {!loading && <div className="campi-hero-actions">{actions.map((story, i) => <Button key={story.id} variant={i === 0 ? 'default' : 'outline'} onClick={() => ask(story.question)}>Ver datos de {story.title.toLowerCase()}<ArrowRight className="h-4 w-4" /></Button>)}</div>}
    </div>
    {!loading && result.findings.length > 0 && <div className="campi-questions">
      <form className="campi-question-form" onSubmit={event => { event.preventDefault(); ask(question); }}>
        <label className="sr-only" htmlFor="campi-question">Preguntale a Campi</label>
        <input ref={inputRef} id="campi-question" value={question} maxLength={300} onChange={event => setQuestion(event.target.value)} placeholder="¿Qué querés saber de tu panorama?" disabled={loading} />
        <Button type="submit" size="icon" disabled={loading || !question.trim()} aria-label="Preguntar a Campi"><ArrowRight className="h-5 w-5" /></Button>
      </form>
      <span className="campi-suggestions-label">Preguntas sugeridas</span>
      <div className="campi-suggestions">{!loading && suggestions.map(s => <button key={s.question} type="button" onClick={() => ask(s.question)}>{s.question}<ArrowRight aria-hidden="true" className="h-4 w-4" /></button>)}</div>
    </div>}
    <Dialog open={asked !== null} onOpenChange={open => { if (!open) setAsked(null); }}><DialogContent className="campi-answer-dialog" onCloseAutoFocus={event => { event.preventDefault(); inputRef.current?.focus(); }}><DialogHeader><DialogTitle>Campi</DialogTitle><DialogDescription>Lectura basada en reglas y datos cargados; sin IA externa.</DialogDescription></DialogHeader><p className="campi-asked">{asked}</p><p className="campi-answer">{asked ? answerCampi(asked, stories, previous) : ''}</p></DialogContent></Dialog>
  </Panel>;
}
