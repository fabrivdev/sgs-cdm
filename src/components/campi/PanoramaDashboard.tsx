import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Bookmark, RefreshCw, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, PageShell } from '@/components/layout/AppPrimitives';
import type { SectionKey } from '@/lib/permissions';
import { loadPanoramaStories, storySectionsForTopics } from '@/lib/campi/panoramaStories';
import type { PanoramaTopic, PanoramaTopicId } from '@/lib/campi/panoramaPreferences';
import type { PanoramaStory, StoryTopicId } from '@/lib/campi/panoramaStoryTypes';
import { CampiInterpreter } from './CampiInterpreter';
import { StoryPanel } from './StoryPanel';
import { readStoryVisit, saveStoryVisit, storyVisitChange } from '@/lib/campi/panoramaStoryVisits';
import './panorama-dashboard.css';

const today = () => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Asuncion', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

export function PanoramaDashboard({ userId, topics, available, hasAccess, onEdit }: {
  userId: string; topics: readonly PanoramaTopicId[]; available: readonly PanoramaTopic[];
  hasAccess: (section: SectionKey) => boolean; onEdit: () => void;
}) {
  const asOf = useMemo(today, []);
  const previous = useMemo(() => readStoryVisit(userId), [userId]);
  const recorded = useRef<string | null>(null);
  const [openStory, setOpenStory] = useState<{ id: StoryTopicId; token: number } | null>(null);
  const selected = topics.filter(id => available.some(topic => topic.id === id && topic.sections.some(hasAccess))) as StoryTopicId[];
  const granted = storySectionsForTopics(selected, hasAccess);
  const salesIds = selected.filter(id => id === 'ventas_evolucion' || id === 'ventas_facturacion');
  const partsIds = selected.filter(id => id === 'repuestos_stock' || id === 'repuestos_alertas' || id === 'repuestos_concentracion');
  const serviceIds = selected.filter(id => id === 'servicios_pendientes' || id === 'servicios_abiertas');
  const groups = selected.reduce<StoryTopicId[][]>((result, id) => {
    const ids = salesIds.includes(id) ? salesIds : partsIds.includes(id) ? partsIds : serviceIds.includes(id) ? serviceIds : [id];
    if (!result.some(group => group[0] === ids[0])) result.push(ids);
    return result;
  }, []);
  const reportFor = (id: StoryTopicId) => reports[groups.findIndex(group => group.includes(id))];
  // Keep the four chosen positions stable while independent sources resolve.
  // A slow sales report must not hold back already verified operational topics.
  const reports = useQueries({ queries: groups.map(queryIds => {
    const topicGranted = storySectionsForTopics(queryIds, hasAccess);
    return { queryKey: ['campi-panorama-story', userId, queryIds.join('|'), topicGranted.join('|'), asOf],
      queryFn: () => loadPanoramaStories(queryIds, topicGranted, asOf), retry: false, throwOnError: false,
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
    return { id, title: topic.label, question: topic.question, status: 'error', message: report.isError ? 'No se pudo consultar la fuente de este tema.' : 'La fuente no devolvió una respuesta completa.', scope: '', sections: topic.sections.filter(hasAccess), cutoff: null, periodLabel: 'Corte no disponible', primary: null, supporting: [], chart: null, breakdown: [], details: [], source: 'Fuente no disponible', route: '' };
  });
  useEffect(() => {
    if (recorded.current === userId || !reports.every(report => report.isSuccess) || !selected.length || stories.length !== selected.length || stories.some(story => story.status === 'error')) return;
    saveStoryVisit(userId, stories);
    recorded.current = userId;
  }, [userId, reports, selected.length, stories]);
  return <PageShell className="panorama-dashboard max-w-[1440px] space-y-3">
    <PageHeader className="panorama-page-header" title="Panorama" actions={<Button variant="outline" size="sm" className="panorama-edit" onClick={onEdit}><Settings2 className="mr-2 h-4 w-4" />Editar prioridades</Button>} />
    <CampiInterpreter key={`${userId}:${selected.join('|')}:${granted.join('|')}`} userId={userId} stories={stories} loading={loading} previous={previous} onOpenStory={id => setOpenStory(current => ({ id, token: (current?.token ?? 0) + 1 }))} />
    {failed && <div role="alert" className="panorama-source-error"><p>No se pudo consultar una fuente. Cada prioridad conserva su lugar para que puedas reintentarla.</p><Button variant="outline" disabled={fetching} onClick={retry}><RefreshCw className="mr-2 h-4 w-4" />Reintentar</Button></div>}
    {!!selected.length && <div className="panorama-priorities-heading"><Bookmark aria-hidden="true" /><h2>Tus prioridades</h2></div>}
    <div className="panorama-stories">{selected.map((id, index) => reportFor(id)?.isLoading
      ? <article key={id} className="panorama-story panorama-story-loading" role="status" aria-label={`Consultando ${available.find(topic => topic.id === id)?.label ?? id}`}><header className="story-header"><span className="story-index">{String(index + 1).padStart(2, '0')}</span><div className="story-heading-text"><h2>{available.find(topic => topic.id === id)?.label ?? id}</h2></div></header><span className="panorama-loading">Consultando…</span></article>
      : <StoryPanel key={id} story={stories[index]} index={index} visitChange={storyVisitChange(stories[index], previous)} retrying={reportFor(id)?.isFetching ?? false} onRetry={() => void reportFor(id).refetch()} openSignal={openStory?.id === id ? openStory.token : 0} />)}</div>
    {!selected.length && <Button variant="outline" onClick={onEdit}>Elegir temas para Panorama</Button>}
  </PageShell>;
}
