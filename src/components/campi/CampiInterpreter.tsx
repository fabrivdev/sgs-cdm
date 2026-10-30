import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { interpretCampi } from '@/lib/campi/campiInterpretation';
import { buildCampiComments } from '@/lib/campi/campiComments';
import { isPartsAlertVariant, orderCampiVariants, readLastCampiVariant, rememberCampiVariant } from '@/lib/campi/campiVariantRotation';
import { storyVisitComparison, type StoryVisitSnapshot } from '@/lib/campi/panoramaStoryVisits';
import type { PanoramaStory } from '@/lib/campi/panoramaStoryTypes';
import type { StoryTopicId } from '@/lib/campi/panoramaStoryTypes';
import { CampiPanoramaAvatar } from './CampiPanoramaAvatar';
import { storyDestinations } from '@/lib/campi/storyNavigation';
import type { CampiMood } from './CampiSprite';

const valueLabel = (value: number, unit: string) => `${unit === 'USD' ? '$ ' : unit === 'PYG' ? '₲ ' : ''}${new Intl.NumberFormat('es-PY', { maximumFractionDigits: unit === 'USD' || unit === 'PYG' ? 0 : 2 }).format(value)}${unit === 'percent' ? '%' : unit === 'days' ? ' días' : ''}`;
const signedValue = (value: number, unit: string) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${valueLabel(Math.abs(value), unit)}`;
const visitDate = (at: string) => new Intl.DateTimeFormat('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(at));

export function CampiInterpreter({ stories, loading, previous = null, onOpenStory, userId, detailOpen = false }: { stories: readonly PanoramaStory[]; loading: boolean; previous?: StoryVisitSnapshot | null; onOpenStory?: (id: StoryTopicId) => void; userId?: string; detailOpen?: boolean }) {
  const [commentPosition, setCommentPosition] = useState({ key: '', index: 0 });
  const [commentToken, setCommentToken] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const reading = hovering || keyboardFocus;
  const [visible, setVisible] = useState(() => !document.hidden);
  const [showFirstTip, setShowFirstTip] = useState(() => {
    if (!userId) return false;
    try {
      const key = `sig-cdm:campi:panorama-first-tip:${userId}`;
      const pending = sessionStorage.getItem(key) === '1';
      if (pending) sessionStorage.removeItem(key);
      return pending;
    } catch { return false; }
  });
  useEffect(() => {
    if (!showFirstTip) return;
    const timer = window.setTimeout(() => setShowFirstTip(false), 8500);
    return () => window.clearTimeout(timer);
  }, [showFirstTip]);
  const result = interpretCampi(stories);
  const rawComments = buildCampiComments(stories, previous);
  const commentsKey = JSON.stringify(rawComments.map(comment => [comment.key, comment.text, comment.route, comment.period, comment.evidence]));
  const orderedRef = useRef<{ userId: string | undefined; key: string; comments: typeof rawComments } | null>(null);
  if (!orderedRef.current || orderedRef.current.userId !== userId || orderedRef.current.key !== commentsKey) {
    orderedRef.current = { userId, key: commentsKey, comments: orderCampiVariants(rawComments, readLastCampiVariant(userId ?? '')) };
  }
  const comments = orderedRef.current.comments;
  const commentIndex = commentPosition.key === commentsKey ? Math.min(commentPosition.index, comments.length - 1) : 0;
  const nextComment = useCallback(() => {
    setCommentPosition(previous => ({ key: commentsKey, index: ((previous.key === commentsKey ? previous.index : 0) + 1) % comments.length }));
    setCommentToken(token => token + 1);
  }, [commentsKey, comments.length]);
  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  useEffect(() => {
    if (loading || detailOpen || reading || !visible || comments.length < 2) return;
    const timer = window.setInterval(() => {
      if (!document.getSelection()?.toString()) nextComment();
    }, 25000);
    return () => window.clearInterval(timer);
  }, [commentsKey, commentIndex, comments.length, loading, detailOpen, reading, visible, nextComment]);
  const current = comments[commentIndex];
  useEffect(() => {
    if (!loading && visible && isPartsAlertVariant(current.key)) rememberCampiVariant(userId ?? '', current.key);
  }, [current.key, loading, userId, visible]);
  const lead = result.findings.find(finding => finding.topic === current.topic);
  const presentedStory = stories.find(story => story.id === current.topic);
  const visitComparison = presentedStory ? storyVisitComparison(presentedStory, previous) : null;
  const visit = current.kind === 'visit' && presentedStory && visitComparison?.change
    ? { story: presentedStory, comparison: visitComparison } : null;
  const tone = loading || current.kind === 'limit' ? 'unknown' : current.kind === 'attention' ? 'attention' : current.kind === 'change' || current.kind === 'visit' ? 'change' : 'serene';
  const billing = stories.find(story => story.id === 'ventas_facturacion' && story.status === 'ready');
  const gross = billing?.supporting.find(item => item.label === 'Ventas antes de NC del mes')?.value;
  const credit = billing?.supporting.find(item => item.label === 'Notas de crédito del mes')?.value;
  const billingDelta = billing?.primary?.comparison?.value && billing.primary.value != null ? (billing.primary.value - billing.primary.comparison.value) / Math.abs(billing.primary.comparison.value) : null;
  const mood: CampiMood = loading || current.kind === 'limit' ? 'pensativo' : current.kind === 'visit' ? 'sereno' : lead?.urgency === 'confirmed' ? 'preocupado' : lead?.kind === 'attention' ? 'atento' : lead?.topic === 'ventas_facturacion' && billingDelta !== null && billingDelta >= 0.1 && gross != null && gross > 0 && credit != null && -credit / gross < 0.2 ? 'contento' : lead?.topic === 'ventas_facturacion' && billingDelta !== null && billingDelta <= -0.5 ? 'triste' : lead?.topic === 'ventas_facturacion' && billingDelta !== null && billingDelta <= -0.25 ? 'preocupado' : 'sereno';
  const headline = loading ? 'Estoy revisando tus temas.' : current.text;
  const canExplore = Boolean(presentedStory && (current.route || (onOpenStory && storyDestinations(presentedStory).length)));
  return <section className={`min-w-0 rounded-xl border bg-card p-3.5 panorama-hero panorama-hero--${tone} panorama-hero--${mood}`}
    onPointerEnter={() => setHovering(true)} onPointerLeave={() => setHovering(false)}
    onPointerDown={() => setKeyboardFocus(false)}
    onKeyDownCapture={() => setKeyboardFocus(true)}
    onFocusCapture={event => setKeyboardFocus(event.target.matches(':focus-visible'))}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setKeyboardFocus(false); }}>
    <div className="panorama-hero-avatar"><CampiPanoramaAvatar mood={mood} quiet={detailOpen} reaction={commentToken ? { kind: 'comment', token: commentToken } : null} greetingKey={userId} /></div>
    <div className="panorama-hero-message">
      <div className="panorama-hero-context"><span className="panorama-hero-kicker">{tone === 'attention' ? 'Para revisar' : tone === 'change' ? visit ? 'Desde tu última visita' : 'Cambio observado' : 'Campi · panorama'}</span>{!loading && comments.length > 1 && <span className="campi-comment-count">{commentIndex + 1} de {comments.length}</span>}</div>
      <div className="campi-synthesis" aria-live="off"><h2>{headline}</h2></div>
      {showFirstTip && <p className="campi-first-tip">Abrí la sección de origen desde la tarjeta que quieras explorar.</p>}
      {!loading && visit && <div className="campi-visit-snapshot" aria-label={`Comparación de ${visit.story.title} desde tu última visita en este navegador`}>
        <span>Desde tu última visita del {visitDate(visit.comparison.at)} · {visit.story.title}</span>
        <strong>{valueLabel(visit.comparison.before, visit.comparison.unit)} <span aria-hidden="true">→</span> {valueLabel(visit.comparison.current, visit.comparison.unit)}</strong>
        <small>{lead?.kind === 'attention' && <>Cambio {signedValue(visit.comparison.change, visit.comparison.unit)} · </>}Entre lecturas del mismo alcance; puede incluir correcciones y paso del tiempo.</small>
      </div>}
      {!loading && canExplore && <div className="campi-hero-actions">{current.route
        ? <Button variant="outline" className="campi-explore" asChild><Link to={current.route} aria-label={`Explorar ${presentedStory!.title}`}>Explorar<ArrowRight className="h-4 w-4" /></Link></Button>
        : <Button type="button" variant="outline" className="campi-explore" aria-label={`Explorar ${presentedStory!.title}`} onClick={() => onOpenStory?.(presentedStory!.id)}>Explorar<ArrowRight className="h-4 w-4" /></Button>}</div>}
    </div>
  </section>;
}
