import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bookmark, RefreshCw, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, PageShell } from '@/components/layout/AppPrimitives';
import type { SectionKey } from '@/lib/permissions';
import { loadPanoramaStories, storySectionsForTopics } from '@/lib/campi/panoramaStories';
import type { PanoramaTopic, PanoramaTopicId } from '@/lib/campi/panoramaPreferences';
import type { StoryTopicId } from '@/lib/campi/panoramaStoryTypes';
import { CampiInterpreter } from './CampiInterpreter';
import { StoryPanel } from './StoryPanel';
import { readStoryVisit, saveStoryVisit, storyVisitChange } from '@/lib/campi/panoramaStoryVisits';
import './panorama-dashboard.css';

const today = () => { const date = new Date(); return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-'); };

export function PanoramaDashboard({ userId, topics, available, hasAccess, onEdit }: {
  userId: string; topics: readonly PanoramaTopicId[]; available: readonly PanoramaTopic[];
  hasAccess: (section: SectionKey) => boolean; onEdit: () => void;
}) {
  const asOf = useMemo(today, []);
  const previous = useMemo(() => readStoryVisit(userId), [userId]);
  const recorded = useRef<string | null>(null);
  const selected = topics.filter(id => available.some(topic => topic.id === id && topic.sections.some(hasAccess))) as StoryTopicId[];
  const granted = storySectionsForTopics(selected, hasAccess);
  const report = useQuery({ queryKey: ['campi-panorama-stories', userId, selected.join('|'), granted.join('|'), asOf],
    queryFn: () => loadPanoramaStories(selected, granted, asOf), retry: false, throwOnError: false, enabled: Boolean(userId) && selected.length > 0, staleTime: 60_000 });
  // Re-check every contributing section when permissions change; never display stale aggregates.
  const stories = selected.flatMap(id => (report.data ?? []).filter(story => story.id === id && story.sections.length > 0 && story.sections.every(hasAccess)));
  useEffect(() => {
    if (recorded.current === userId || !report.isSuccess || !selected.length || stories.length !== selected.length || stories.some(story => story.status === 'error')) return;
    saveStoryVisit(userId, stories);
    recorded.current = userId;
  }, [userId, report.isSuccess, selected.length, stories]);
  return <PageShell className="panorama-dashboard max-w-[1440px] space-y-3">
    <PageHeader className="panorama-page-header" title="Panorama" actions={<Button variant="outline" size="sm" className="panorama-edit" onClick={onEdit}><Settings2 className="mr-2 h-4 w-4" />Editar prioridades</Button>} />
    <CampiInterpreter key={`${userId}:${selected.join('|')}:${granted.join('|')}`} stories={stories} loading={report.isLoading} previous={previous} />
    {report.isError && <div role="alert" className="panorama-source-error"><p>No se pudo cargar Panorama. No hay cifras verificadas para esta consulta.</p><Button variant="outline" disabled={report.isFetching} onClick={() => void report.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Reintentar</Button></div>}
    {report.isLoading && <div role="status" className="panorama-loading">Cargando indicadores y comparaciones…</div>}
    {selected.length > 4 && <p className="panorama-extra-topics">Elegiste {selected.length} temas. Se muestran todos; desplazate para ver los siguientes. Con cuatro, el panorama cabe en una pantalla de escritorio.</p>}
    {!!selected.length && <div className="panorama-priorities-heading"><Bookmark aria-hidden="true" /><h2>Tus prioridades</h2></div>}
    <div className="panorama-stories">{stories.map((story, index) => <StoryPanel key={story.id} story={story} index={index} visitChange={storyVisitChange(story, previous)} retrying={report.isFetching} onRetry={() => void report.refetch()} />)}</div>
    {report.isSuccess && selected.some(id => !stories.some(story => story.id === id)) && <div role="alert" className="panorama-source-error"><p>Hay temas sin una respuesta autorizada. Reintentá para recuperar su información.</p><Button variant="outline" disabled={report.isFetching} onClick={() => void report.refetch()}>Reintentar temas</Button></div>}
    {!selected.length && <Button variant="outline" onClick={onEdit}>Elegir temas para Panorama</Button>}
  </PageShell>;
}
