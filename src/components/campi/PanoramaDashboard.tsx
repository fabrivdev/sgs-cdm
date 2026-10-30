import { unifiedCoverageEnabled } from '@/lib/unifiedCoverage';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { RefreshCw, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, PageShell } from '@/components/layout/AppPrimitives';
import type { SectionKey } from '@/lib/permissions';
import { loadPanoramaStories, storySectionsForTopics } from '@/lib/campi/panoramaStories';
import type { PanoramaTopic, PanoramaTopicId } from '@/lib/campi/panoramaPreferences';
import type { PanoramaStory, StoryPeriod, StoryTopicId } from '@/lib/campi/panoramaStoryTypes';
import { scopedSalesStory } from '@/lib/campi/salesScope';
import { topicContract } from '@/lib/campi/panoramaTopicContracts';
import { PanoramaLoadingCard } from './PanoramaLoadingCard';
import { BusinessCampi } from './BusinessCampi';
import { PanoramaStoryCard } from './PanoramaStoryCard';
import { ApprovedPanoramaCard } from './ApprovedPanoramaCard';
import { readStoryVisit, saveStoryVisit } from '@/lib/campi/panoramaStoryVisits';
import './panorama-dashboard.css';

const today = () => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Asuncion', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

export function PanoramaDashboard({ userId, greetingName = 'Usuario', topics, available, hasAccess, onEdit }: {
  userId: string; greetingName?: string; topics: readonly PanoramaTopicId[]; available: readonly PanoramaTopic[];
  hasAccess: (section: SectionKey) => boolean; onEdit: () => void;
}) {
  const [scopeChoice,setScopeChoice]=useState<{user:string;topics:Partial<Record<StoryTopicId,SectionKey[]>>}>({user:userId,topics:{}});
  const salesScopeFor=(id:StoryTopicId)=>scopeChoice.user===userId?(scopeChoice.topics[id]??[]).filter(section=>id==='clientes_cobertura_posventa'?hasAccess('parque.maquinas')&&(section==='repuestos.ventas'||section==='servicios.ventas'):hasAccess(section)):[];
  const [asOf,setAsOf] = useState(today);
  useEffect(()=>{
    const refreshDay=()=>setAsOf(today());
    const timer=window.setInterval(refreshDay,60_000);
    window.addEventListener('focus',refreshDay);
    return ()=>{window.clearInterval(timer);window.removeEventListener('focus',refreshDay);};
  },[]);
  const previous = useMemo(() => readStoryVisit(userId), [userId]);
  const recorded = useRef<string | null>(null);
  const [openStory, setOpenStory] = useState<{ id: StoryTopicId; token: number } | null>(null);
  const [detailOpen, setDetailOpen] = useState<StoryTopicId | null>(null);
  const [periodByTopic, setPeriodByTopic] = useState<Partial<Record<StoryTopicId, StoryPeriod>>>({});
  // Local review never writes priorities or the last-visit baseline.
  const [reviewTopic, setReviewTopic] = useState<StoryTopicId | null>(null);
  const reviewable = available.filter(topic => topic.requiresAllSections ? topic.sections.every(hasAccess) : topic.sections.some(hasAccess));
  const reviewing = import.meta.env.DEV && reviewTopic !== null;
  const selected = (reviewing ? [reviewTopic] : topics).filter(id => reviewable.some(topic => topic.id === id)) as StoryTopicId[];
  const granted = storySectionsForTopics(selected, hasAccess);
  const groups = selected.reduce<StoryTopicId[][]>((result, id) => {
    const key = `${topicContract(id)?.queryGroup ?? id}:${periodByTopic[id] ?? 'month'}`;
    const ids = selected.filter(candidate => `${topicContract(candidate)?.queryGroup ?? candidate}:${periodByTopic[candidate] ?? 'month'}` === key);
    if (!result.some(group => group[0] === ids[0])) result.push(ids);
    return result;
  }, []);
  const reportFor = (id: StoryTopicId) => reports[groups.findIndex(group => group.includes(id))];
  // Keep the four chosen positions stable while independent sources resolve.
  // A slow sales report must not hold back already verified operational topics.
  const reports = useQueries({ queries: groups.map(queryIds => {
    const topicGranted = storySectionsForTopics(queryIds, hasAccess);
    const period = periodByTopic[queryIds[0]] ?? 'month';
    return { queryKey: ['campi-panorama-story', userId, queryIds.join('|'), topicGranted.join('|'), asOf, period, queryIds.includes('servicios_pendientes') ? 'resolution-range-v2' : queryIds.includes('clientes_cobertura_posventa') ? `coverage-unified-v2:${unifiedCoverageEnabled()}:${import.meta.env.VITE_CAMPI_COVERAGE_RUBROS_ENABLED === 'true'}` : 'billing-coverage-v2'],
      queryFn: () => loadPanoramaStories(queryIds, topicGranted, asOf, period), retry: false, throwOnError: false,
      enabled: Boolean(userId), staleTime: 60_000 };
  }) });
  const loading = reports.some(report => report.isLoading);
  const fetching = reports.some(report => report.isFetching);
  const failed = reports.some(report => report.isError);
  const retry = () => reports.forEach(report => { if (report.isError || report.data?.some(story => story.status === 'error')) void report.refetch(); });
  // Re-check every contributing section when permissions change; never display stale aggregates.
  const stories: PanoramaStory[] = selected.map(id => {
    const report = reportFor(id);
    const story = report.data?.find(item => item.id === id && item.sections.length > 0 && item.sections.every(hasAccess));
    if (story) return story;
    const topic = available.find(item => item.id === id)!;
    return { id, title: topic.title, question: topic.question, status: 'error', message: report.isError ? 'No se pudo consultar la fuente de este tema.' : 'La fuente no devolvió una respuesta completa.', scope: '', sections: topic.sections.filter(hasAccess), cutoff: null, periodLabel: 'Corte no disponible', primary: null, supporting: [], chart: null, breakdown: [], details: [], source: 'Fuente no disponible', route: '' };
  });
  useEffect(() => {
    if (reviewing || recorded.current === userId || !reports.every(report => report.isSuccess) || !selected.length || stories.length !== selected.length || stories.some(story => story.status === 'error')) return;
    saveStoryVisit(userId, stories);
    recorded.current = userId;
  }, [userId, reports, selected.length, stories, reviewing]);
  return <PageShell className="panorama-dashboard space-y-0">
    <PageHeader className="panorama-page-header" title={<>Hola <span className="panorama-greeting-name">{greetingName}</span>! Este es tu panorama:</>} actions={<div className="flex items-center gap-2">
      {!reviewing && <Button variant="outline" size="sm" className="panorama-edit" onClick={onEdit}><Settings2 className="mr-2 h-4 w-4" />Editar prioridades</Button>}
    </div>} />
    {reviewing ? <div className="flex flex-wrap items-center gap-3">
      <label htmlFor="panorama-review-topic" className="text-sm font-medium">Tema a revisar</label>
      <select id="panorama-review-topic" className="h-9 max-w-full rounded-md border border-input bg-background px-3 text-sm" value={selected[0] ?? ''} onChange={event => { setDetailOpen(null); setOpenStory(null); setReviewTopic(event.target.value as StoryTopicId); }}>
        {!selected.length && <option value="" disabled>Sin acceso al tema</option>}
        {reviewable.map(topic => <option key={topic.id} value={topic.id}>{topic.label}</option>)}
      </select>
      <span className="text-sm text-muted-foreground">Revisión local · no cambia tus prioridades</span>
    </div> : <BusinessCampi key={userId} userId={userId} stories={stories.map(story=>scopedSalesStory(story,salesScopeFor(story.id)))} hasAccess={hasAccess} loading={loading} failed={failed || stories.some(s=>s.status==='error')} />}    {failed && <div role="alert" className="panorama-source-error"><p>No se pudo consultar una fuente. Cada prioridad conserva su lugar para que puedas reintentarla.</p><Button variant="outline" disabled={fetching} onClick={retry}><RefreshCw className="mr-2 h-4 w-4" />Reintentar</Button></div>}
    <div className={`panorama-stories${reviewing ? ' panorama-stories--review' : ''}`}>{selected.map((id, index) => reportFor(id)?.isLoading
      ? <PanoramaLoadingCard key={id} index={index} label={available.find(topic => topic.id === id)?.label ?? id} />
      : ['servicios_os_facturadas', 'servicios_pendientes', 'ventas_evolucion', 'ventas_facturacion', 'maquinas_pedidos', 'repuestos_stock', 'repuestos_alertas', 'agenda_cumplimiento', 'servicios_productividad', 'servicios_eficiencia', 'clientes_retencion', 'clientes_cobertura_posventa'].includes(id) ? <ApprovedPanoramaCard salesScope={salesScopeFor(id)} onSalesScopeChange={sections=>setScopeChoice(previous=>({user:userId,topics:{...(previous.user===userId?previous.topics:{}),[id]:sections}}))} key={id === 'ventas_evolucion' ? `${id}:${userId}:${granted.join('|')}` : id} story={stories[index]} index={index} retrying={reportFor(id)?.isFetching ?? false} onRetry={() => void reportFor(id).refetch()} openSignal={openStory?.id === id ? openStory.token : 0} onSelectorOpenChange={open => setDetailOpen(current => open ? id : current === id ? null : current)} periodMode={periodByTopic[id] ?? 'month'} onPeriodChange={mode => setPeriodByTopic(previous => ({ ...previous, [id]: mode }))} />
      : <PanoramaStoryCard key={id} story={stories[index]} index={index} retrying={reportFor(id)?.isFetching ?? false} onRetry={() => void reportFor(id).refetch()} openSignal={openStory?.id === id ? openStory.token : 0} onSelectorOpenChange={open => setDetailOpen(current => open ? id : current === id ? null : current)} periodMode={periodByTopic[id] ?? 'month'} onPeriodChange={mode => setPeriodByTopic(previous => ({ ...previous, [id]: mode }))} />)}</div>
    {!selected.length && <Button variant="outline" onClick={onEdit}>Elegir temas para Panorama</Button>}
  </PageShell>;
}
