import { useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/layout/AppPrimitives';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { answerCampi, interpretCampi } from '@/lib/campi/campiInterpretation';
import { storySummaryPercentage } from '@/lib/campi/storySummary';
import type { PanoramaStory } from '@/lib/campi/panoramaStoryTypes';
import { CampiPanoramaAvatar } from './CampiPanoramaAvatar';

export function CampiInterpreter({ stories, loading }: { stories: readonly PanoramaStory[]; loading: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState<string | null>(null);
  const result = interpretCampi(stories);
  const lead = result.findings.find(f => f.kind === 'advance');
  const leadStory = stories.find(s => s.id === lead?.topic);
  const change = leadStory && storySummaryPercentage(leadStory);
  const attention = [...result.findings].filter(f => f.kind === 'attention').sort((a, b) => b.rank - a.rank)[0];
  const attentionStory = stories.find(s => s.id === attention?.topic);
  const headline = leadStory && change?.kind === 'variation'
    ? `${leadStory.title === 'Facturación' ? 'La facturación' : leadStory.title} subió ${new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1 }).format(change.value)}% frente al período comparable.`
    : attention ? `Hay un punto para revisar en ${attentionStory!.title.toLowerCase()}.` : 'Tus prioridades, en un solo lugar.';
  const support = attention?.topic === 'servicios_pendientes'
    ? `Hay ${attentionStory!.supporting.find(d => d.label === 'Abiertas hace más de 30 días')!.value} órdenes abiertas hace más de 30 días. Es el punto a revisar hoy.`
    : attention ? attention.text : 'Explorá cada tema para ver sus datos, comparaciones y detalles.';
  const actions = [attentionStory, leadStory].filter((s): s is PanoramaStory => Boolean(s));
  const ask = (text: string) => { if (text.trim()) setAsked(text.trim()); };
  return <Panel className="panorama-hero">
    <div className="panorama-hero-avatar"><CampiPanoramaAvatar attention={result.attention} /></div>
    <div className="panorama-hero-message">
      <span className="panorama-hero-kicker">¡Hola! Soy Campi.</span>
      <div className="campi-synthesis" aria-live="polite"><h2>{loading ? 'Estoy reuniendo tus temas.' : headline}</h2>{!loading && <p>{support}</p>}</div>
      {!loading && <div className="campi-hero-actions">{actions.map((story, i) => <Button key={story.id} variant={i === 0 ? 'default' : 'outline'} onClick={() => ask(story.question)}>{story.id === 'servicios_pendientes' ? 'Revisar órdenes' : `Explorar ${story.title.toLowerCase()}`}<ArrowRight className="h-4 w-4" /></Button>)}</div>}
    </div>
    <div className="campi-questions">
      <form className="campi-question-form" onSubmit={event => { event.preventDefault(); ask(question); }}>
        <label className="sr-only" htmlFor="campi-question">Preguntale a Campi</label>
        <input ref={inputRef} id="campi-question" value={question} maxLength={300} onChange={event => setQuestion(event.target.value)} placeholder="¿Qué querés saber de tu panorama?" disabled={loading} />
        <Button type="submit" size="icon" disabled={loading || !question.trim()} aria-label="Preguntar a Campi"><ArrowRight className="h-5 w-5" /></Button>
      </form>
      <span className="campi-suggestions-label">Preguntas sugeridas</span>
      <div className="campi-suggestions">{!loading && result.suggestions.map(s => <button key={s.question} type="button" onClick={() => ask(s.question)}>{s.question}<ArrowRight aria-hidden="true" className="h-4 w-4" /></button>)}</div>
    </div>
    <Dialog open={asked !== null} onOpenChange={open => { if (!open) setAsked(null); }}><DialogContent className="campi-answer-dialog" onCloseAutoFocus={event => { event.preventDefault(); inputRef.current?.focus(); }}><DialogHeader><DialogTitle>Campi</DialogTitle><DialogDescription>Lectura basada en reglas y datos cargados; sin IA externa.</DialogDescription></DialogHeader><p className="campi-asked">{asked}</p><p className="campi-answer">{asked ? answerCampi(asked, stories) : ''}</p></DialogContent></Dialog>
  </Panel>;
}
